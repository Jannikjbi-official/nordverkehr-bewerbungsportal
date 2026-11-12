import { deadlineIn, isAuthorizedCron, isScheduledHour } from "@/lib/cron";
import { releaseStuckJobs, runOutbox } from "@/lib/discord/outbox-db";
import { postNewChangelogEntries } from "@/lib/discord/changelog-post";
import { db } from "@/lib/db";

export const maxDuration = 60;

async function drainOutbox(passes = 5) {
  let total = 0;
  for (let i = 0; i < passes; i++) {
    const n = await runOutbox({ limit: 20 });
    total += n;
    if (n < 20) break;
  }
  return total;
}

/**
 * Täglich um 0 Uhr (Europe/Berlin): den abgeschlossenen Changelog-Tag posten
 * und ausstehende Discord-Nachrichten zustellen (Vercel Cron oder externer Scheduler).
 * Reihenfolge: Wichtiges zuerst (Stellen, Zustellung), Langläufer (Discord-Prüfung,
 * KI-Punkte) danach mit Zeitbudget – damit die Zustellung nie am Zeitlimit scheitert.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const budget = deadlineIn(45);
  await releaseStuckJobs(5);
  // Nicht 0 Uhr deutscher Zeit (Zwillings-Eintrag für Sommer-/Winterzeit oder häufigerer
  // Zeitplan auf Vercel Pro): nur zustellen, die täglichen Aufgaben übernimmt der 0-Uhr-Lauf
  if (!isScheduledHour(req, 0)) {
    // Changelog zur eingestellten Uhrzeit (stündliche Läufe)
    await postNewChangelogEntries(db).catch((e) => console.error("[changelog]", e));
    return Response.json({ processed: await drainOutbox(), daily: false });
  }

  const changelog = await postNewChangelogEntries(db).catch((e) => {
    console.error("[changelog]", e);
    return [];
  });
  // Stellen mit Start-/Enddatum umschalten (0 Uhr)
  const { applyPositionSchedule } = await import("@/lib/positions/schedule");
  await applyPositionSchedule(db).catch((e) => console.error("[positions]", e));
  let total = await drainOutbox();
  // Bewerber noch auf dem Discord? (auch nachts) – mit Zeitbudget
  const { scanApplicantsInGuild } = await import("@/lib/applications/guild-watch");
  await scanApplicantsInGuild({ fresh: true, deadline: budget.end - 15_000 }).catch((e) => console.error("[guild-watch]", e));
  // Fehlende KI-Punkte nachholen (wenige pro Lauf, nur wenn noch Zeit ist)
  if (budget.left() > 20_000) {
    const { scoreMissing } = await import("@/lib/ai/scoring");
    await scoreMissing(2, budget.end - 10_000).catch((e) => console.error("[ai-score]", e));
  }
  // Herzschlag + Störungs-Alarm (lief der Morgenlauf? viele Fehlschläge?)
  const { beat, checkAlerts } = await import("@/lib/team/alerts");
  await beat(db, "outbox-daily").catch(() => {});
  await checkAlerts(db, ["summary"]).catch((e) => console.error("[alerts]", e));
  // Was dabei entstanden ist (Bot-Log), gleich mitnehmen
  if (!budget.passed()) total += await drainOutbox(2);
  return Response.json({ processed: total, changelogPosted: changelog.length, daily: true });
}
