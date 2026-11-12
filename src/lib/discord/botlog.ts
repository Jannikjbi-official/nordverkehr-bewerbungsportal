/**
 * Discord-Kanäle des Portals:
 *  - Bewerbungs-Kanal: ein Post pro neu eingegangener Bewerbung
 *  - Bot-Log-Kanal: kurze Protokollzeilen (Status, Claims, Nachrichten, Zustellfehler)
 *
 * Kanal-IDs kommen aus den Einstellungen (Team → Einstellungen), Fallback für
 * die Logs ist DISCORD_LOG_CHANNEL_ID. Ohne `server-only` (auch im Worker genutzt).
 */
import type { Prisma } from "@prisma/client";
import { enqueue } from "@/lib/discord/outbox-db";
import { getSettings } from "@/lib/settings";
import { buildBotLogMessage } from "@/lib/messages/embed";

export async function channelIds() {
  const s = await getSettings();
  return {
    applications: s["discord.logChannelEnabled"] ? s["discord.applicationsChannelId"] || null : null,
    botLog: s["discord.botLogEnabled"] ? s["discord.botLogChannelId"] || process.env.DISCORD_LOG_CHANNEL_ID || null : null,
  };
}

/** Kurze Zeile in den Bot-Log-Kanal (über die Outbox). Gibt die Job-ID zurück oder null. */
export async function botLog(
  text: string,
  opts: { applicationId?: string; tx?: Prisma.TransactionClient; tone?: "default" | "warn"; url?: string | null } = {},
) {
  const { botLog: channelId } = await channelIds();
  if (!channelId) return null;
  const job = await enqueue(
    // Components V2; Namen/Erwähnungen werden angezeigt, pingen aber niemanden
    { type: "CHANNEL_MESSAGE", kind: "botlog", channelId, message: buildBotLogMessage(text, { tone: opts.tone, url: opts.url }) },
    { applicationId: opts.applicationId, tx: opts.tx },
  );
  return job.id;
}

/** Discord-Markdown entschärfen (Namen von Nutzern landen im Log). */
export function esc(s: string) {
  return s.replace(/([\\*_~`|>#@])/g, "\\$1");
}
