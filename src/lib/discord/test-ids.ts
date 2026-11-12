/**
 * Testbewerber (Admin → Testbewerbungen) haben Discord-IDs mit diesem Präfix.
 * Echte Discord-IDs (Snowflakes) beginnen nie mit 0 – so kann keine DM, Rolle
 * oder Discord-Abfrage versehentlich bei einer echten Person landen.
 */
export const TEST_DISCORD_PREFIX = "0000";

export const isTestDiscordId = (discordId: string | null | undefined) => !!discordId && discordId.startsWith(TEST_DISCORD_PREFIX);
