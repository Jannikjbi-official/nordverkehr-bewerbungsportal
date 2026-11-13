/**
 * Ideen-Sammlung: Ideen, Feedback und Fehlermeldungen von allen, die eingeloggt
 * sind (Bewerber und Team). Admins sichten sie im Admin-Bereich, setzen einen
 * Status und können kurz antworten – die Person sieht das unter /ideen und
 * bekommt bei „Geplant“, „Umgesetzt“ und „Nicht geplant“ eine DM.
 */
import type { PrismaClient, SuggestionKind, SuggestionStatus } from "@prisma/client";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { enqueue } from "@/lib/discord/outbox-db";
import { botLog, esc } from "@/lib/discord/botlog";
import { buildApplicantMessage, buildBotLogMessage } from "@/lib/messages/embed";
import { KIND_EMOJI, KIND_LABEL, STATUS_LABEL } from "@/lib/suggestion-labels";

export * from "@/lib/suggestion-labels";

/** Bei diesen Status bekommt die Person eine DM */
const NOTIFY_ON: SuggestionStatus[] = ["PLANNED", "DONE", "DECLINED"];

export const suggestionSchema = z.object({
  kind: z.enum(["IDEA", "FEEDBACK", "BUG"]),
  title: z.string().trim().min(4, "Bitte einen kurzen Titel (mind. 4 Zeichen).").max(120, "Titel bitte kürzer (max. 120 Zeichen)."),
  body: z.string().trim().min(10, "Beschreib es bitte etwas genauer (mind. 10 Zeichen).").max(3000, "Bitte kürzer (max. 3000 Zeichen)."),
  location: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
});
export type SuggestionInput = z.input<typeof suggestionSchema>;

export type SuggestionResult = { ok: true; id: string; jobIds: string[] } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createSuggestion(db: PrismaClient, user: { id: string; username: string; globalName: string | null; isTeam?: boolean }, input: SuggestionInput): Promise<SuggestionResult> {
  const p = suggestionSchema.safeParse(input);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Bitte prüf deine Eingaben.", fieldErrors };
  }
  const rl = await rateLimit(`suggest:${user.id}`, 5, 3600);
  if (!rl.ok) return { ok: false, error: "Du hast gerade schon einiges eingereicht – danke! Bitte versuch es in einer Stunde wieder." };

  const d = p.data;
  const s = await db.suggestion.create({
    data: { kind: d.kind, title: d.title, body: d.body, location: d.kind === "BUG" ? (d.location ?? null) : null, authorId: user.id },
  });

  // Hinweis an die Leitung (Admins entscheiden). Ohne Leitungs-Chat nur ein
  // Hinweis ohne Inhalt ins Bot-Log – das sieht das ganze Team, Einreichungen sind aber nur für Admins
  const name = user.globalName || user.username;
  const url = `${publicEnv.appUrl}/team/admin/ideen#${s.id}`;
  const lead = (await getSettings())["discord.leadChannelId"];
  const tone = d.kind === "BUG" ? "warn" : "default";
  const job = lead
    ? (
        await enqueue({
          type: "CHANNEL_MESSAGE",
          kind: "summary",
          channelId: lead,
          message: buildBotLogMessage(`${KIND_EMOJI[d.kind]} **${KIND_LABEL[d.kind]}** von ${esc(name)}${user.isTeam ? " (Team)" : ""}: „${esc(d.title)}“`, { url, tone }),
        })
      ).id
    : await botLog(`${KIND_EMOJI[d.kind]} Neue Einreichung unter „Ideen & Fehler“ (${KIND_LABEL[d.kind]}) – für Admins im Admin-Bereich`, { url, tone });
  return { ok: true, id: s.id, jobIds: job ? [job] : [] };
}

export const updateSchema = z.object({
  id: z.string().min(10).max(40),
  status: z.enum(["NEW", "REVIEWING", "PLANNED", "DONE", "DECLINED"]),
  adminNote: z.string().trim().max(1000).optional(),
  notify: z.boolean().default(true),
});

/** Admin: Status/Antwort setzen. Bei Geplant/Umgesetzt/Nicht geplant optional DM an die Person. */
export async function updateSuggestion(db: PrismaClient, adminId: string, input: z.input<typeof updateSchema>): Promise<{ ok: true; jobIds: string[] } | { ok: false; error: string }> {
  const p = updateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Ungültige Eingabe." };
  const before = await db.suggestion.findUnique({ where: { id: p.data.id }, include: { author: true } });
  if (!before) return { ok: false, error: "Eintrag nicht gefunden." };
  const note = p.data.adminNote || null;
  await db.suggestion.update({ where: { id: before.id }, data: { status: p.data.status, adminNote: note, handledById: adminId } });

  const statusChanged = before.status !== p.data.status;
  const jobIds: string[] = [];
  if (statusChanged && p.data.notify && NOTIFY_ON.includes(p.data.status) && before.author) {
    const job = await enqueue({
      type: "DM",
      discordUserId: before.author.discordId,
      // „status“ = automatische Info (nicht „notify“ – das sind die Rundmails „Stelle offen“)
      purpose: "status",
      message: buildApplicantMessage({
        title: `${KIND_SUBJECT[before.kind]}: ${STATUS_LABEL[p.data.status]}`,
        body: notifyText(before.author.globalName || before.author.username, before.kind, before.title, p.data.status, note),
        statusUrl: `${publicEnv.appUrl}/ideen#${before.id}`,
        buttonLabel: "Ansehen",
      }),
    });
    jobIds.push(job.id);
  }
  return { ok: true, jobIds };
}

/** Betreff der DM: „Deine Idee“, „Dein Feedback“, „Deine Fehlermeldung“ */
const KIND_SUBJECT: Record<SuggestionKind, string> = { IDEA: "Deine Idee", FEEDBACK: "Dein Feedback", BUG: "Deine Fehlermeldung" };

export function notifyText(name: string, kind: SuggestionKind, title: string, status: SuggestionStatus, note: string | null) {
  const what = `${KIND_SUBJECT[kind]} **„${title}“**`;
  const it = kind === "FEEDBACK" ? "es" : "sie";
  const line =
    status === "DONE"
      ? kind === "BUG"
        ? `${what} ist erledigt – der Fehler ist behoben. Danke fürs Melden!`
        : `${what} ist umgesetzt. Danke für den Anstoß!`
      : status === "PLANNED"
        ? `${what}: Haben wir uns angeschaut und eingeplant. Wann genau es kommt, können wir noch nicht sagen.`
        : `${what}: Haben wir uns angeschaut – umsetzen werden wir ${it} vorerst nicht. Trotzdem danke!`;
  return `Moin ${name},\n\n${line}${note ? `\n\n**Anmerkung vom Team:** ${note}` : ""}`;
}
