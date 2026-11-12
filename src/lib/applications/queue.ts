/**
 * Für Bewerber: Position in der Warteschlange und aktuelle Bearbeitungszeit
 * (aus echten Werten der letzten 90 Tage, ohne Testbewerbungen).
 */
import type { PrismaClient } from "@prisma/client";

const DAY = 86_400_000;

export interface QueueInfo {
  /** 1 = als Nächstes dran */
  place: number;
  /** offene Bewerbungen (eingereicht/in Prüfung) auf diese Stelle */
  total: number;
  /** Ø Tage bis zur ersten Sichtung bzw. Entscheidung (null = zu wenig Daten) */
  firstReviewDays: number | null;
  decisionDays: number | null;
}

const avg = (xs: number[]) => (xs.length >= 3 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function getQueueInfo(db: PrismaClient, app: { id: string; positionId: string; submittedAt: Date | null }, now = new Date()): Promise<QueueInfo | null> {
  if (!app.submittedAt) return null;
  const open = { positionId: app.positionId, status: { in: ["SUBMITTED" as const, "IN_REVIEW" as const] }, isTest: { not: true } };
  const since = new Date(now.getTime() - 90 * DAY);
  const [ahead, total, reviewed, decided] = await Promise.all([
    db.application.count({ where: { ...open, submittedAt: { not: null, lt: app.submittedAt }, NOT: { id: app.id } } }),
    db.application.count({ where: open }),
    db.application.findMany({ where: { isTest: { not: true }, firstReviewedAt: { gte: since } }, select: { positionId: true, submittedAt: true, firstReviewedAt: true }, take: 500 }),
    db.application.findMany({ where: { isTest: { not: true }, status: { in: ["ACCEPTED", "REJECTED"] }, decidedAt: { gte: since } }, select: { positionId: true, submittedAt: true, decidedAt: true }, take: 500 }),
  ]);
  const days = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / DAY : null);
  /** Erst die Werte dieser Stelle, bei zu wenig Daten alle Stellen */
  const estimate = (rows: { positionId: string; from: Date | null; to: Date | null }[]) => {
    const vals = (xs: typeof rows) => xs.map((r) => days(r.from, r.to)).filter((d): d is number => d !== null && d >= 0);
    return avg(vals(rows.filter((r) => r.positionId === app.positionId))) ?? avg(vals(rows));
  };
  return {
    place: ahead + 1,
    total: Math.max(total, ahead + 1),
    firstReviewDays: estimate(reviewed.map((r) => ({ positionId: r.positionId, from: r.submittedAt, to: r.firstReviewedAt }))),
    decisionDays: estimate(decided.map((r) => ({ positionId: r.positionId, from: r.submittedAt, to: r.decidedAt }))),
  };
}

/** „etwa 2 Tage“, „etwa einen Tag“, „weniger als einen Tag“ */
export function formatDays(d: number) {
  if (d < 1) return "weniger als einen Tag";
  const r = Math.round(d);
  return r === 1 ? "etwa einen Tag" : `etwa ${r} Tage`;
}

export function queueText(q: QueueInfo, status: "SUBMITTED" | "IN_REVIEW", position: string) {
  const parts: string[] = [];
  if (status === "SUBMITTED") parts.push(`Du bist Nr. ${q.place} von ${q.total} offenen Bewerbungen für ${position}.`);
  else parts.push(`Das Team liest deine Bewerbung gerade (${q.total} offene Bewerbungen für ${position}).`);
  if (status === "SUBMITTED" && q.firstReviewDays !== null) parts.push(`Bis zur ersten Sichtung dauert es gerade ${formatDays(q.firstReviewDays)}.`);
  if (q.decisionDays !== null) parts.push(`Bis zur Entscheidung im Schnitt ${formatDays(q.decisionDays)}.`);
  return parts.join(" ");
}

/** Nachreichen erlaubt? Nur solange niemand die Bewerbung angesehen oder übernommen hat. */
export function canAmend(app: { status: string; claimedById: string | null; firstReviewedAt: Date | null }) {
  return app.status === "SUBMITTED" && !app.claimedById && !app.firstReviewedAt;
}

/** Antwortarten, die nachgereicht werden können */
export const AMENDABLE_TYPES = ["SHORT_TEXT", "LONG_TEXT", "SCENARIO", "URL"] as const;
