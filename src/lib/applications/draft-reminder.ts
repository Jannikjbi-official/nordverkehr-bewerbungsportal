/**
 * Erinnerung an liegengebliebene Entwürfe: Wer einen Entwurf seit
 * `applications.draftReminderDays` Tagen nicht angefasst hat, bekommt EINMAL
 * eine freundliche DM mit Link zum Weitermachen (`draftRemindedAt`).
 * Übersprungen werden geschlossene/versteckte Stellen und gesperrte Nutzer.
 * Läuft im Morgen-Cron (/api/cron/summary).
 */
import type { PrismaClient } from "@prisma/client";
import { enqueue, runOutboxAll } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

const DAY = 86_400_000;

export function draftReminderText(name: string, position: string, deleteInDays: number | null) {
  return (
    `Moin ${name},\n\n` +
    `du hast vor ein paar Tagen angefangen, dich als **${position}** bei Nordverkehr zu bewerben – dein Entwurf ist gespeichert, aber noch nicht abgeschickt.\n\n` +
    `Mit dem Knopf unten machst du genau da weiter, wo du aufgehört hast.` +
    (deleteInDays !== null && deleteInDays > 0 ? `\n\n-# Nicht abgeschickte Entwürfe löschen wir nach etwa ${deleteInDays} weiteren Tagen automatisch.` : "") +
    `\n-# Das ist die einzige Erinnerung – keine Lust mehr? Dann einfach ignorieren.`
  );
}

export async function sendDraftReminders(db: PrismaClient, opts: { now?: Date; limit?: number } = {}) {
  const s = await getSettings();
  const days = s["applications.draftReminderDays"];
  if (!days) return 0;
  const now = opts.now ?? new Date();
  const drafts = await db.application.findMany({
    where: {
      status: "DRAFT",
      updatedAt: { lt: new Date(now.getTime() - days * DAY) },
      OR: [{ draftRemindedAt: null }, { draftRemindedAt: { isSet: false } }],
      position: { status: "OPEN" },
    },
    include: {
      user: { select: { id: true, discordId: true, globalName: true, username: true } },
      position: { select: { title: true, slug: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: opts.limit ?? 100,
  });
  if (!drafts.length) return 0;

  // Gesperrte Nutzer überspringen (aktive Sperre: nicht aufgehoben, nicht abgelaufen)
  const bans = await db.userBan.findMany({
    where: { subjectId: { in: [...new Set(drafts.map((d) => d.userId))] }, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { subjectId: true },
  });
  const banned = new Set(bans.map((b) => b.subjectId));

  const ids: string[] = [];
  for (const d of drafts) {
    if (banned.has(d.userId)) continue;
    // Reservieren: auch bei doppeltem Cron höchstens eine Erinnerung pro Entwurf
    const claimed = await db.application.updateMany({
      where: { id: d.id, status: "DRAFT", OR: [{ draftRemindedAt: null }, { draftRemindedAt: { isSet: false } }] },
      data: { draftRemindedAt: now },
    });
    if (!claimed.count) continue;
    const left = s["retention.draftDays"] - Math.floor((now.getTime() - d.updatedAt.getTime()) / DAY);
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: d.user.discordId,
        purpose: "reminder",
        message: buildApplicantMessage({
          title: "Deine Bewerbung wartet noch",
          body: draftReminderText(d.user.globalName || d.user.username, d.position.title, left > 0 ? left : null),
          statusUrl: `${publicEnv.appUrl}/bewerben/${d.position.slug}`,
          buttonLabel: "Weitermachen",
        }),
      },
      { applicationId: d.id },
    );
    ids.push(job.id);
  }
  if (ids.length) await runOutboxAll(ids).catch((e) => console.error("[draft-reminder]", e));
  return ids.length;
}
