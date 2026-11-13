import { z } from "zod";
import { RULES_URL, hostOf } from "@/lib/public-urls";

/**
 * Serverseitige Umgebungsvariablen. Wird erst beim ersten Zugriff validiert,
 * damit `next build` ohne vollständige .env funktioniert.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().optional(),

  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_DISCORD_ID: z.string().optional(),
  AUTH_DISCORD_SECRET: z.string().optional(),

  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().regex(/^\d{15,25}$/).optional(),
  TEAM_ROLE_ID: z.string().regex(/^\d{15,25}$/).optional(),
  ADMIN_ROLE_ID: z
    .string()
    .regex(/^\d{15,25}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  DISCORD_LOG_CHANNEL_ID: z
    .string()
    .regex(/^\d{15,25}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ROLE_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),

  CRON_SECRET: z.string().min(16).optional(),
  PUBLIC_ID_PREFIX: z.string().regex(/^[A-Z]{1,6}$/).default("NV"),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_DEFAULT: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_FAST: z.string().default("claude-haiku-5-5"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  // Leere Strings wie "nicht gesetzt" behandeln
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ungültige Umgebungsvariablen:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Öffentliche Werte (dürfen im Client landen). */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  mainSiteUrl: process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://nordverkehr.xyz",
  discordInvite: process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/KrfKASTHDp",
  rulesUrl: RULES_URL,
};
export { hostOf };

/** Für Tests: Cache zurücksetzen. */
export function resetEnvCache() {
  cached = null;
}
