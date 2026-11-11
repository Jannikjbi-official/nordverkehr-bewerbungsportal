const DISCORD_EPOCH = 1420070400000n;

/** Erstellungszeitpunkt eines Discord-Accounts aus der Snowflake-ID. */
export function snowflakeToDate(id: string): Date {
  try {
    return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));
  } catch {
    return new Date(0);
  }
}

export function avatarUrl(discordId: string, avatar: string | null | undefined, size = 128): string {
  if (avatar) {
    const ext = avatar.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=${size}`;
  }
  // Standard-Avatar (neues Username-System)
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
