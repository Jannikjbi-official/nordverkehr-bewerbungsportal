/**
 * Nach der Annahme: Probezeit-Abschluss und Pate.
 *  - Probezeit: bestanden / verlängern (+14 Tage) / beenden (Rollen & Präfix weg, Platz frei)
 *  - Erinnerung an den Betreuer, wenn die Probezeit endet (einmal pro Enddatum)
 *  - Pate: Erinnerung nach 14 Tagen, kurz Rückmeldung zu geben
 */
import type { PrismaClient } from "@prisma/client";
import { enqueue, runOutboxAll } from "@/lib/discord/outbox-db";
import { botLog, esc } from "@/lib/discord/botlog";
import { env, publicEnv } from "@/lib/env";
import { buildApplicantMessage, buildBotLogMessage, discordTime } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

const DAY = 86_400_000;
export const EXTEND_DAYS = 14;
export const MENTOR_FEEDBACK_DAYS = 14;

export type ProbationDecision = "PASSED" | "EXTEND" | "END";
export const PROBATION_LABEL: Record<string, string> = { PASSED: "Probezeit bestanden", ENDED: "Im Team beendet" };

export interface MentorFeedback {
  rating: "good" | "help";
  note: string | null;
  by: string;
  at: string;
}
export function readMentorFeedback(v: unknown): MentorFeedback | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<MentorFeedback>;
  return o.rating === "good" || o.rating === "help" ? { rating: o.rating, note: o.note ?? null, by: String(o.by ?? ""), at: String(o.at ?? "") } : null;
}

/** Neues Ende bei „verlängern“: ab dem späteren von heute und bisherigem Ende. */
export function extendedUntil(current: Date | null, now: Date) {
  return new Date(Math.max(now.getTime(), current?.getTime() ?? 0) + EXTEND_DAYS * DAY);
}

