/**
 * Team-Aktivität für die Leitung: pro Teammitglied, was im Zeitraum passiert ist
 * (Übernahmen, Nachrichten, Statuswechsel, Entscheidungen, Kommentare, Bewertungen)
 * und wie schnell die erste Antwort an Bewerber kam. Nur für Admins sichtbar.
 */
import type { PrismaClient } from "@prisma/client";

export interface ActivityRow {
  userId: string;
  name: string;
  claims: number;
  messages: number;
  statusChanges: number;
  decisions: number;
  comments: number;
  ratings: number;
  /** Median Stunden von Eingang bis zur ersten Team-Nachricht (bei Bewerbungen, deren erste Nachricht von dieser Person kam) */
  firstReplyHours: number | null;
  total: number;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Ev = { userId: string | null };

/** Zählt die Ereignisse pro Person (rein, für Tests). */
export function aggregateActivity(input: {
  names: Map<string, string>;
  claims: Ev[];
  messages: Ev[];
  statusChanges: (Ev & { to: string })[];
  comments: Ev[];
  ratings: Ev[];
  firstReplies: { userId: string | null; hours: number }[];
}): ActivityRow[] {
  const rows = new Map<string, ActivityRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { userId: id, name: input.names.get(id) ?? "Unbekannt", claims: 0, messages: 0, statusChanges: 0, decisions: 0, comments: 0, ratings: 0, firstReplyHours: null, total: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const e of input.claims) if (e.userId) row(e.userId).claims++;
  for (const e of input.messages) if (e.userId) row(e.userId).messages++;
  for (const e of input.statusChanges) {
    if (!e.userId) continue;
    const r = row(e.userId);
    r.statusChanges++;
    if (e.to === "ACCEPTED" || e.to === "REJECTED") r.decisions++;
  }
  for (const e of input.comments) if (e.userId) row(e.userId).comments++;
  for (const e of input.ratings) if (e.userId) row(e.userId).ratings++;
  const replies = new Map<string, number[]>();
  for (const f of input.firstReplies) if (f.userId) replies.set(f.userId, [...(replies.get(f.userId) ?? []), f.hours]);
  for (const [id, hs] of replies) row(id).firstReplyHours = median(hs);
  for (const r of rows.values()) r.total = r.claims + r.messages + r.statusChanges + r.comments + r.ratings;
  return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export async function loadTeamActivity(db: PrismaClient, since: Date | null): Promise<ActivityRow[]> {
  const at = since ? { createdAt: { gte: since } } : {};
  // Zählen in der Datenbank (groupBy) statt Rohdaten zu laden
  const [claims, messages, statusChanges, comments, ratings, apps] = await Promise.all([
    db.auditLog.groupBy({ by: ["actorId"], where: { action: "application.claim", ...at }, _count: { _all: true } }),
    db.message.groupBy({ by: ["authorId"], where: { direction: "TEAM_TO_APPLICANT", ...at }, _count: { _all: true } }),
    db.statusChange.groupBy({ by: ["actorId", "to"], where: at, _count: { _all: true } }),
    db.comment.groupBy({ by: ["authorId"], where: at, _count: { _all: true } }),
    db.rating.groupBy({ by: ["userId"], where: since ? { updatedAt: { gte: since } } : {}, _count: { _all: true } }),
    db.application.findMany({
      where: { isTest: { not: true }, submittedAt: since ? { gte: since } : { not: null } },
      select: { submittedAt: true, messages: { where: { direction: "TEAM_TO_APPLICANT" }, orderBy: { createdAt: "asc" }, take: 1, select: { authorId: true, createdAt: true } } },
      orderBy: { submittedAt: "desc" },
      take: 2_000,
    }),
  ]);
  const ids = new Set<string>();
  for (const x of [...claims.map((c) => c.actorId), ...messages.map((m) => m.authorId), ...statusChanges.map((s) => s.actorId), ...comments.map((c) => c.authorId), ...ratings.map((r) => r.userId)]) if (x) ids.add(x);
  // Nur Teammitglieder: Bewerber tauchen sonst über Einreichen/Rückzug (StatusChange) auf
  const users = await db.user.findMany({ where: { id: { in: [...ids] }, OR: [{ isTeam: true }, { isAdmin: true }] }, select: { id: true, globalName: true, username: true } });
  const team = new Set(users.map((u) => u.id));
  const only = <T extends { userId: string | null }>(xs: T[]) => xs.filter((x) => x.userId && team.has(x.userId));
  const repeat = <T,>(n: number, x: T) => Array.from({ length: n }, () => x);
  return aggregateActivity({
    names: new Map(users.map((u) => [u.id, u.globalName || u.username])),
    claims: only(claims.flatMap((c) => repeat(c._count._all, { userId: c.actorId }))),
    messages: only(messages.flatMap((m) => repeat(m._count._all, { userId: m.authorId }))),
    statusChanges: only(statusChanges.flatMap((s) => repeat(s._count._all, { userId: s.actorId, to: s.to as string }))),
    comments: only(comments.flatMap((c) => repeat(c._count._all, { userId: c.authorId }))),
    ratings: only(ratings.flatMap((r) => repeat(r._count._all, { userId: r.userId }))),
    firstReplies: only(
      apps
        .filter((a) => a.submittedAt && a.messages[0])
        .map((a) => ({ userId: a.messages[0].authorId, hours: Math.max(0, (a.messages[0].createdAt.getTime() - a.submittedAt!.getTime()) / 3_600_000) })),
    ),
  });
}
