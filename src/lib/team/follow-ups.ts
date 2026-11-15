/**
 * Wiedervorlage: „Erinnere mich am … an diese Bewerbung“. Am Tag (mit den Tagesaufgaben ab 8 Uhr)
 * kommt eine DM; in der Team-Übersicht steht sie, bis man sie als erledigt markiert.
 */
import type { PrismaClient } from "@prisma/client";
import { enqueue, runOutboxAll } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage } from "@/lib/messages/embed";

export async function sendFollowUpDms(db: PrismaClient, now = new Date()) {
  const due = await db.followUpReminder.findMany({
    where: { sentAt: null, dueAt: { lte: now } },
    select: { id: true, note: true, user: { select: { discordId: true } }, application: { select: { id: true, publicId: true, position: { select: { title: true } } } } },
    take: 200,
  });
  const ids: string[] = [];
  for (const r of due) {
    const marked = await db.followUpReminder.updateMany({ where: { id: r.id, sentAt: null }, data: { sentAt: now } });
    if (!marked.count) continue;
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: r.user.discordId,
        purpose: "team_reminder",
        message: buildApplicantMessage({
          title: "Wiedervorlage",
          body: `Du wolltest heute an **${r.application.publicId}** (${r.application.position.title}) erinnert werden.${r.note ? `\n\n> ${r.note}` : ""}`,
          publicId: r.application.publicId,
          statusUrl: `${publicEnv.appUrl}/team/bewerbungen/${r.application.id}`,
          buttonLabel: "Bewerbung öffnen",
        }),
      },
      { applicationId: r.application.id },
    );
    ids.push(job.id);
  }
  if (ids.length) await runOutboxAll(ids).catch(() => {});
  return ids.length;
}
