/**
 * Name und Profilbild des Discord-Bots – fürs Portal (automatische Nachrichten,
 * KI-Antworten, KI-Einschätzung). Einmal pro Stunde frisch von Discord, sonst
 * aus dem Speicher; ohne Bot-Token das Nordverkehr-Logo.
 */
import { avatarUrl } from "@/lib/discord/snowflake";
import { LOGO_URL } from "@/lib/messages/embed";

export interface BotProfile {
  name: string;
  avatarUrl: string;
}

const FALLBACK: BotProfile = { name: "Nordverkehr-Bot", avatarUrl: LOGO_URL };
const TTL = 3_600_000;
let cache: { at: number; profile: BotProfile } | null = null;

export async function getBotProfile(): Promise<BotProfile> {
  if (cache && Date.now() - cache.at < TTL) return cache.profile;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return FALLBACK;
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}` }, cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(String(res.status));
    const u = (await res.json()) as { id: string; username: string; global_name?: string | null; avatar: string | null };
    const profile = { name: u.global_name || u.username, avatarUrl: avatarUrl(u.id, u.avatar, 128) };
    cache = { at: Date.now(), profile };
    return profile;
  } catch {
    // Discord gerade nicht erreichbar: alten Stand oder Logo
    return cache?.profile ?? FALLBACK;
  }
}
