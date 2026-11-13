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

/** Bewerbung zum Bewerten reservieren. Gibt den Reservierungszeitpunkt zurück (= diese Instanz darf bewerten), sonst null. */
export async function claimForScoring(applicationId: string, now = new Date()): Promise<Date | null> {
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { aiRating: true, consentVersion: true, aiConsentOverrideAt: true } });
  if (!app || readAiRating(app.aiRating) || !aiScoreAllowed(app)) return null;
  const res = await db.application.updateMany({
    where: { id: applicationId, OR: [{ aiRatedAt: null }, { aiRatedAt: { lt: new Date(now.getTime() - LOCK_MS) } }] },
    data: { aiRatedAt: now },
  });
  return res.count === 1 ? now : null;
}

/** Reservierung wieder lösen (nichts bewertet) – sonst hinge „KI bewertet gerade …“ bis zu einer Stunde. */
export async function releaseScoringClaim(applicationId: string, claimedAt: Date) {
  await db.application.updateMany({ where: { id: applicationId, aiRatedAt: claimedAt }, data: { aiRatedAt: null } });
}

/** Reservieren und bewerten; kam kein Ergebnis zustande, wird die Reservierung gelöst. */
export async function claimAndScore(applicationId: string, opts: { actorId?: string | null } = {}) {
  const claimedAt = await claimForScoring(applicationId);
  if (!claimedAt) return null;
  return scoreClaimed(applicationId, claimedAt, opts);
}

/** Bewerten, nachdem `claimForScoring` erfolgreich war. */
export async function scoreClaimed(applicationId: string, claimedAt: Date, opts: { actorId?: string | null } = {}) {
  let res: StoredAiRating | null;
  try {
    res = await scoreApplication(applicationId, opts);
  } catch (e) {
    // KI-Fehler: Sperre bleibt (1 h) – sonst startet jede Ansicht sofort den nächsten Aufruf
    console.error("[ai-score]", e);
    return null;
  }
  // Gar nicht bewertet (KI aus, Budget leer …) → Sperre lösen, damit nichts „hängt“
  if (!res) await releaseScoringClaim(applicationId, claimedAt).catch(() => {});
  return res;
}

/** Warum gerade keine automatischen KI-Punkte möglich sind (null = alles bereit). */
export async function scoringBlockedReason(settings?: Awaited<ReturnType<typeof getSettings>>): Promise<string | null> {
  const s = settings ?? (await getSettings());
  if (!s["ai.enabled"] || !isAiConfigured()) return "Die KI ist ausgeschaltet.";
  if (!s["ai.autoScoreEnabled"]) return null;
  if (!(await budgetLeft(s))) return "Das monatliche KI-Budget ist aufgebraucht – keine automatischen KI-Punkte.";
  return null;
}

/** Fehlende KI-Punkte nachholen (offene Bewerbungen, älteste zuerst). */
export async function scoreMissing(limit = 2, deadline?: number) {
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
    if (done >= limit || (deadline && Date.now() >= deadline)) break;
    if (readAiRating(c.aiRating) || !aiScoreAllowed(c)) continue;
    if (!(await budgetLeft(settings))) break;
    if (await claimAndScore(c.id)) done++;
  }
  return done;
}
