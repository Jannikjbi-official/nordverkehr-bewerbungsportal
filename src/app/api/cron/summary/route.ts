import { deadlineIn, isAuthorizedCron, isScheduledHour } from "@/lib/cron";
import { postDailySummary } from "@/lib/team/daily-summary";
import { db } from "@/lib/db";

export const maxDuration = 60;

/**
 * Jeden Morgen um 8 Uhr deutscher Zeit: Team-Übersicht in den Teamchat.
 * Danach persönliche DMs an Betreuer und Entwurfs-Erinnerungen an Bewerber.
 * Wichtiges zuerst (Stellen, Erinnerungen, Übersicht), Langläufer danach mit Zeitbudget.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  if (!isScheduledHour(req, 8)) return Response.json({ skipped: "andere Stunde (Sommer-/Winterzeit)" });
  const budget = deadlineIn(45);
  const { applyPositionSchedule } = await import("@/lib/positions/schedule");
  await applyPositionSchedule(db).catch((e) => console.error("[positions]", e));
  const { sendInterviewReminders } = await import("@/lib/team/slots");
  await sendInterviewReminders(db).catch((e) => console.error("[reminder]", e));
  const r = await postDailySummary(db).catch((e) => {
    console.error("[summary]", e);
    return { posted: false as const, reason: "error", summary: undefined };
  });
  // Wochenbericht (montags), Herzschlag + Störungs-Alarm (lief der Nachtlauf?)
  const { postWeeklyReport } = await import("@/lib/team/weekly-report");
  await postWeeklyReport(db).catch((e) => console.error("[weekly]", e));
  const { beat, checkAlerts } = await import("@/lib/team/alerts");
  await beat(db, "summary").catch(() => {});
  await checkAlerts(db, ["outbox-daily"]).catch((e) => console.error("[alerts]", e));
  // Persönliche Morgen-DM an Betreuer und Erinnerung an liegengebliebene Entwürfe
  const { sendPersonalDigests } = await import("@/lib/team/daily-summary");
  await sendPersonalDigests(db, { summary: r.summary, deadline: budget.end - 20_000 }).catch((e) => console.error("[digest]", e));
  const { sendProbationReminders } = await import("@/lib/team/probation");
  await sendProbationReminders(db).catch((e) => console.error("[probation]", e));
  const { nudgeIdleClaims } = await import("@/lib/team/claim-nudge");
  await nudgeIdleClaims(db).catch((e) => console.error("[claim-nudge]", e));
  const { sendFollowUpReminders } = await import("@/lib/applications/followup");
  await sendFollowUpReminders(db).catch((e) => console.error("[followup]", e));
  const { sendDraftReminders } = await import("@/lib/applications/draft-reminder");
  await sendDraftReminders(db).catch((e) => console.error("[draft-reminder]", e));
  // Bewerber noch auf dem Discord? (automatische Bot-Nachricht bei Austritt) – mit Zeitbudget
  const { scanApplicantsInGuild } = await import("@/lib/applications/guild-watch");
  await scanApplicantsInGuild({ fresh: true, deadline: budget.end - 15_000 }).catch((e) => console.error("[guild-watch]", e));
  // Fehlende KI-Punkte nachholen (wenige pro Lauf, nur wenn noch Zeit ist)
  if (budget.left() > 20_000) {
    const { scoreMissing } = await import("@/lib/ai/scoring");
    await scoreMissing(2, budget.end - 10_000).catch((e) => console.error("[ai-score]", e));
  }
  return Response.json(r.posted ? { posted: true, jobs: r.jobIds.length, escalated: r.escalated } : { posted: false, reason: r.reason });
}
