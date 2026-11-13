/**
 * Bewerbungsrunden: Eine Runde fasst alle Bewerbungen zusammen, die im Zeitraum
 * eingereicht wurden (optional nur für eine Stelle) – mit Kennzahlen und Ziel.
 */
import type { PrismaClient } from "@prisma/client";

const DAY = 86_400_000;

export interface RoundStats {
  total: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  open: number;
  /** Ø Tage von Eingang bis Entscheidung */
  avgDays: number | null;
  /** Ziel erreicht (Annahmen ≥ Ziel), null = kein Ziel */
  targetReached: boolean | null;
}

export function roundStats(apps: { status: string; submittedAt: Date | null; decidedAt: Date | null }[], target: number | null): RoundStats {
  const count = (s: string) => apps.filter((a) => a.status === s).length;
  const accepted = count("ACCEPTED");
  const decided = apps.filter((a) => a.submittedAt && a.decidedAt && (a.status === "ACCEPTED" || a.status === "REJECTED"));
  const avg = decided.length ? decided.reduce((n, a) => n + (a.decidedAt!.getTime() - a.submittedAt!.getTime()) / DAY, 0) / decided.length : null;
  return {
    total: apps.length,
    accepted,
    rejected: count("REJECTED"),
    withdrawn: count("WITHDRAWN"),
    open: apps.filter((a) => ["SUBMITTED", "IN_REVIEW", "INTERVIEW"].includes(a.status)).length,
    avgDays: avg === null ? null : Math.round(avg * 10) / 10,
    targetReached: target ? accepted >= target : null,
  };
}

/** Phase einer Runde zum Zeitpunkt `now`. */
export const roundPhase = (r: { startsAt: Date; endsAt: Date }, now: number) => (now < r.startsAt.getTime() ? "geplant" : now > r.endsAt.getTime() ? "beendet" : "läuft");

export async function loadRounds(db: PrismaClient) {
  const rounds = await db.applicationRound.findMany({ orderBy: { startsAt: "desc" }, take: 50 });
  return Promise.all(
    rounds.map(async (r) => {
      const apps = await db.application.findMany({
        where: { isTest: { not: true }, submittedAt: { not: null, gte: r.startsAt, lte: r.endsAt }, ...(r.positionId ? { positionId: r.positionId } : {}) },
        select: { status: true, submittedAt: true, decidedAt: true },
      });
      return { ...r, stats: roundStats(apps, r.target) };
    }),
  );
}

const berlinHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(d));

/** Beginn eines Tages in deutscher Zeit (Sommer-/Winterzeit beachtet, auch am Umstellungstag selbst). */
function berlinDayStart(y: number, m: number, d: number) {
  // Erste Schätzung mit dem Versatz von 12 Uhr, dann an Mitternacht ausrichten (Umstellung passiert nachts)
  let t = Date.UTC(y, m - 1, d) - (berlinHour(new Date(Date.UTC(y, m - 1, d, 12))) - 12) * 3_600_000;
  const h = berlinHour(new Date(t));
  if (h === 23) t += 3_600_000;
  else if (h === 1) t -= 3_600_000;
  return new Date(t);
}

/** Tag (YYYY-MM-DD) → Beginn und Ende (Beginn des Folgetags − 1 s; Tage mit Zeitumstellung haben 23 bzw. 25 Std.). */
export function berlinDayBounds(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return { start: berlinDayStart(y, m, d), end: new Date(berlinDayStart(y, m, d + 1).getTime() - 1000) };
}
