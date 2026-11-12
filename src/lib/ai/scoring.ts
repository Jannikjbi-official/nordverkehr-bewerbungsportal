/**
 * KI-Punkte für den Bewertungsbogen: dieselben Kriterien wie beim Team,
 * mit kurzer Begründung. Nur Einschätzung – fließt NICHT in den Team-Schnitt
 * ein, entscheiden tut das Team. Nur für Bewerbungen, deren Einwilligung die
 * Punktevergabe abdeckt (AI_SCORE_CONSENT). Bei Verdacht auf Manipulation
 * (Prompt Injection) vergibt die KI keine Punkte.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/config";
import { budgetLeft, callAi, loadApplicationContext } from "@/lib/ai/service";
import { SCORE_RULES, buildScorePrompt, parseAiRating, type AiRating } from "@/lib/ai/prompts";
import { aiScoreAllowed } from "@/lib/applications/form";

export type StoredAiRating = AiRating | { blocked: "manipulation" | "unreadable" };

export function readAiRating(value: unknown): StoredAiRating | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.blocked === "manipulation" || v.blocked === "unreadable") return { blocked: v.blocked };
  if (v.scores && typeof v.scores === "object") return v as unknown as AiRating;
  return null;
}

export async function scoreApplication(applicationId: string, opts: { actorId?: string | null; force?: boolean } = {}) {
  const settings = await getSettings();
  if (!settings["ai.enabled"] || !isAiConfigured()) return null;
  if (!opts.force && !settings["ai.autoScoreEnabled"]) return null;
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { consentVersion: true, status: true, aiConsentOverrideAt: true } });
  if (!app || app.status === "DRAFT" || !aiScoreAllowed(app)) return null;
  if (!(await budgetLeft(settings))) return null;

  const ctx = await loadApplicationContext(applicationId, settings);
  let stored: StoredAiRating;
  if (ctx.suspicious.length) {
    stored = { blocked: "manipulation" };
  } else {
    const res = await callAi({
      feature: "score",
      userId: opts.actorId ?? null,
      settings,
      system: `${SCORE_RULES}\n\nTONALITÄT (nachrangig):\n${settings["ai.systemPrompt"]}`,
      prompt: buildScorePrompt(ctx),
    });
    stored = (!res.refused && parseAiRating(res.text)) || { blocked: "unreadable" };
  }
  await db.application.update({ where: { id: applicationId }, data: { aiRating: stored as unknown as Prisma.InputJsonValue, aiRatedAt: new Date() } });
  return stored;
}

/** Sperre gegen doppelte Aufrufe (mehrere Teammitglieder öffnen gleichzeitig) – läuft nach 1 h ab. */
const LOCK_MS = 3_600_000;

/** Ist die Bewertung gerade unterwegs (reserviert, aber noch kein Ergebnis)? */
export function isScoringPending(app: { aiRating: unknown; aiRatedAt: Date | null }, now = new Date()) {
  return !readAiRating(app.aiRating) && !!app.aiRatedAt && now.getTime() - app.aiRatedAt.getTime() < LOCK_MS;
}

/** Bewerbung zum Bewerten reservieren. true = diese Instanz darf bewerten. */
export async function claimForScoring(applicationId: string, now = new Date()) {
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { aiRating: true, consentVersion: true, aiConsentOverrideAt: true } });
  if (!app || readAiRating(app.aiRating) || !aiScoreAllowed(app)) return false;
  const res = await db.application.updateMany({
    where: { id: applicationId, OR: [{ aiRatedAt: null }, { aiRatedAt: { isSet: false } }, { aiRatedAt: { lt: new Date(now.getTime() - LOCK_MS) } }] },
    data: { aiRatedAt: now },
  });
  return res.count === 1;
}

/** Fehlende KI-Punkte nachholen (offene Bewerbungen, älteste zuerst). */
export async function scoreMissing(limit = 2) {
  const settings = await getSettings();
  if (!settings["ai.enabled"] || !settings["ai.autoScoreEnabled"] || !isAiConfigured()) return 0;
  const { ACTIVE_STATUSES } = await import("@/lib/applications/status");
  const candidates = await db.application.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    select: { id: true, aiRating: true, consentVersion: true, aiConsentOverrideAt: true },
    orderBy: { submittedAt: "asc" },
    take: 200,
  });
  let done = 0;
  for (const c of candidates) {
    if (done >= limit) break;
    if (readAiRating(c.aiRating) || !aiScoreAllowed(c)) continue;
    if (!(await claimForScoring(c.id))) continue;
    if (await scoreApplication(c.id).catch((e) => (console.error("[ai-score]", e), null))) done++;
  }
  return done;
}
