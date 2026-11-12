/**
 * KI-Text-Check direkt nach dem Absenden: feste Regeln (immer) + Einschätzung
 * der KI (wenn aktiv und von der Einwilligung gedeckt). Ergebnis landet nur
 * beim Team – als Hinweis, nie als Entscheidung. Bei „hoch“ gibt es eine
 * Zeile im Bot-Log.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/config";
import { budgetLeft, callAi, loadApplicationContext } from "@/lib/ai/service";
import { applicationBlock } from "@/lib/ai/prompts";
import { allowsAiTextCheck, formatAnswerForDisplay, type AnswerValue } from "@/lib/applications/form";
import { botLog } from "@/lib/discord/botlog";
import { runOutbox } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { combineLevels, levelFromScore, parseAiTextCheck, ruleSignals, type TextCheckResult } from "@/lib/ai/textcheck-rules";

const TEXT_TYPES = new Set(["SHORT_TEXT", "LONG_TEXT", "SCENARIO"]);

const AI_PROMPT = (data: string) =>
  `${data}\n\nSchätze ein, ob die Antworten wahrscheinlich mit einem KI-Chatbot (z. B. ChatGPT) geschrieben oder stark überarbeitet wurden.\n` +
  `Achte auf: auffällig glatte, generische Sprache ohne persönliche Details; gleichförmiger Aufbau; Floskeln; Antworten, die die Frage wiederholen; fehlende Tippfehler bei sonst lockerem Ton; Wissen, das nicht zur Person passt.\n` +
  `Wichtig: Gute Rechtschreibung allein ist KEIN Hinweis. Menschen schreiben auch sauber. Sei vorsichtig – im Zweifel „niedrig“ oder „mittel“.\n` +
  `Antworte ausschließlich mit JSON: {"stufe":"niedrig|mittel|hoch","gruende":["kurzer Grund mit Bezug auf eine Antwort", "…"]} (max. 3 Gründe).`;

export async function checkApplicationText(applicationId: string, opts: { pastes?: Record<string, number>; actorId?: string | null } = {}) {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { id: true, publicId: true, status: true, consentVersion: true, aiConsentOverrideAt: true, position: { select: { title: true } }, answers: { select: { questionId: true, label: true, type: true, value: true } } },
  });
  if (!app || app.status === "DRAFT") return null;

  const answers = app.answers
    .filter((a) => TEXT_TYPES.has(a.type))
    .map((a) => ({ questionId: a.questionId ?? "", label: a.label, text: formatAnswerForDisplay(a.type, a.value as AnswerValue) }));
  const rules = ruleSignals(answers, opts.pastes ?? {});
  const result: TextCheckResult = { level: levelFromScore(rules.score), signals: rules.signals, aiUsed: false };

  // KI-Einschätzung (nur mit passender Einwilligung, KI an, Budget da)
  const settings = await getSettings();
  if (settings["ai.enabled"] && isAiConfigured() && (allowsAiTextCheck(app.consentVersion) || !!app.aiConsentOverrideAt) && (await budgetLeft(settings))) {
    const ctx = await loadApplicationContext(applicationId, settings);
    if (!ctx.suspicious.length) {
      const res = await callAi({ feature: "textcheck", userId: opts.actorId ?? null, settings, system: settings["ai.systemPrompt"], prompt: AI_PROMPT(applicationBlock(ctx)) });
      const ai = res.refused ? null : parseAiTextCheck(res.text);
      if (ai) {
        result.aiUsed = true;
        result.level = combineLevels(result.level, ai.level);
        result.signals.push(...ai.reasons.map((text) => ({ source: "ki" as const, text })));
      }
    }
  }

  await db.application.update({
    where: { id: applicationId },
    data: { aiTextCheck: result as unknown as Prisma.InputJsonValue, aiTextCheckedAt: new Date() },
  });
  await db.auditLog.create({ data: { actorId: opts.actorId ?? null, action: "application.textcheck", targetType: "application", targetId: applicationId, meta: { level: result.level } } });

  if (result.level === "hoch" && !opts.actorId) {
    const job = await botLog(`🤖 **${app.publicId}** (${app.position.title}): Antworten wirken **KI-geschrieben** – nur ein Hinweis, kein Beweis. Im Gespräch nachfragen.`, {
      applicationId,
      tone: "warn",
      url: `${publicEnv.appUrl}/team/bewerbungen/${applicationId}`,
    });
    if (job) await runOutbox({ ids: [job] }).catch(() => {});
  }
  return result;
}
