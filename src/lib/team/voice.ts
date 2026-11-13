/**
 * Sprachkanal-Erkennung fürs Bewerbungsgespräch (braucht den Worker mit Discord-Gateway):
 *  - Bewerber betritt den Gesprächskanal → `voiceJoinedAt` (erstes Mal pro Termin)
 *  - Bewerber verlässt ihn → `voiceLeftAt` (Dauer fürs Protokoll)
 *  - Bewerber betritt den Warteraum → einmal DM an den Betreuer (bzw. Bot-Log ohne Betreuer)
 * Nur für Bewerbungen im Status „Gespräch“ mit Termin in der Nähe (±3 Std.).
 */
import type { PrismaClient } from "@prisma/client";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { botLog, esc } from "@/lib/discord/botlog";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage, discordTime } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

const HOUR = 3_600_000;
/** Ab so vielen Minuten nach Beginn ohne Bewerber im Kanal: „Nicht erschienen?“ vorschlagen */
export const NO_SHOW_MINUTES = 10;

/** Zählt ein Zeitstempel zu diesem Termin (und nicht zu einem früheren)? */
export const forThisInterview = (at: Date | null | undefined, interviewAt: Date) => !!at && at.getTime() >= interviewAt.getTime() - 3 * HOUR;

/** Hinweis „Nicht erschienen?“: Termin ist X Minuten vorbei, Bewerber war (für diesen Termin) nicht im Kanal. */
export function noShowSuspected(opts: { interviewAt: Date | null; voiceJoinedAt: Date | null; now: number; tracking: boolean }) {
  if (!opts.tracking || !opts.interviewAt) return false;
  if (opts.now < opts.interviewAt.getTime() + NO_SHOW_MINUTES * 60_000) return false;
  if (opts.now > opts.interviewAt.getTime() + 6 * HOUR) return false;
  return !forThisInterview(opts.voiceJoinedAt, opts.interviewAt);
}

/** „19:02–19:31 (29 Min.)“ bzw. „seit 19:02“ */
export function voiceSummary(joined: Date | null, left: Date | null, interviewAt: Date | null) {
  if (!joined || !interviewAt || !forThisInterview(joined, interviewAt)) return null;
  const t = (d: Date) => d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  if (left && left > joined) return `${t(joined)}–${t(left)} Uhr (${Math.max(1, Math.round((left.getTime() - joined.getTime()) / 60_000))} Min.)`;
  return `seit ${t(joined)} Uhr`;
}

export async function handleVoiceState(db: PrismaClient, ev: { discordId: string; from: string | null; to: string | null; now?: Date }) {
  if (ev.from === ev.to) return null;
  const s = await getSettings();
  const interviewCh = s["interview.voiceChannelId"];
  const waitingCh = s["interview.waitingRoomChannelId"];
  const relevant = [interviewCh, waitingCh].filter(Boolean);
  if (!relevant.includes(ev.to ?? "") && !relevant.includes(ev.from ?? "")) return null;
  const now = ev.now ?? new Date();
  const app = await db.application.findFirst({
    where: {
      status: "INTERVIEW",
      user: { discordId: ev.discordId },
      interviewAt: { not: null, gte: new Date(now.getTime() - 3 * HOUR), lte: new Date(now.getTime() + 3 * HOUR) },
    },
    orderBy: { interviewAt: "asc" },
    include: { user: { select: { globalName: true, username: true } }, position: { select: { title: true } }, claimedBy: { select: { discordId: true } } },
  });
  if (!app?.interviewAt) return null;
  const at = app.interviewAt;

  if (interviewCh && ev.to === interviewCh && !forThisInterview(app.voiceJoinedAt, at)) {
    await db.application.update({ where: { id: app.id }, data: { voiceJoinedAt: now, voiceLeftAt: null } });
    return "joined";
  }
  if (interviewCh && ev.from === interviewCh && ev.to !== interviewCh && forThisInterview(app.voiceJoinedAt, at)) {
    await db.application.update({ where: { id: app.id }, data: { voiceLeftAt: now } });
    return "left";
  }
  if (waitingCh && ev.to === waitingCh && !forThisInterview(app.waitingPingAt, at)) {
    // Einmal pro Termin (bedingt, falls zwei Ereignisse parallel kommen)
    const marked = await db.application.updateMany({
      where: { id: app.id, OR: [{ waitingPingAt: null }, { waitingPingAt: { isSet: false } }, { waitingPingAt: { lt: new Date(at.getTime() - 3 * HOUR) } }] },
      data: { waitingPingAt: now },
    });
    if (!marked.count) return null;
    const name = app.user.globalName || app.user.username;
    const url = `${publicEnv.appUrl}/team/bewerbungen/${app.id}`;
    const job = app.claimedBy
      ? (
          await enqueue(
            {
              type: "DM",
              discordUserId: app.claimedBy.discordId,
              purpose: "team_reminder",
              ignoreNight: true,
              message: buildApplicantMessage({
                title: `${name} wartet im Warteraum`,
                body: `**${name}** (${app.publicId}, ${app.position.title}) ist gerade in den Bewerbungs-Warteraum gekommen. Termin: ${discordTime(at, "t")} Uhr (${discordTime(at, "R")}).`,
                statusUrl: url,
                buttonLabel: "Zur Bewerbung",
              }),
            },
            { applicationId: app.id },
          )
        ).id
      : await botLog(`⏳ ${esc(name)} (**${app.publicId}**, ${app.position.title}) wartet im Bewerbungs-Warteraum – Termin ${discordTime(at, "t")} Uhr, noch niemand zugeteilt`, {
          applicationId: app.id,
          url,
        });
    if (job) await runOutbox({ ids: [job] }).catch(() => {});
    return "waiting";
  }
  return null;
}
