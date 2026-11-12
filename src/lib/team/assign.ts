/**
 * Faire Verteilung: wer betreut wie viele offene Bewerbungen – und (optional,
 * Einstellung team.autoAssign) automatische Zuteilung neuer Bewerbungen an das
 * aktive Teammitglied mit den wenigsten offenen Bewerbungen. Beachtet die
 * Zuständigkeit pro Stelle. Gleichstand: wer am längsten nichts bekommen hat.
 */
import type { PrismaClient } from "@prisma/client";
import { ACTIVE_STATUSES } from "@/lib/applications/status";
import { canSeePosition } from "@/lib/team/visibility";

const DAY = 86_400_000;

export interface Workload {
  userId: string;
  name: string;
  discordId: string;
  avatar: string | null;
  open: number;
  lastActive: Date | null;
}

/** Offene Bewerbungen pro Teammitglied (aktive der letzten 30 Tage + alle mit Bewerbungen). */
export async function teamWorkload(db: PrismaClient, now = new Date()): Promise<Workload[]> {
  const [team, claims] = await Promise.all([
    db.user.findMany({
      where: { isTeam: true, isTest: { not: true } },
      select: { id: true, globalName: true, username: true, discordId: true, avatar: true, lastTeamActiveAt: true },
    }),
    db.application.groupBy({ by: ["claimedById"], where: { status: { in: ACTIVE_STATUSES }, claimedById: { not: null } }, _count: { _all: true } }),
  ]);
  const count = new Map(claims.map((c) => [c.claimedById!, c._count._all]));
  return team
    .filter((u) => count.has(u.id) || (u.lastTeamActiveAt && now.getTime() - u.lastTeamActiveAt.getTime() < 30 * DAY))
    .map((u) => ({ userId: u.id, name: u.globalName || u.username, discordId: u.discordId, avatar: u.avatar, open: count.get(u.id) ?? 0, lastActive: u.lastTeamActiveAt }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

export interface Candidate {
  id: string;
  open: number;
  lastAssignedAt: Date | null;
}

/** Wer bekommt die nächste Bewerbung? Wenigste offene, bei Gleichstand am längsten nichts bekommen. */
export function pickAssignee(candidates: Candidate[]): string | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => a.open - b.open || (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0))[0].id;
}

/** Neue Bewerbung automatisch zuteilen (nur wenn eingeschaltet und noch niemand betreut). */
export async function autoAssign(db: PrismaClient, applicationId: string, now = new Date()) {
  const { getSettings } = await import("@/lib/settings");
  if (!(await getSettings())["team.autoAssign"]) return null;
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { position: { select: { title: true, teamRoleIds: true } } } });
  if (!app || app.claimedById || app.status !== "SUBMITTED" || app.isTest) return null;
  // Aktiv = in den letzten 14 Tagen im Team-Bereich gewesen
  const team = await db.user.findMany({
    where: { isTeam: true, isTest: { not: true }, lastTeamActiveAt: { gte: new Date(now.getTime() - 14 * DAY) } },
    select: { id: true, isAdmin: true, roleIds: true, globalName: true, username: true },
  });
  const eligible = team.filter((u) => canSeePosition({ isAdmin: u.isAdmin, roleIds: u.roleIds ?? [] }, app.position));
  if (!eligible.length) return null;
  const [open, last] = await Promise.all([
    db.application.groupBy({ by: ["claimedById"], where: { status: { in: ACTIVE_STATUSES }, claimedById: { in: eligible.map((u) => u.id) } }, _count: { _all: true } }),
    db.application.groupBy({ by: ["claimedById"], where: { claimedById: { in: eligible.map((u) => u.id) } }, _max: { claimedAt: true } }),
  ]);
  const pick = pickAssignee(
    eligible.map((u) => ({
      id: u.id,
      open: open.find((o) => o.claimedById === u.id)?._count._all ?? 0,
      lastAssignedAt: last.find((l) => l.claimedById === u.id)?._max.claimedAt ?? null,
    })),
  );
  if (!pick) return null;
  const res = await db.application.updateMany({
    where: { id: app.id, OR: [{ claimedById: null }, { claimedById: { isSet: false } }] },
    data: { claimedById: pick, claimedAt: now },
  });
  if (!res.count) return null;
  const who = eligible.find((u) => u.id === pick)!;
  const { botLog, esc } = await import("@/lib/discord/botlog");
  const { publicEnv } = await import("@/lib/env");
  await db.auditLog.create({ data: { action: "application.claim", targetType: "application", targetId: app.id, meta: { publicId: app.publicId, auto: true, to: pick } } });
  const job = await botLog(`🎯 **${app.publicId}** (${app.position.title}) automatisch zugeteilt an ${esc(who.globalName || who.username)} (wenigste offene Bewerbungen)`, {
    applicationId: app.id,
    url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
  });
  return { userId: pick, jobId: job };
}
