import "server-only";
import { getSettings } from "@/lib/settings";
import { isAiConfigured, formatUsd } from "@/lib/ai/config";
import { monthlySpendMicro } from "@/lib/ai/service";

/** Daten fürs Einstellungsformular im Admin-Bereich. */
export async function loadSettingsProps() {
  const [settings, spend] = await Promise.all([getSettings(), monthlySpendMicro()]);
  const env = {
    bot: !!process.env.DISCORD_BOT_TOKEN,
    guild: !!process.env.DISCORD_GUILD_ID,
    teamRole: !!process.env.TEAM_ROLE_ID,
    adminRole: !!process.env.ADMIN_ROLE_ID,
    logChannel: !!process.env.DISCORD_LOG_CHANNEL_ID,
    anthropic: isAiConfigured(),
  };
  return { settings, env, spend: formatUsd(spend), spendMicro: spend };
}
