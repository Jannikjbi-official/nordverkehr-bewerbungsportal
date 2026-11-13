/**
 * Rückfrage mit Frist: Hat das Team beim Schreiben „Antwort erwartet“ markiert
 * (`awaitingReplySince`) und der Bewerber antwortet nicht, …
 *  - bekommt er nach `followup.reminderDays` einmal eine Erinnerung (Portal + DM),
 *  - erscheint die Bewerbung nach `followup.closeDays` in der Team-Übersicht unter
 *    „Keine Antwort – schließen?“ (Vorschlag, nichts passiert automatisch).
 * Antwortet der Bewerber, endet die Frist (siehe replyToTeamAction).
 * Läuft im Morgen-Cron.
 */
import type { PrismaClient } from "@prisma/client";
import { ACTIVE_STATUSES } from "@/lib/applications/status";
import { enqueue, runOutboxAll } from "@/lib/discord/outbox-db";
import { botLog } from "@/lib/discord/botlog";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage } from "@/lib/messages/embed";
import { PORTAL_ANSWER_LABEL, portalAnswerUrl } from "@/lib/discord/interactions";
import { getSettings } from "@/lib/settings";

const DAY = 86_400_000;

export function followUpReminderText(name: string, position: string, closeDays: number) {
  return (
    `Moin ${name},\n\nwir hatten dir zu deiner Bewerbung als **${position}** eine Rückfrage geschickt und warten noch auf deine Antwort. ` +
    `Antworte einfach im Portal – dann geht es weiter.\n\n` +
    `-# Kommt in den nächsten ${Math.max(1, closeDays)} Tagen keine Antwort, können wir die Bewerbung leider nicht weiter bearbeiten.`
  );
}

export async function sendFollowUpReminders(db: PrismaClient, now = new Date()) {
  const s = await getSettings();
  const days = s["followup.reminderDays"];
  if (!days) return 0;
  const apps = await db.application.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      // not: null ist nötig – bei MongoDB trifft „lte“ sonst auch leere Felder
      awaitingReplySince: { not: null, lte: new Date(now.getTime() - days * DAY) },
      OR: [{ awaitingRemindedAt: null }, { awaitingRemindedAt: { isSet: false } }],
    },
    include: { user: { select: { discordId: true, globalName: true, username: true } }, position: { select: { title: true } } },
    take: 100,
  });
  const ids: string[] = [];
  for (const a of apps) {
    // Bewerber hat Abwesenheit gemeldet → bis dahin keine Erinnerung
    if (a.applicantAwayUntil && a.applicantAwayUntil.getTime() > now.getTime()) continue;
    // Reservieren: höchstens eine Erinnerung pro Rückfrage
    const claimed = await db.application.updateMany({
      where: { id: a.id, awaitingReplySince: { equals: a.awaitingReplySince, not: null }, OR: [{ awaitingRemindedAt: null }, { awaitingRemindedAt: { isSet: false } }] },
      data: { awaitingRemindedAt: now },
    });
    if (!claimed.count) continue;
    const body = followUpReminderText(a.user.globalName || a.user.username, a.position.title, s["followup.closeDays"] - days);
    const message = await db.message.create({ data: { applicationId: a.id, direction: "SYSTEM", body, deliveryStatus: "PENDING" } });
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: a.user.discordId,
        purpose: "status",
        message: buildApplicantMessage({
          title: "Wir warten auf deine Antwort",
          body,
          publicId: a.publicId,
          statusUrl: portalAnswerUrl(publicEnv.appUrl, a.id),
          buttonLabel: PORTAL_ANSWER_LABEL,
        }),
      },
      { messageId: message.id, applicationId: a.id },
    );
    ids.push(job.id);
    const log = await botLog(`⏰ Erinnerung an **${a.publicId}** (${a.position.title}) verschickt – keine Antwort auf die Rückfrage seit ${days} Tag(en)`, {
      applicationId: a.id,
      url: `${publicEnv.appUrl}/team/bewerbungen/${a.id}`,
    });
    if (log) ids.push(log);
  }
  if (ids.length) await runOutboxAll(ids, { deadline: Date.now() + 15_000 }).catch((e) => console.error("[followup]", e));
  return apps.length;
}
