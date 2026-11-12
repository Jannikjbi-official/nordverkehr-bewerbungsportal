import { isAuthorizedCron } from "@/lib/cron";
import { releaseStuckJobs, runOutbox } from "@/lib/discord/outbox-db";
import { postNewChangelogEntries } from "@/lib/discord/changelog-post";
import { db } from "@/lib/db";

export const maxDuration = 60;

/**
 * Täglich um 0 Uhr (Europe/Berlin): den abgeschlossenen Changelog-Tag posten
 * und ausstehende Discord-Nachrichten zustellen (Vercel Cron oder externer Scheduler).
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const changelog = await postNewChangelogEntries(db).catch((e) => {
    console.error("[changelog]", e);
    return [];
  });
  // Stellen mit Start-/Enddatum umschalten (0 Uhr)
  const { applyPositionSchedule } = await import("@/lib/positions/schedule");
  await applyPositionSchedule(db).catch((e) => console.error("[positions]", e));
  // Fehlende KI-Punkte nachholen (wenige pro Lauf, Zeitlimit)
  const { scoreMissing } = await import("@/lib/ai/scoring");
  await scoreMissing(2).catch((e) => console.error("[ai-score]", e));
  await releaseStuckJobs(5);
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const n = await runOutbox({ limit: 20 });
    total += n;
    if (n < 20) break;
  }
  return Response.json({ processed: total, changelogPosted: changelog.length });
}
