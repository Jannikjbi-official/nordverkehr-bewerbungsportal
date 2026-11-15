/**
 * Tagesaufgabe: Wer „Erinnere mich“ gedrückt hat, bekommt am Tag vor Fristende eine DM –
 * außer er hat sich auf die Stelle schon beworben (Entwurf zählt nicht).
 */
import type { PrismaClient } from "@prisma/client";
import { enqueue, runOutboxAll } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage } from "@/lib/messages/embed";
import { deadlineLabel, reminderDue } from "@/lib/positions/deadline";

export async function sendDeadlineReminders(db: PrismaClient, now = new Date()) {
  const soon = new Date(now.getTime() + 3 * 86_400_000);
  const rows = await db.deadlineReminder.findMany({
    where: { sentAt: null, position: { status: "OPEN", closesAt: { not: null, lte: soon } } },
    select: {
      id: true,
      userId: true,
      user: { select: { discordId: true } },
      position: { select: { id: true, slug: true, title: true, closesAt: true } },
    },
    take: 200,
  });
  const ids: string[] = [];
  for (const r of rows) {
    if (!r.position.closesAt || !reminderDue(r.position.closesAt, now)) continue;
    const marked = await db.deadlineReminder.updateMany({ where: { id: r.id, sentAt: null }, data: { sentAt: now } });
    if (!marked.count) continue;
    const applied = await db.application.count({ where: { userId: r.userId, positionId: r.position.id, status: { not: "DRAFT" } } });
    if (applied) continue;
    const job = await enqueue({
      type: "DM",
      discordUserId: r.user.discordId,
      purpose: "notify",
      message: buildApplicantMessage({
        title: `${r.position.title}: Frist ${deadlineLabel(r.position.closesAt, now) ?? "endet bald"}`,
        body: `Du wolltest erinnert werden: Die Bewerbungsphase für **${r.position.title}** ${deadlineLabel(r.position.closesAt, now) ?? "endet bald"}.\n\nAngefangene Entwürfe werden automatisch gespeichert – du kannst direkt weitermachen.`,
        statusUrl: `${publicEnv.appUrl}/positionen/${r.position.slug}`,
        buttonLabel: "Zur Stelle",
      }),
    });
    ids.push(job.id);
  }
  if (ids.length) await runOutboxAll(ids).catch(() => {});
  return ids.length;
}
