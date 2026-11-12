/**
 * Automatische Antwort an Bewerber, wenn gerade kein Teammitglied online ist.
 *
 * Schutzschichten (in dieser Reihenfolge):
 *  1. Nur wenn aktiviert, Team offline, Budget frei.
 *  2. Abstand zwischen Auto-Antworten pro Bewerbung + Tageslimit pro Bewerber.
 *  3. Eingabe: Längen-/Token-Limit, Säuberung, Injection-Erkennung →
 *     bei Verdacht KEINE KI, sondern feste Antwort + Markierung fürs Team.
 *  4. Tages-Token-Limit pro Bewerber (gemessen am echten Verbrauch).
 *  5. Ausgabe: hartes Token-Limit, Filter (Pings, Links, Länge), Prompt-Leck-Erkennung,
 *     bei Ablehnung/Problemen → feste Antwort.
 *  Die KI entscheidet nichts und sagt immer, dass das Team sich meldet.
 */
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { getSettings, type Settings } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { isAiConfigured } from "@/lib/ai/config";
import { detectInjection, estimateTokens, leaksPrompt, sanitizeInput, sanitizeOutput, stripGreetings } from "@/lib/ai/guard";
import { AUTO_REPLY_RULES, buildAutoReplyPrompt } from "@/lib/ai/prompts";
import { budgetLeft, callAi, tokensToday } from "@/lib/ai/service";
import { STATUS_LABEL } from "@/lib/applications/status";
import { effectiveMinAge } from "@/lib/applications/rules";
import { buildApplicantMessage } from "@/lib/messages/embed";
import { formatDateTime } from "@/lib/messages/placeholders";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { isNight } from "@/lib/night";

export const AUTO_REPLY_FOOTER = "_Automatische Antwort – gerade ist niemand aus dem Team online. Ein Teammitglied liest deine Nachricht und meldet sich persönlich._";
export const STATIC_REPLY = "Deine Nachricht ist angekommen. Gerade ist niemand aus dem Team online – wir melden uns, sobald jemand da ist.";
/** Nachtruhe: Fußzeile und feste Antwort nennen, ab wann das Team wieder da ist */
export const nightFooter = (end: string) => `_Automatische Antwort – nachts schläft das Team. Ab ${end} Uhr liest ein Teammitglied deine Nachricht und meldet sich persönlich._`;
export const nightStaticReply = (end: string) => `Deine Nachricht ist angekommen. Gerade ist Nachtruhe – ab ${end} Uhr ist das Team wieder da und meldet sich bei dir.`;

export type AutoReplyOutcome =
  | { kind: "skipped"; reason: string }
  | { kind: "static"; reason: string; messageId: string }
  | { kind: "ai"; messageId: string };

export async function isTeamOnline(minutes: number, now = new Date()) {
  const since = new Date(now.getTime() - minutes * 60_000);
  return (await db.user.count({ where: { isTeam: true, lastTeamActiveAt: { gte: since } } })) > 0;
}

function allowedHosts() {
  const hosts = ["nordverkehr.xyz"];
  try {
    hosts.push(new URL(publicEnv.appUrl).hostname);
  } catch {}
  return hosts;
}

