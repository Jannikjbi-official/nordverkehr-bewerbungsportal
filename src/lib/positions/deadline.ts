/**
 * Bewerbungsfrist einer Stelle (closesAt): Countdown-Text und Erinnerung per DM.
 * Die Stelle schließt mit den Tagesaufgaben am Tag von closesAt (deutsche Zeit).
 */
const DAY = 86_400_000;

function berlinDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Ganze Kalendertage (deutsche Zeit) von heute bis zum Fristtag. */
export function daysUntil(closesAt: Date, now = new Date()) {
  const a = Date.parse(`${berlinDay(now)}T00:00:00Z`);
  const b = Date.parse(`${berlinDay(closesAt)}T00:00:00Z`);
  return Math.round((b - a) / DAY);
}

/** „endet heute“, „endet morgen“, „endet in 5 Tagen“ – nur in den letzten 14 Tagen, sonst null. */
export function deadlineLabel(closesAt: Date | null | undefined, now = new Date()): string | null {
  if (!closesAt) return null;
  const d = daysUntil(closesAt, now);
  if (d < 0 || d > 14) return null;
  if (d === 0) return "endet heute";
  if (d === 1) return "endet morgen";
  return `endet in ${d} Tagen`;
}

/** Erinnerung fällig? Am Tag vor dem Fristtag (oder am Fristtag selbst, falls verpasst). */
export const reminderDue = (closesAt: Date, now = new Date()) => {
  const d = daysUntil(closesAt, now);
  return d >= 0 && d <= 1;
};
