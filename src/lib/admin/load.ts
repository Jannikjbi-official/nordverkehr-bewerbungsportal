import "server-only";
import { getSettings } from "@/lib/settings";
import { isAiConfigured, formatUsd } from "@/lib/ai/config";
import { monthlySpendMicro } from "@/lib/ai/service";

/** Daten fürs Einstellungsformular im Admin-Bereich. */
export async function loadSettingsProps() {
  const { CHANNEL_KEYS, channelSources } = await import("@/lib/discord/channel-env");
  const { db } = await import("@/lib/db");
  const [settings, spend, stored] = await Promise.all([
    getSettings(),
    monthlySpendMicro(),
    // Alte Einträge aus dem Portal (gelten nur noch, bis die Variable in Vercel gesetzt ist)
    db.setting.findMany({ where: { key: { in: CHANNEL_KEYS } }, select: { key: true, value: true } }),
  ]);
  const channels = channelSources(Object.fromEntries(stored.map((r) => [r.key, typeof r.value === "string" ? r.value : ""])));
  const env = {
    bot: !!process.env.DISCORD_BOT_TOKEN,
    guild: !!process.env.DISCORD_GUILD_ID,
    teamRole: !!process.env.TEAM_ROLE_ID,
    adminRole: !!process.env.ADMIN_ROLE_ID,
    logChannel: !!process.env.DISCORD_LOG_CHANNEL_ID,
    anthropic: isAiConfigured(),
  };
  return { settings, env, channels, spend: formatUsd(spend), spendMicro: spend };
}
