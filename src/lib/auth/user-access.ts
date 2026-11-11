/**
 * Nutzer- und Rollenauflösung ohne `server-only`, damit auch der Proxy und der
 * Worker sie importieren können. Nicht in Client-Komponenten importieren.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { resolveAccess, type Access, type AccessDeps } from "@/lib/auth/access";
import type { User } from "@prisma/client";
import { isDevLoginEnabled } from "@/lib/auth/dev";

export type CurrentUser = User;

/** Lädt den eingeloggten Nutzer aus der DB und prüft die Sitzungsversion. */
export async function loadUserFromSession(
  session: { uid?: string; sv?: number } | null,
): Promise<CurrentUser | null> {
  if (!session?.uid) return null;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user) return null;
  if ((session.sv ?? -1) !== user.sessionVersion) return null;
  return user;
}

function accessDeps(): AccessDeps {
  const e = env();
  return {
    config: {
      guildId: e.DISCORD_GUILD_ID,
      teamRoleId: e.TEAM_ROLE_ID,
      adminRoleId: e.ADMIN_ROLE_ID,
      ttlMs: e.ROLE_CACHE_TTL_SECONDS * 1000,
    },
    now: () => new Date(),
    fetchMember: async (guildId, discordId) => {
      // Lazy: @discordjs/rest erst laden, wenn wirklich gefragt wird
      const { getDiscordApi } = await import("@/lib/discord/client");
      return getDiscordApi().getMember(guildId, discordId);
    },
    persist: async (userId, state) => {
      await db.user.update({ where: { id: userId }, data: state });
    },
  };
}

// Parallele Requests desselben Nutzers teilen sich eine Discord-Abfrage
const inflight = new Map<string, Promise<Access>>();

export async function getAccess(user: CurrentUser, opts: { force?: boolean } = {}): Promise<Access> {
  // Lokale Entwicklung ohne Discord-Server: Rollen aus der Datenbank (Seed) übernehmen
  if (isDevLoginEnabled() && !process.env.DISCORD_GUILD_ID) {
    return { inGuild: user.inGuild, isTeam: user.isTeam, isAdmin: user.isAdmin, guildJoinedAt: user.guildJoinedAt, roleCheckedAt: new Date(), source: "cache" };
  }
  const key = `${user.id}:${opts.force ? 1 : 0}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = resolveAccess(user, accessDeps(), opts).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