export async function decideProbation(db: PrismaClient, opts: { applicationId: string; decision: ProbationDecision; actor: { id: string; globalName: string | null; username: string }; now?: Date }) {
  const now = opts.now ?? new Date();
  const app = await db.application.findUnique({ where: { id: opts.applicationId }, include: { user: true, position: true } });
  if (!app || app.status !== "ACCEPTED") throw new Error("Nur bei angenommenen Bewerbungen.");
  if (app.probationResult) throw new Error("Die Probezeit ist schon entschieden.");
  const who = opts.actor.globalName || opts.actor.username;
  const name = app.user.globalName || app.user.username;
  const jobIds: string[] = [];

  if (opts.decision === "EXTEND") {
    const until = extendedUntil(app.probationUntil, now);
    await db.application.update({ where: { id: app.id }, data: { probationUntil: until, probationRemindedFor: null } });
    const j = await botLog(`⏳ Probezeit von ${esc(name)} (${app.position.title}) verlängert bis ${discordTime(until, "D")} – von ${esc(who)}`, { applicationId: app.id });
    if (j) jobIds.push(j);
  } else {
    const result = opts.decision === "PASSED" ? "PASSED" : "ENDED";
    const res = await db.application.updateMany({
      where: { id: app.id, OR: [{ probationResult: null }, { probationResult: { isSet: false } }] },
      data: { probationResult: result, probationDecidedAt: now, probationDecidedById: opts.actor.id },
    });
    if (!res.count) throw new Error("Die Probezeit ist schon entschieden.");
    if (result === "ENDED") {
      // Wie eine zurückgenommene Annahme: Rollen & Präfix weg, belegter Platz wieder frei
      const s = await getSettings();
      const guildId = env().DISCORD_GUILD_ID;
      if (s["discord.autoRoleOnAccept"] && guildId) {
        const { acceptRoles, enqueueMemberChanges } = await import("@/lib/discord/roles");
        jobIds.push(
          ...(await db.$transaction((tx) =>
            enqueueMemberChanges(tx, {
              mode: "revert",
              guildId,
              discordUserId: app.user.discordId,
              roles: acceptRoles(app.position, s["discord.acceptExtraRoleIds"]),
              nickPrefix: app.position.nickPrefix,
              fallbackName: name,
              applicationId: app.id,
              publicId: app.publicId,
            }),
          )),
        );
      }
      const { returnSeat } = await import("@/lib/positions/schedule");
      await returnSeat(db, app.id, app.positionId).catch(() => {});
    }
    const j = await botLog(
      result === "PASSED"
        ? `🎉 ${esc(name)} hat die Probezeit als ${app.position.title} bestanden – von ${esc(who)}`
        : `🚪 ${esc(name)} (${app.position.title}) ist nach der Probezeit nicht mehr im Team – von ${esc(who)}`,
      { applicationId: app.id, url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`, tone: result === "ENDED" ? "warn" : "default" },
    );
    if (j) jobIds.push(j);
  }
  await db.auditLog.create({ data: { actorId: opts.actor.id, action: "application.onboarding", targetType: "application", targetId: app.id, meta: { probation: opts.decision } } });
  return { jobIds };
}

/** Morgens: Probezeit endet (heute/vorbei) → DM an den Betreuer; Pate nach 14 Tagen → DM für die Rückmeldung. */
export async function sendProbationReminders(db: PrismaClient, now = new Date()) {
  const ids: string[] = [];
  const base = { status: "ACCEPTED" as const, isTest: { not: true }, OR: [{ probationResult: null }, { probationResult: { isSet: false } }] };
  const due = await db.application.findMany({
    where: { ...base, probationUntil: { not: null, lte: new Date(now.getTime() + DAY) } },
    include: { user: { select: { globalName: true, username: true } }, position: { select: { title: true } }, claimedBy: { select: { discordId: true } } },
    take: 50,
  });
  const s = await getSettings();
  for (const a of due) {
    if (!a.probationUntil || a.probationRemindedFor?.getTime() === a.probationUntil.getTime()) continue;
    const marked = await db.application.updateMany({ where: { id: a.id, probationUntil: a.probationUntil }, data: { probationRemindedFor: a.probationUntil } });
    if (!marked.count) continue;
    const name = a.user.globalName || a.user.username;
    const url = `${publicEnv.appUrl}/team/bewerbungen/${a.id}`;
    // Entscheiden darf die Leitung (Admins) → Hinweis in den Leitungs-Chat, sonst ins Bot-Log
    const line = `⏳ Probezeit von ${esc(name)} (${a.position.title}) endet ${discordTime(a.probationUntil, "R")} – bitte entscheiden: bestanden, +14 Tage oder beenden`;
    const lead = s["discord.leadChannelId"];
    const leadJob = lead
      ? (await enqueue({ type: "CHANNEL_MESSAGE", kind: "summary", channelId: lead, message: buildBotLogMessage(line, { url }) }, { applicationId: a.id })).id
      : await botLog(line, { applicationId: a.id, url });
    if (leadJob) ids.push(leadJob);
    // Betreuer zur Info (er kennt die Person am besten)
    if (a.claimedBy) {
      const job = await enqueue(
        {
          type: "DM",
          discordUserId: a.claimedBy.discordId,
          purpose: "team_reminder",
          message: buildApplicantMessage({
            title: "Probezeit endet",
            body: `Die Probezeit von **${name}** (${a.position.title}) endet ${discordTime(a.probationUntil, "R")}. Die Leitung entscheidet – sag ihr kurz Bescheid, wie es aus deiner Sicht läuft (z. B. als Kommentar in der Bewerbung).`,
            statusUrl: url,
            buttonLabel: "Zur Bewerbung",
          }),
        },
        { applicationId: a.id },
      );
      ids.push(job.id);
    }
  }
  const mentorDue = await db.application.findMany({
    where: { ...base, mentorId: { not: null }, decidedAt: { not: null, lte: new Date(now.getTime() - MENTOR_FEEDBACK_DAYS * DAY) } },
    include: { user: { select: { globalName: true, username: true } }, position: { select: { title: true } } },
    take: 50,
  });
  for (const a of mentorDue) {
    if (a.mentorFeedback || a.mentorRemindedAt || !a.mentorId) continue;
    const mentor = await db.user.findUnique({ where: { id: a.mentorId }, select: { discordId: true } });
    if (!mentor) continue;
    const marked = await db.application.updateMany({ where: { id: a.id, OR: [{ mentorRemindedAt: null }, { mentorRemindedAt: { isSet: false } }] }, data: { mentorRemindedAt: now } });
    if (!marked.count) continue;
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: mentor.discordId,
        purpose: "team_reminder",
        message: buildApplicantMessage({
          title: "Kurze Paten-Rückmeldung",
          body: `Du bist Pate von **${a.user.globalName || a.user.username}** (${a.position.title}) – seit zwei Wochen dabei. Wie läuft's? Gib in der Einarbeitung kurz Bescheid: **läuft gut** oder **braucht Hilfe**.`,
          statusUrl: `${publicEnv.appUrl}/team/bewerbungen/${a.id}`,
          buttonLabel: "Rückmeldung geben",
        }),
      },
      { applicationId: a.id },
    );
    ids.push(job.id);
  }
  if (ids.length) await runOutboxAll(ids).catch(() => {});
  return ids.length;
}
