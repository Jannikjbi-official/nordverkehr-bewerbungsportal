import { isAuthorizedCron } from "@/lib/cron";
import { postDailySummary } from "@/lib/team/daily-summary";
import { db } from "@/lib/db";

export const maxDuration = 60;

/** Jeden Morgen (ca. 8 Uhr deutscher Zeit): Team-Übersicht in den Teamchat. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const { applyPositionSchedule } = await import("@/lib/positions/schedule");
  await applyPositionSchedule(db).catch((e) => console.error("[positions]", e));
  const { sendInterviewReminders } = await import("@/lib/team/slots");
  await sendInterviewReminders(db).catch((e) => console.error("[reminder]", e));
  const r = await postDailySummary(db);
  return Response.json(r.posted ? { posted: true, jobs: r.jobIds.length, escalated: r.escalated } : { posted: false, reason: r.reason });
}
