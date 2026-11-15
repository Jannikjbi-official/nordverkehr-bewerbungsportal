/**
 * Rollen-Abgleich zwischen Portal und Discord:
 *  - fehlt:   im Portal angenommen, aber die Rolle der Stelle fehlt auf Discord
 *  - zuviel:  hat auf Discord eine Annahme-Rolle, ist im Portal aber für keine Stelle mit dieser Rolle angenommen
 * Der Vergleich ist rein (ohne DB/Discord) und getestet; das Laden steht in loadRoleAudit.
 */
export interface Expected {
  discordId: string;
  name: string;
  applicationId: string;
  position: string;
  roleId: string;
}

export interface RoleMismatch {
  discordId: string;
  name: string;
  roleId: string;
  /** Stelle(n), zu denen die Rolle gehört */
  position: string;
  applicationId?: string;
}

export function diffRoles(expected: Expected[], members: Map<string, string[]>, roleNames: Map<string, string>) {
  const missing: RoleMismatch[] = [];
  const notInGuild: RoleMismatch[] = [];
  const wanted = new Map<string, Set<string>>(); // discordId → erwartete Rollen
  for (const e of expected) {
    (wanted.get(e.discordId) ?? wanted.set(e.discordId, new Set()).get(e.discordId)!).add(e.roleId);
    const roles = members.get(e.discordId);
    if (!roles) notInGuild.push({ ...e });
    else if (!roles.includes(e.roleId)) missing.push({ ...e });
  }
  const extra: RoleMismatch[] = [];
  for (const [discordId, roles] of members) {
    for (const r of roles) {
      if (!roleNames.has(r)) continue; // keine Annahme-Rolle
      if (wanted.get(discordId)?.has(r)) continue;
      extra.push({ discordId, name: "", roleId: r, position: roleNames.get(r)! });
    }
  }
  return { missing, extra, notInGuild };
}

/** Lädt Annahmen aus der DB und Mitglieder von Discord. `null` + Grund, wenn Discord nicht erreichbar ist. */
export async function loadRoleAudit() {
  const { db } = await import("@/lib/db");
  const { env } = await import("@/lib/env");
  const guildId = env().DISCORD_GUILD_ID;
  if (!guildId || !process.env.DISCORD_BOT_TOKEN) return { error: "Discord-Bot oder Server-ID ist nicht eingerichtet." as const };
  const positions = await db.position.findMany({ where: { acceptRoleId: { not: null } }, select: { title: true, acceptRoleId: true } });
  const roleNames = new Map<string, string>();
  for (const p of positions) if (p.acceptRoleId) roleNames.set(p.acceptRoleId, roleNames.has(p.acceptRoleId) ? `${roleNames.get(p.acceptRoleId)}, ${p.title}` : p.title);
  if (!roleNames.size) return { error: "Keine Stelle hat eine Discord-Rolle für die Annahme." as const };
  const accepted = await db.application.findMany({
    where: { status: "ACCEPTED", isTest: { not: true }, position: { acceptRoleId: { not: null } } },
    select: { id: true, user: { select: { discordId: true, globalName: true, username: true } }, position: { select: { title: true, acceptRoleId: true } } },
    take: 2000,
  });
  const expected: Expected[] = accepted.map((a) => ({
    discordId: a.user.discordId,
    name: a.user.globalName || a.user.username,
    applicationId: a.id,
    position: a.position.title,
    roleId: a.position.acceptRoleId!,
  }));
  const { getDiscordApi } = await import("@/lib/discord/client");
  const api = getDiscordApi();
  if (!api.listMembers) return { error: "Mitgliederliste wird nicht unterstützt." as const };
  const members = new Map<string, string[]>();
  try {
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const batch = await api.listMembers(guildId, after);
      for (const m of batch) members.set(m.userId, m.roles);
      if (batch.length < 1000) break;
      after = batch[batch.length - 1].userId;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Discord-Mitglieder konnten nicht geladen werden (${msg.slice(0, 120)}). Im Discord Developer Portal muss beim Bot der „Server Members Intent“ an sein.` as const };
  }
  const result = diffRoles(expected, members, roleNames);
  // Namen für „zuviel“ aus der DB (falls bekannt)
  const ids = [...new Set(result.extra.map((x) => x.discordId))];
  const users = ids.length ? await db.user.findMany({ where: { discordId: { in: ids } }, select: { discordId: true, globalName: true, username: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.discordId, u.globalName || u.username]));
  for (const x of result.extra) x.name = nameOf.get(x.discordId) ?? `Discord-ID ${x.discordId}`;
  return { ...result, guildId, checked: members.size };
}
