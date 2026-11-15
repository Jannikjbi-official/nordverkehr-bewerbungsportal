/**
 * Fehler-Alarm: Serverfehler (aus instrumentation.ts → onRequestError) werden pro Tag
 * gezählt. Ab `alerts.errorThreshold` Fehlern postet der Bot einmal am Tag eine Warnung
 * in den Leitungs-Chat (sonst Bot-Log) – mit den betroffenen Seiten, ohne Query-Parameter.
 * Darf nie selbst einen Fehler werfen.
 */
import { todayBerlin } from "@/lib/changelog";

/** Interne Next.js-Steuerung (Weiterleitung, 404, …) ist kein Fehler. Rein, für Tests. */
export function isControlFlowError(err: unknown) {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  const msg = err instanceof Error ? err.message : String(err);
  return /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT|HANGING_PROMISE)/.test(digest) || /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR)/.test(msg) || /aborted|ECONNRESET/i.test(msg);
}

/** Pfad ohne Query/Hash, IDs gekürzt – nichts Persönliches in den Alarm. Rein, für Tests. */
export function cleanPath(path: string) {
  return (path.split(/[?#]/)[0] || "/").replace(/\/c[a-z0-9]{20,}/g, "/…").slice(0, 120);
}

interface DayStats {
  count: number;
  recent: { path: string; message: string }[];
}

export async function recordServerError(err: unknown, path: string, now = new Date()) {
  try {
    if (isControlFlowError(err)) return;
    const { db, hasDatabaseUrl } = await import("@/lib/db");
    if (!hasDatabaseUrl()) return;
    const { getSettings } = await import("@/lib/settings");
    const s = await getSettings();
    if (!s["alerts.enabled"]) return;
    const day = todayBerlin(now);
    const key = `errors:${day}`;
    const row = await db.setting.findUnique({ where: { key } });
    const stats = (row?.value as DayStats | undefined) ?? { count: 0, recent: [] };
    const message = (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 160);
    const next: DayStats = { count: stats.count + 1, recent: [{ path: cleanPath(path), message }, ...stats.recent].slice(0, 5) };
    await db.setting.upsert({ where: { key }, create: { key, value: next as never }, update: { value: next as never } });
    // Alte Tageszähler aufräumen
    if (!row) await db.setting.deleteMany({ where: { key: { startsWith: "errors:" }, NOT: { key } } });
    if (next.count < s["alerts.errorThreshold"]) return;
    const fresh = await db.setting.create({ data: { key: `alert:errors:${day}`, value: { at: now.toISOString() } } }).then(() => true, () => false);
    if (!fresh) return;
    const channelId = s["discord.leadChannelId"] || (s["discord.botLogEnabled"] ? s["discord.botLogChannelId"] : "") || process.env.DISCORD_LOG_CHANNEL_ID || "";
    if (!channelId) return;
    const { enqueue, runOutbox } = await import("@/lib/discord/outbox-db");
    const { buildBotLogMessage } = await import("@/lib/messages/embed");
    const { publicEnv } = await import("@/lib/env");
    const lines = next.recent.map((r) => `- \`${r.path}\` – ${r.message}`).join("\n");
    const job = await enqueue({
      type: "CHANNEL_MESSAGE",
      kind: "botlog",
      channelId,
      message: buildBotLogMessage(`🚨 **Fehler im Portal:** heute schon ${next.count} Serverfehler. Zuletzt:\n${lines}\n\nDetails in den Vercel-Logs.`, { tone: "warn", url: `${publicEnv.appUrl}/team/admin` }),
    });
    await runOutbox({ ids: [job.id] }).catch(() => {});
  } catch (e) {
    console.error("[error-alert]", e);
  }
}
