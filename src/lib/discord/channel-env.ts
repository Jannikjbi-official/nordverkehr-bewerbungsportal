/**
 * Discord-Kanäle kommen aus den Umgebungsvariablen (Vercel → Settings → Environment Variables).
 * Ein Wert aus Vercel gilt immer. Früher im Portal eingetragene Kanäle gelten nur noch als
 * Übergang, bis die Variable in Vercel gesetzt ist. Im Admin-Bereich wird nichts mehr eingetragen.
 * Ohne Server-Abhängigkeiten (auch im Formular genutzt).
 */
export const CHANNEL_ENV = {
  "discord.jobsChannelId": "DISCORD_JOBS_CHANNEL_ID",
  "discord.spotlightChannelId": "DISCORD_SPOTLIGHT_CHANNEL_ID",
  "discord.applicationsChannelId": "DISCORD_APPLICATIONS_CHANNEL_ID",
  "discord.botLogChannelId": "DISCORD_LOG_CHANNEL_ID",
  "discord.changelogChannelId": "DISCORD_CHANGELOG_CHANNEL_ID",
  "discord.summaryChannelId": "DISCORD_TEAM_CHANNEL_ID",
  "discord.leadChannelId": "DISCORD_LEAD_CHANNEL_ID",
  "discord.welcomeChannelId": "DISCORD_WELCOME_CHANNEL_ID",
  "interview.voiceChannelId": "DISCORD_INTERVIEW_VOICE_CHANNEL_ID",
  "interview.waitingRoomChannelId": "DISCORD_WAITING_ROOM_CHANNEL_ID",
} as const;

export type ChannelKey = keyof typeof CHANNEL_ENV;
export const CHANNEL_KEYS = Object.keys(CHANNEL_ENV) as ChannelKey[];

const ID = /^\d{15,25}$/;

/** Gültige Kanal-ID aus der Umgebung (oder null). Rein, für Tests (env übergebbar). */
export function envChannel(key: ChannelKey, env: Record<string, string | undefined> = process.env): string | null {
  const v = (env[CHANNEL_ENV[key]] ?? "").trim();
  return ID.test(v) ? v : null;
}

export interface ChannelSource {
  env: string;
  /** env = aus Vercel, legacy = alter Eintrag im Portal (Übergang), none = nicht gesetzt, invalid = in Vercel gesetzt, aber keine gültige ID */
  source: "env" | "legacy" | "none" | "invalid";
  value: string;
}

/** Woher kommt welcher Kanal? Rein, für Tests. */
export function channelSources(stored: Partial<Record<ChannelKey, string>>, env: Record<string, string | undefined> = process.env): Record<ChannelKey, ChannelSource> {
  const out = {} as Record<ChannelKey, ChannelSource>;
  for (const key of CHANNEL_KEYS) {
    const name = CHANNEL_ENV[key];
    const fromEnv = envChannel(key, env);
    const raw = (env[name] ?? "").trim();
    const legacy = (stored[key] ?? "").trim();
    out[key] = fromEnv
      ? { env: name, source: "env", value: fromEnv }
      : raw
        ? { env: name, source: "invalid", value: raw }
        : legacy
          ? { env: name, source: "legacy", value: legacy }
          : { env: name, source: "none", value: "" };
  }
  return out;
}
