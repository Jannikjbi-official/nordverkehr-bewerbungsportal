/**
 * Gesprächstermin abgleichen – nach jeder Änderung an Termin, Status oder Betreuer:
 *  - Discord-Server-Event („Bewerbungsgespräch · Support (NV-…)“) anlegen, verschieben
 *    oder löschen (Einstellung interview.discordEvent; Bot braucht „Events verwalten“).
 *    Ohne Bewerbernamen – Events sieht der ganze Server.
 *  - Erinnerungs-DM an den Betreuer X Minuten vorher planen (Outbox mit runAt) bzw.
 *    die alte Planung verwerfen. Pünktlich zugestellt wird sie vom Worker; ohne Worker
 *    beim nächsten Besuch im Team-Bereich.
 * Fehler bei Discord werden nur protokolliert – der Termin selbst steht im Portal.
 */
import { db } from "@/lib/db";
import { enqueue } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage, discordTime } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

const MIN = 60_000;

export async function syncInterview(applicationId: string, now = new Date()) {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { position: { select: { title: true } }, slot: { select: { durationMin: true } }, claimedBy: { select: { id: true, discordId: true, globalName: true, username: true } } },
  });
  if (!app) return;
  const s = await getSettings();
  const active = app.status === "INTERVIEW" && !!app.interviewAt && app.interviewAt.getTime() > now.getTime();
  const start = app.interviewAt;
  const end = start ? new Date(start.getTime() + (app.slot?.durationMin ?? 30) * MIN) : null;

  // ── Discord-Event
  const guildId = process.env.DISCORD_GUILD_ID;
  if (guildId && (app.discordEventId || (active && s["interview.discordEvent"]))) {
    try {
      const { getDiscordApi } = await import("@/lib/discord/client");
      const api = getDiscordApi();
      const event = {
        name: `Bewerbungsgespräch · ${app.position.title}`,
        description: `Bewerbung ${app.publicId ?? ""} – Details im Team-Bereich: ${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
        location: "Discord – Sprachkanal Bewerbungsgespräche",
        channelId: s["interview.voiceChannelId"] || null,
        start: start!,
        end: end!,
      };
      if (active && s["interview.discordEvent"]) {
        if (app.discordEventId && api.updateEvent) await api.updateEvent(guildId, app.discordEventId, event);
        else if (api.createEvent) {
          const id = await api.createEvent(guildId, event);
          await db.application.update({ where: { id: app.id }, data: { discordEventId: id } });
        }
      } else if (app.discordEventId) {
        if (api.deleteEvent) await api.deleteEvent(guildId, app.discordEventId);
        await db.application.update({ where: { id: app.id }, data: { discordEventId: null } });
      }
    } catch (e) {
      console.error("[interview-event]", e);
    }
  }

  // ── Erinnerung an den Betreuer: alte Planung verwerfen, ggf. neu planen
  if (app.teamReminderJobId) {
    await db.outboxJob.deleteMany({ where: { id: app.teamReminderJobId, status: "PENDING" } });
  }
  let jobId: string | null = null;
  const minutes = s["interview.teamReminderMinutes"];
  if (active && minutes > 0 && app.claimedBy && start) {
    const runAt = new Date(Math.max(now.getTime(), start.getTime() - minutes * MIN));
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: app.claimedBy.discordId,
        purpose: "team_reminder",
        message: buildApplicantMessage({
          title: `Gleich: Gespräch ${app.publicId ?? ""}`,
          body: `Moin ${app.claimedBy.globalName || app.claimedBy.username}, um **${discordTime(start, "t")} Uhr** (${discordTime(start, "R")}) ist das Gespräch für **${app.position.title}** (${app.publicId}). Protokoll und Fragen findest du in der Bewerbung.`,
          statusUrl: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
          buttonLabel: "Zur Bewerbung",
        }),
      },
      { applicationId: app.id, runAt },
    );
    jobId = job.id;
  }
  if (jobId !== app.teamReminderJobId) await db.application.update({ where: { id: app.id }, data: { teamReminderJobId: jobId } });
}

/** Im Hintergrund abgleichen (nach der Antwort), Fehler nur protokollieren. */
export function syncInterviewLater(applicationId: string) {
  return syncInterview(applicationId).catch((e) => console.error("[interview-sync]", e));
}