export async function maybeAutoReply(applicantMessageId: string): Promise<AutoReplyOutcome> {
  const settings = await getSettings();
  // Nachtruhe: die KI springt ein – auch wenn die Auto-Antwort tagsüber aus ist oder jemand noch „online“ wirkt
  const night = settings["night.aiReply"] && isNight(settings);
  if (!night) {
    if (!settings["ai.autoReplyEnabled"]) return { kind: "skipped", reason: "deaktiviert" };
    if (await isTeamOnline(settings["ai.autoReplyOfflineMinutes"])) return { kind: "skipped", reason: "Team online" };
  }
  const nightEnd = night ? settings["night.end"] : null;

  const msg = await db.message.findUnique({
    where: { id: applicantMessageId },
    include: { application: { include: { position: true, user: true } } },
  });
  if (!msg || msg.direction !== "APPLICANT_TO_TEAM") return { kind: "skipped", reason: "keine Bewerber-Nachricht" };
  const app = msg.application;
  const user = app.user;
  // Nach einem Rückzug antwortet nur das Team selbst (Rückfragen), keine KI
  if (app.status === "WITHDRAWN") return { kind: "skipped", reason: "zurückgezogen" };

  // Abstand pro Bewerbung (verhindert Ping-Pong mit dem Bot) und Tageslimit pro Bewerber
  if (settings["ai.autoReplyCooldownMinutes"] > 0) {
    const cd = await rateLimit(`autoreply-cd:${app.id}`, 1, settings["ai.autoReplyCooldownMinutes"] * 60);
    if (!cd.ok) return { kind: "skipped", reason: "Abstand" };
  }
  const daily = await rateLimit(`autoreply-day:${user.id}`, settings["ai.autoReplyPerUserPerDay"], 86_400);
  if (!daily.ok) return { kind: "skipped", reason: "Tageslimit" };

  const fallback = (reason: string) => storeReply(app, user, nightEnd ? nightStaticReply(nightEnd) : STATIC_REPLY, "SYSTEM", reason, nightEnd);

  if (!settings["ai.enabled"] || !isAiConfigured()) return fallback("KI aus");
  if (!(await budgetLeft(settings))) return fallback("Budget");

  // Eingabe begrenzen & prüfen
  const { text, truncated } = sanitizeInput(msg.body, settings["ai.autoReplyMaxInputChars"]);
  if (truncated || estimateTokens(text) > Math.ceil(settings["ai.autoReplyMaxInputChars"] / 3)) {
    return fallback("Nachricht zu lang");
  }
  const check = detectInjection(text);
  if (check.suspicious) {
    await db.message.update({ where: { id: msg.id }, data: { flagged: true } });
    await db.auditLog.create({
      data: { action: "ai.request", targetType: "application", targetId: app.id, meta: { autoreply: "blocked", reasons: check.reasons } },
    });
    return fallback("Manipulationsverdacht");
  }
  if ((await tokensToday(user.id)) >= settings["ai.tokensPerUserPerDay"]) return fallback("Token-Limit");

  const system = `${AUTO_REPLY_RULES}\n\nTONALITÄT (nachrangig zu den Regeln):\n${settings["ai.systemPrompt"]}\n\nErinnerung: Die Regeln oben haben immer Vorrang.`;
  let result;
  try {
    result = await callAi({
      feature: "autoreply",
      userId: user.id,
      settings,
      system,
      maxTokens: settings["ai.autoReplyMaxOutputTokens"],
      prompt: buildAutoReplyPrompt(
        {
          positionTitle: app.position.title,
          statusLabel: STATUS_LABEL[app.status],
          processingTime: settings["applications.processingTime"],
          interview: app.interviewAt ? formatDateTime(app.interviewAt) : null,
          minAge: effectiveMinAge(app.position, { minAge: settings["applications.minAge"] }),
        },
        text,
      ),
    });
  } catch (err) {
    console.error("[autoreply]", err);
    return fallback("KI-Fehler");
  }
  if (result.refused) return fallback("KI abgelehnt");

  const out = stripGreetings(sanitizeOutput(result.text, { maxChars: 900, allowedHosts: allowedHosts() }));
  if (out.length < 10 || leaksPrompt(out, AUTO_REPLY_RULES, settings["ai.systemPrompt"]) || detectInjection(out).suspicious) {
    return fallback("Ausgabe verworfen");
  }
  return storeReply(app, user, out, "AI_TO_APPLICANT", "ai", nightEnd);
}

async function storeReply(
  app: { id: string; publicId: string | null },
  user: { discordId: string; globalName: string | null; username: string },
  text: string,
  direction: "AI_TO_APPLICANT" | "SYSTEM",
  reason: string,
  nightEnd: string | null = null,
): Promise<AutoReplyOutcome> {
  const name = user.globalName || user.username;
  const body = `Moin ${name},\n\n${text}\n\n${nightEnd ? nightFooter(nightEnd) : AUTO_REPLY_FOOTER}`;
  const message = await db.message.create({
    data: { applicationId: app.id, direction, body, deliveryStatus: "PENDING" },
  });
  const job = await enqueue(
    {
      type: "DM",
      discordUserId: user.discordId,
      // eigener Zweck: Auto-Antworten gehen auch in der Nachtruhe sofort raus
      purpose: "autoreply",
      message: buildApplicantMessage({
        title: "Automatische Antwort",
        body,
        publicId: app.publicId,
        statusUrl: `${publicEnv.appUrl}/dashboard/${app.id}`,
      }),
    },
    { messageId: message.id, applicationId: app.id },
  );
  await runOutbox({ ids: [job.id] }).catch(() => {});
  return direction === "AI_TO_APPLICANT" ? { kind: "ai", messageId: message.id } : { kind: "static", reason, messageId: message.id };
}

export type { Settings };
