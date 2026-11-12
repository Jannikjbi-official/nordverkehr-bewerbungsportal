import { isAuthorizedCron } from "@/lib/cron";
import { postDailySummary } from "@/lib/team/daily-summary";
import { db } from "@/lib/db";

export const maxDuration = 60;

/** Jeden Morgen (ca. 8 Uhr deutscher Zeit): Team-Übersicht in den Teamchat. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const { applyPositionSchedule } = await import("@/lib/positions/schedule");
  await applyPositionSchedule(db).catch((e) => console.error("[positions]", e));
  // Bewerber noch auf dem Discord? (automatische Bot-Nachricht bei Austritt)
  const { scanApplicantsInGuild } = await import("@/lib/applications/guild-watch");
  await scanApplicantsInGuild({ fresh: true }).catch((e) => console.error("[guild-watch]", e));
  const { sendInterviewReminders } = await import("@/lib/team/slots");
  await sendInterviewReminders(db).catch((e) => console.error("[reminder]", e));
  // Fehlende KI-Punkte nachholen (wenige pro Lauf, Zeitlimit)
  const { scoreMissing } = await import("@/lib/ai/scoring");
  await scoreMissing(2).catch((e) => console.error("[ai-score]", e));
  const r = await postDailySummary(db);
  return Response.json(r.posted ? { posted: true, jobs: r.jobIds.length, escalated: r.escalated } : { posted: false, reason: r.reason });
}
