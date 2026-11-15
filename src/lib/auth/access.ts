/**
 * Rollenprüfung gegen den Discord-Server.
 *
 * Regeln:
 *  - Team-Zugriff nur mit TEAM_ROLE_ID auf DISCORD_GUILD_ID.
 *  - Admin-Funktionen nur mit Team-Rolle UND ADMIN_ROLE_ID. Ist ADMIN_ROLE_ID
 *    nicht gesetzt, hat niemand Admin-Rechte.
 *  - Ergebnis wird kurz gecacht (ROLE_CACHE_TTL_SECONDS, Standard 60 s).
 *  - Fail closed: Ist Discord nicht erreichbar und der Cache abgelaufen,
 *    gibt es keinen Zugriff.
 *
 * Die Kernlogik ist rein (Dependencies werden übergeben) und damit testbar.
 */
import type { GuildMemberInfo } from "@/lib/discord/client";

export interface RoleConfig {
  guildId?: string;
  teamRoleId?: string;
  adminRoleId?: string;
  ttlMs: number;
}

export interface AccessState {
  inGuild: boolean;
  isTeam: boolean;
  isAdmin: boolean;
  guildJoinedAt: Date | null;
  roleCheckedAt: Date | null;
  /** Discord-Rollen (für Zuständigkeit pro Stelle) – nur beim Abgleich mit Discord gesetzt */
  roleIds?: string[];
}

export interface Access extends AccessState {
  source: "cache" | "discord" | "error" | "unconfigured";
}

export interface AccessDeps {
  config: RoleConfig;
  now: () => Date;
  fetchMember: (guildId: string, discordId: string) => Promise<GuildMemberInfo | null>;
  persist: (userId: string, state: AccessState) => Promise<void>;
  /**
   * Optional: Arbeit nach der Antwort erledigen (z. B. next/server after). Dann gilt für
   * Teammitglieder „erst anzeigen, dann prüfen“: Bis STALE_TEAM_MS nach der letzten Prüfung
   * wird das gespeicherte Ergebnis sofort genutzt und Discord im Hintergrund gefragt.
   */
  background?: (task: () => Promise<void>) => void;
}

/** So lange darf ein bekanntes Teammitglied ohne Warten auf Discord weiterarbeiten. */
export const STALE_TEAM_MS = 15 * 60_000;

export interface AccessSubject extends AccessState {
  id: string;
  discordId: string;
}

const DENIED = { inGuild: false, isTeam: false, isAdmin: false } as const;

export function evaluateRoles(roles: readonly string[], config: Pick<RoleConfig, "teamRoleId" | "adminRoleId">) {
  const isTeam = !!config.teamRoleId && roles.includes(config.teamRoleId);
  const isAdmin = isTeam && !!config.adminRoleId && roles.includes(config.adminRoleId);
  return { isTeam, isAdmin };
}

export function isCacheFresh(checkedAt: Date | null, now: Date, ttlMs: number): boolean {
  if (!checkedAt) return false;
  const age = now.getTime() - checkedAt.getTime();
  return age >= 0 && age < ttlMs;
}

export async function resolveAccess(
  subject: AccessSubject,
  deps: AccessDeps,
  opts: { force?: boolean } = {},
): Promise<Access> {
  const { config } = deps;
  const now = deps.now();

  if (!config.guildId || !config.teamRoleId) {
    return { ...DENIED, guildJoinedAt: null, roleCheckedAt: null, source: "unconfigured" };
  }

  if (!opts.force && isCacheFresh(subject.roleCheckedAt, now, config.ttlMs)) {
    // Admin nur, wenn die Admin-Rolle aktuell überhaupt konfiguriert ist
    const isAdmin = subject.isAdmin && !!config.adminRoleId;
    return {
      inGuild: subject.inGuild,
      isTeam: subject.isTeam,
      isAdmin: isAdmin && subject.isTeam,
      guildJoinedAt: subject.guildJoinedAt,
      roleCheckedAt: subject.roleCheckedAt,
      source: "cache",
    };
  }

  // Bekanntes Teammitglied, Prüfung nur etwas älter: nicht warten, im Hintergrund auffrischen.
  // Wer (noch) keinen Zugriff hat, wird sofort geprüft – neue Rollen wirken also gleich.
  if (!opts.force && deps.background && subject.isTeam && isCacheFresh(subject.roleCheckedAt, now, STALE_TEAM_MS)) {
    deps.background(async () => {
      try {
        const m = await deps.fetchMember(config.guildId!, subject.discordId);
        const next: AccessState = m
          ? { inGuild: true, ...evaluateRoles(m.roles, config), guildJoinedAt: m.joinedAt, roleCheckedAt: deps.now(), roleIds: [...m.roles] }
          : { ...DENIED, guildJoinedAt: null, roleCheckedAt: deps.now(), roleIds: [] };
        await deps.persist(subject.id, next);
      } catch {
        // nächster Request versucht es erneut
      }
    });
    const isAdmin = subject.isAdmin && !!config.adminRoleId;
    return { inGuild: subject.inGuild, isTeam: subject.isTeam, isAdmin: isAdmin && subject.isTeam, guildJoinedAt: subject.guildJoinedAt, roleCheckedAt: subject.roleCheckedAt, source: "cache" };
  }

  let member: GuildMemberInfo | null;
  try {
    member = await deps.fetchMember(config.guildId, subject.discordId);
  } catch {
    // Fail closed – Cache NICHT überschreiben, nächster Request versucht es erneut.
    return { ...DENIED, guildJoinedAt: subject.guildJoinedAt, roleCheckedAt: subject.roleCheckedAt, source: "error" };
  }

  const state: AccessState = member
    ? { inGuild: true, ...evaluateRoles(member.roles, config), guildJoinedAt: member.joinedAt, roleCheckedAt: now, roleIds: [...member.roles] }
    : { ...DENIED, guildJoinedAt: null, roleCheckedAt: now, roleIds: [] };

  await deps.persist(subject.id, state);
  return { ...state, source: "discord" };
}
