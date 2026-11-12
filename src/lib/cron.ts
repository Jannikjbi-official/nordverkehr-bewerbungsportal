import { timingSafeEqual } from "node:crypto";

/** Vercel Cron schickt `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Aktuelle Stunde in deutscher Zeit (0–23). */
export function berlinHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));
}

/**
 * Vercel-Crons laufen in UTC. Damit Jobs zur festen deutschen Uhrzeit laufen
 * (Sommer- und Winterzeit), steht jeder Job zweimal in `vercel.json` – eine Stunde
 * auseinander. Nur der Lauf, der gerade in die gewünschte deutsche Stunde fällt,
 * arbeitet; der andere endet sofort. Gilt nur für Vercel-Cron-Aufrufe – ein externer
 * Scheduler oder ein Aufruf von Hand (curl mit CRON_SECRET) läuft immer.
 */
export function isScheduledHour(req: Request, berlinHourWanted: number, now = new Date()) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua.toLowerCase().startsWith("vercel-cron")) return true;
  return berlinHour(now) === berlinHourWanted;
}

/** Zeitbudget innerhalb von `maxDuration` (Sicherheitsabstand für das Antworten). */
export function deadlineIn(seconds: number, start = Date.now()) {
  const end = start + seconds * 1000;
  return { end, left: () => end - Date.now(), passed: () => Date.now() >= end };
}
