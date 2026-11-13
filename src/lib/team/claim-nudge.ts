/**
 * Liegengebliebene Claims: Betreut jemand eine Bewerbung seit X Tagen, ohne dass
 * seitdem etwas passiert ist (Statuswechsel, Nachricht ans Team/Bewerber, Kommentar),
 * bekommt er einmal eine DM: bearbeiten oder freigeben. Einmal pro Claim.
 */
import type { PrismaClient } from "@prisma/client";
import { enqueue, runOutboxAll } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

const DAY = 86_400_000;

/** Wurde seit dem Claim etwas getan? (rein, für Tests) */
export function idleSinceClaim(claimedAt: Date, activity: (Date | null | undefined)[]) {
  return !activity.some((d) => d && d.getTime() > claimedAt.getTime());
}

export async function nudgeIdleClaims(db: PrismaClient, now = new Date()) {
  const s = await getSettings();
  const days = s["team.claimNudgeDays"];
  if (!days) return 0;
  const before = new Date(now.getTime() - days * DAY);
  const apps = await db.application.findMany({
    where: { status: { in: ["SUBMITTED", "IN_REVIEW"] }, claimedById: { not: null }, claimedAt: { not: null, lte: before }, isTest: { not: true } },
    select: {
      id: true,
      publicId: true,
      claimedAt: true,
      claimRemindedAt: true,
      position: { select: { title: true } },
      claimedBy: { select: { discordId: true, globalName: true, username: true, awayUntil: true } },
      statusChanges: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      comments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      messages: { where: { direction: "TEAM_TO_APPLICANT" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    take: 100,
  });
  const ids: string[] = [];
  for (const a of apps) {
    if (!a.claimedAt || !a.claimedBy) continue;
    if (a.claimedBy.awayUntil && a.claimedBy.awayUntil.getTime() > now.getTime()) continue; // Betreuer abwesend
    if (a.claimRemindedAt && a.claimRemindedAt.getTime() >= a.claimedAt.getTime()) continue; // für diesen Claim schon erinnert
    if (!idleSinceClaim(a.claimedAt, [a.statusChanges[0]?.createdAt, a.comments[0]?.createdAt, a.messages[0]?.createdAt])) continue;
    // Einmal markieren (bedingt, falls zwei Läufe parallel)
    const marked = await db.application.updateMany({
      where: { id: a.id, claimedAt: a.claimedAt, OR: [{ claimRemindedAt: null }, { claimRemindedAt: { isSet: false } }, { claimRemindedAt: { lt: a.claimedAt } }] },
      data: { claimRemindedAt: now },
    });
    if (!marked.count) continue;
    const idleDays = Math.floor((now.getTime() - a.claimedAt.getTime()) / DAY);
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: a.claimedBy.discordId,
        purpose: "team_reminder",
        message: buildApplicantMessage({
          title: "Bewerbung wartet auf dich",
          body: `Du betreust **${a.publicId}** (${a.position.title}) seit ${idleDays} Tagen – seitdem ist nichts passiert.\n\nSchau kurz rein: Nachricht schreiben, Status ändern oder die Bewerbung freigeben, damit jemand anderes übernehmen kann.`,
          publicId: a.publicId,
          statusUrl: `${publicEnv.appUrl}/team/bewerbungen/${a.id}`,
          buttonLabel: "Bewerbung öffnen",
        }),
      },
      { applicationId: a.id },
    );
    ids.push(job.id);
  }
  if (ids.length) await runOutboxAll(ids).catch(() => {});
  return ids.length;
}
