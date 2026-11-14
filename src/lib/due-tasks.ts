/**
 * Fällige Aufgaben – nur auf Abruf, keine Crons, kein Polling.
 *
 * Es gibt keine zeitgesteuerten Läufe mehr. Alles, was früher nachts oder
 * morgens per Cron lief, passiert jetzt, wenn das Portal ohnehin benutzt wird:
 *
 *  - Zustellung: fällige Discord-Nachrichten (z. B. nach der Nachtruhe oder
 *    nach einem Fehlversuch) gehen beim nächsten Aufruf im Team-Bereich raus –
 *    höchstens alle paar Minuten pro Server-Instanz.
 *  - Tagesaufgaben: beim ersten Aufruf im Team-Bereich ab 8 Uhr (deutsche Zeit)
 *    einmal pro Tag – Team-Übersicht, Erinnerungen, Stellen-Zeitplan,
 *    Changelog-Post, Löschfristen. Oder sofort per Admin-Knopf.
 *
 * Bewusst NICHT mehr automatisch: Discord-Prüfung aller Bewerber (passiert beim
 * Öffnen einer Bewerbung), KI-Punkte nachholen (Knopf an der Bewerbung) und
 * Herzschlag-Prüfungen.
 */
import { db } from "@/lib/db";
import { todayBerlin } from "@/lib/changelog";

/** Ab dieser Stunde (deutsche Zeit) laufen die Tagesaufgaben beim ersten Team-Aufruf. */
export const DAILY_FROM_HOUR = 8;

/** Aktuelle Stunde in deutscher Zeit (0–23). */
export function berlinHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));
}
const DAILY_KEY = (day: string) => `daily-run:${day}`;
const DRAIN_EVERY_MS = 5 * 60_000;

let lastDrain = 0;
let dailyCheckedFor = "";

async function drainOutbox(passes = 5, deadline = Infinity) {
  const { runOutbox } = await import("@/lib/discord/outbox-db");
  let total = 0;
  for (let i = 0; i < passes && Date.now() < deadline; i++) {
    const n = await runOutbox({ limit: 20 });
    total += n;
    if (n < 20) break;
  }
  return total;
}

export interface DailyRunResult {
  day: string;
  steps: { name: string; ok: boolean; ms: number }[];
  delivered: number;
}

/**
 * Tagesaufgaben einmal ausführen. Jede Aufgabe ist für sich abgesichert
 * (eigene Markierungen), ein doppelter Lauf schickt also nichts doppelt.
 */
export async function runDailyTasks(opts: { now?: Date; budgetMs?: number } = {}): Promise<DailyRunResult> {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const steps: DailyRunResult["steps"] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    if (Date.now() >= deadline) return steps.push({ name, ok: false, ms: 0 });
    const t = Date.now();
    const ok = await fn().then(
      () => true,
      (e) => {
        console.error(`[daily:${name}]`, e);
        return false;
      },
    );
    steps.push({ name, ok, ms: Date.now() - t });
  };

  const { releaseStuckJobs } = await import("@/lib/discord/outbox-db");
  await step("Hängende Zustellungen freigeben", () => releaseStuckJobs(5));
  await step("Changelog posten", async () => (await import("@/lib/discord/changelog-post")).postNewChangelogEntries(db, now));
  await step("Stellen-Zeitplan", async () => (await import("@/lib/positions/schedule")).applyPositionSchedule(db, now));
  await step("Gesprächs-Erinnerungen", async () => (await import("@/lib/team/slots")).sendInterviewReminders(db, now));
  const { postDailySummary, sendPersonalDigests } = await import("@/lib/team/daily-summary");
  let summary: Awaited<ReturnType<typeof postDailySummary>>["summary"] | undefined;
  await step("Team-Übersicht", async () => {
    summary = (await postDailySummary(db, { now })).summary;
  });
  await step("Wochenbericht", async () => (await import("@/lib/team/weekly-report")).postWeeklyReport(db, { now }));
  await step("Persönliche Morgen-DMs", () => sendPersonalDigests(db, { summary, deadline: deadline - 15_000 }));
  await step("Probezeit-Erinnerungen", async () => (await import("@/lib/team/probation")).sendProbationReminders(db));
  await step("Liegengebliebene Claims", async () => (await import("@/lib/team/claim-nudge")).nudgeIdleClaims(db));
  await step("Rückfragen-Fristen", async () => (await import("@/lib/applications/followup")).sendFollowUpReminders(db));
  await step("Entwurfs-Erinnerungen", async () => (await import("@/lib/applications/draft-reminder")).sendDraftReminders(db));
  await step("Löschfristen", async () => (await import("@/lib/retention")).runRetention(now));
  // Nur fehlgeschlagene Zustellungen melden – keine Herzschlag-Prüfung mehr
  await step("Störungs-Alarm", async () => (await import("@/lib/team/alerts")).checkAlerts(db, [], now));
  const delivered = await drainOutbox(5, deadline).catch(() => 0);
  return { day: todayBerlin(now), steps, delivered };
}

/**
 * Bei Aufrufen im Team-Bereich: fällige Zustellungen und – einmal pro Tag ab
 * 8 Uhr – die Tagesaufgaben anstoßen. Läuft per after() nach der Antwort,
 * die Seite wartet also nicht darauf. Ohne Team-Aufrufe passiert nichts.
 */
export async function runDueOnRequest(now = new Date()) {
  const jobs: (() => Promise<unknown>)[] = [];
  const day = todayBerlin(now);

  if (dailyCheckedFor !== day && berlinHour(now) >= DAILY_FROM_HOUR) {
    dailyCheckedFor = day; // pro Instanz höchstens eine Abfrage am Tag
    // Sperre über einen eindeutigen Eintrag: nur eine Instanz gewinnt
    const won = await db.setting.create({ data: { key: DAILY_KEY(day), value: { at: now.toISOString(), via: "request" } } }).then(
      () => true,
      () => false,
    );
    if (won) {
      jobs.push(() => runDailyTasks({ now }));
      // Alte Sperren aufräumen
      jobs.push(() => db.setting.deleteMany({ where: { key: { startsWith: "daily-run:" }, NOT: { key: DAILY_KEY(day) } } }));
    }
  }
  if (!jobs.length && Date.now() - lastDrain >= DRAIN_EVERY_MS) {
    lastDrain = Date.now();
    jobs.push(() => drainOutbox(1));
  }
  if (!jobs.length) return;
  try {
    const { after } = await import("next/server");
    after(async () => {
      for (const j of jobs) await j().catch((e) => console.error("[due]", e));
    });
  } catch {
    // außerhalb eines Requests (z. B. Tests) – egal
  }
}

/** Wann liefen die Tagesaufgaben heute? (Admin-Übersicht) */
export async function dailyRunToday(now = new Date()) {
  const row = await db.setting.findUnique({ where: { key: DAILY_KEY(todayBerlin(now)) } });
  const v = row?.value as { at?: string; via?: string } | undefined;
  return v?.at ? { at: new Date(v.at), via: v.via ?? "request" } : null;
}

/** Admin-Knopf: Tagesaufgaben sofort (auch erneut) ausführen. */
export async function runDailyTasksNow(now = new Date()) {
  const key = DAILY_KEY(todayBerlin(now));
  const value = { at: now.toISOString(), via: "manual" };
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  dailyCheckedFor = todayBerlin(now);
  return runDailyTasks({ now });
}
