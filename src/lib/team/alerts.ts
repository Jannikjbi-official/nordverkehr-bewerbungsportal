/**
 * Störungs-Alarm (Einstellung alerts.enabled): Der Bot warnt im Leitungs-Chat
 * (sonst im Bot-Log), wenn …
 *  - in den letzten 24 h mindestens `alerts.failedThreshold` Zustellungen fehlschlugen,
 *  - (optional) der Worker seit über 26 h keinen „Herzschlag“ hinterlassen hat.
 * Jeder Alarm höchstens einmal pro Tag. Geprüft wird nur mit den Tagesaufgaben
 * (lib/due-tasks.ts) – es gibt keine eigenen Prüf-Läufe.
 */
import type { PrismaClient } from "@prisma/client";
import { todayBerlin } from "@/lib/changelog";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { buildBotLogMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

const HOUR = 3_600_000;
export type Heartbeat = "worker";
const LABEL: Record<Heartbeat, string> = {
  worker: "Worker (Discord-Gateway)",
};

export async function beat(db: PrismaClient, name: Heartbeat, now = new Date()) {
  const key = `heartbeat:${name}`;
  await db.setting.upsert({ where: { key }, create: { key, value: { at: now.toISOString() } }, update: { value: { at: now.toISOString() } } });
}

export async function lastBeat(db: PrismaClient, name: Heartbeat) {
  const row = await db.setting.findUnique({ where: { key: `heartbeat:${name}` } });
  const at = (row?.value as { at?: string } | undefined)?.at;
  return at ? new Date(at) : null;
}

/** Häufigsten Fehlertext kürzen/zusammenfassen */
export function topError(errors: (string | null)[]) {
  const counts = new Map<string, number>();
  for (const e of errors) {
    const k = (e ?? "unbekannt").slice(0, 120);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Prüft auf Störungen und postet ggf. einen Alarm. `check` = welche Läufe geprüft werden. */
export async function checkAlerts(db: PrismaClient, check: Heartbeat[] = [], now = new Date()) {
  const s = await getSettings();
  if (!s["alerts.enabled"]) return [];
  const channelId = s["discord.leadChannelId"] || (s["discord.botLogEnabled"] ? s["discord.botLogChannelId"] : "") || process.env.DISCORD_LOG_CHANNEL_ID || "";
  if (!channelId) return [];
  const day = todayBerlin(now);
  const alerts: { key: string; text: string }[] = [];

  const failedAll = await db.outboxJob.findMany({ where: { status: "FAILED", updatedAt: { gte: new Date(now.getTime() - 24 * HOUR) } }, select: { lastError: true, result: true }, take: 500 });
  // Bewerber mit geschlossenen DMs sind keine Störung
  const failed = failedAll.filter((f) => (f.result as { dmClosed?: string } | null)?.dmClosed !== "true");
  if (failed.length >= s["alerts.failedThreshold"]) {
    alerts.push({
      key: `alert:failed:${day}`,
      text: `🚨 **Störung:** ${failed.length} Zustellungen sind in den letzten 24 h fehlgeschlagen. Häufigster Fehler: ${topError(failed.map((f) => f.lastError))}`,
    });
  }
  for (const name of check) {
    const last = await lastBeat(db, name);
    // Ohne Herzschlag (frische Installation) kein Alarm
    if (last && now.getTime() - last.getTime() > 26 * HOUR) {
      alerts.push({ key: `alert:${name}:${day}`, text: `🚨 **Störung:** Der ${LABEL[name]} lief zuletzt am ${last.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} – über 26 Stunden her. Bitte den Worker prüfen.` });
    }
  }

  const sent: string[] = [];
  for (const a of alerts) {
    // Eindeutiger Key: pro Tag und Art höchstens ein Alarm
    const fresh = await db.setting.create({ data: { key: a.key, value: { at: now.toISOString() } } }).then(() => true, () => false);
    if (!fresh) continue;
    const job = await enqueue({ type: "CHANNEL_MESSAGE", kind: "botlog", channelId, message: buildBotLogMessage(a.text, { tone: "warn", url: `${publicEnv.appUrl}/team/admin` }) });
    sent.push(job.id);
  }
  // Alte Alarm-Markierungen aufräumen
  await db.setting.deleteMany({ where: { key: { startsWith: "alert:" }, NOT: { key: { contains: day } } } }).catch(() => {});
  if (sent.length) await runOutbox({ ids: sent }).catch(() => {});
  return alerts.map((a) => a.key);
}
