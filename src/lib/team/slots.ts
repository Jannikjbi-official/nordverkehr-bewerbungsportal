/**
 * Gesprächstermine zum Selbstbuchen:
 *  - Das Team legt freie Termine an (Team → Termine).
 *  - Bewerber im Status „Gespräch“ ohne festen Termin buchen im Dashboard einen.
 *    Umbuchen geht bis BOOK_LOCK_HOURS vor dem Termin.
 *  - Morgens bekommt jeder Bewerber mit Termin am selben Tag eine Erinnerungs-DM.
 * Verlässt eine Bewerbung den Status „Gespräch“, wird ihr künftiger Termin wieder frei.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { botLog, esc } from "@/lib/discord/botlog";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage, discordTime } from "@/lib/messages/embed";
import { endOfBerlinDay } from "@/lib/team/daily-summary";
import { getSettings } from "@/lib/settings";
import { nightEndsAt } from "@/lib/night";

/** Termine müssen mindestens so weit in der Zukunft liegen, um buchbar zu sein */
export const BOOK_MIN_LEAD_HOURS = 2;
/** Umbuchen/Absagen nur bis so viele Stunden vorher */
export const BOOK_LOCK_HOURS = 12;
const HOUR = 3_600_000;

export class SlotError extends Error {}

/** Startzeiten für mehrere Termine am Stück (z. B. 19:00, 19:30, 20:00 …). */
export function slotTimes(start: Date, count: number, durationMin: number, gapMin = 0) {
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * (durationMin + gapMin) * 60_000));
}

export function canRebook(current: { startsAt: Date } | null, now: Date) {
  return !current || current.startsAt.getTime() - now.getTime() >= BOOK_LOCK_HOURS * HOUR;
}

/** Freie, buchbare Termine (ab jetzt + Vorlauf). */
export function listFreeSlots(db: PrismaClient, now = new Date()) {
  return db.interviewSlot.findMany({
    where: { startsAt: { gte: new Date(now.getTime() + BOOK_MIN_LEAD_HOURS * HOUR) }, OR: [{ applicationId: null }, { applicationId: { isSet: false } }] },
    orderBy: { startsAt: "asc" },
    take: 60,
  });
}

/** Bewerber bucht (oder wechselt auf) einen Termin. */
export async function bookSlot(db: PrismaClient, opts: { userId: string; applicationId: string; slotId: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const app = await db.application.findFirst({
    where: { id: opts.applicationId, userId: opts.userId },
    include: { user: { select: { globalName: true, username: true } }, slot: true, position: { select: { title: true } } },
  });
  if (!app) throw new SlotError("Bewerbung nicht gefunden.");
  if (app.status !== "INTERVIEW") throw new SlotError("Termine kannst du erst buchen, wenn wir dich zum Gespräch einladen.");
  if (!app.slot && app.interviewAt) throw new SlotError("Das Team hat schon einen festen Termin mit dir ausgemacht.");
  if (app.slot?.id === opts.slotId) return app.slot;
  if (!canRebook(app.slot, now)) throw new SlotError(`Umbuchen geht nur bis ${BOOK_LOCK_HOURS} Stunden vor dem Termin. Schreib dem Team eine Nachricht.`);

  const slot = await db.$transaction(async (tx) => {
    const target = await tx.interviewSlot.findUnique({ where: { id: opts.slotId } });
    if (!target || target.startsAt.getTime() < now.getTime() + BOOK_MIN_LEAD_HOURS * HOUR) throw new SlotError("Dieser Termin ist nicht mehr buchbar.");
    if (app.slot) await tx.interviewSlot.update({ where: { id: app.slot.id }, data: { applicationId: null, bookedAt: null } });
    const res = await tx.interviewSlot.updateMany({
      where: { id: opts.slotId, OR: [{ applicationId: null }, { applicationId: { isSet: false } }] },
      data: { applicationId: app.id, bookedAt: now },
    });
    if (!res.count) throw new SlotError("Den Termin hat gerade jemand anderes gebucht. Such dir einen anderen aus.");
    await tx.application.update({ where: { id: app.id }, data: { interviewAt: target.startsAt, interviewRemindedFor: null } });
    await tx.auditLog.create({ data: { actorId: opts.userId, action: "application.slot_booked", targetType: "application", targetId: app.id, meta: { at: target.startsAt.toISOString() } } });
    return target;
  });

  const job = await botLog(
    `📅 ${esc(app.user.globalName || app.user.username)} hat für **${app.publicId}** (${app.position.title}) ${app.slot ? "umgebucht auf" : "den Termin"} ${discordTime(slot.startsAt, "f")} gebucht`,
    { applicationId: app.id, url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
  );
  if (job) await runOutbox({ ids: [job] }).catch(() => {});
  return slot;
}

/**
 * Künftigen Termin einer Bewerbung wieder freigeben (Status ist nicht mehr „Gespräch“).
 * War der Termin selbst gebucht, verschwindet auch `interviewAt` – sonst sähe der
 * Bewerber bei einem zweiten Gespräch den alten Slot als „festen Team-Termin“.
 * Vom Team fest eingetragene Zeiten (ohne passenden Slot) bleiben unangetastet.
 */
export async function releaseFutureSlot(db: PrismaClient | Prisma.TransactionClient, applicationId: string, now = new Date()) {
  const slot = await db.interviewSlot.findFirst({ where: { applicationId, startsAt: { gt: now } } });
  if (!slot) return { count: 0 };
  await db.interviewSlot.updateMany({ where: { id: slot.id, applicationId }, data: { applicationId: null, bookedAt: null } });
  await db.application.updateMany({
    where: { id: applicationId, interviewAt: slot.startsAt },
    data: { interviewAt: null, interviewRemindedFor: null },
  });
  return { count: 1 };
}

/**
 * Bewerbung kommt (wieder) in „Gespräch“: ein vergangener Termin aus einer früheren
 * Runde zählt nicht mehr – Termin leeren und alten Slot lösen, damit neu gebucht werden kann.
 */
export async function clearPastInterview(db: PrismaClient | Prisma.TransactionClient, applicationId: string, now = new Date()) {
  await db.interviewSlot.updateMany({ where: { applicationId, startsAt: { lte: now } }, data: { applicationId: null } });
  await db.application.updateMany({
    where: { id: applicationId, interviewAt: { lte: now } },
    data: { interviewAt: null, interviewRemindedFor: null },
  });
}

/** Erinnerungs-DM an alle Bewerber, die heute (deutsche Zeit) ihr Gespräch haben. */
export async function sendInterviewReminders(db: PrismaClient, now = new Date()) {
  const settings = await getSettings();
  const apps = await db.application.findMany({
    where: { status: "INTERVIEW", interviewAt: { gte: now, lt: endOfBerlinDay(now) } },
    include: { user: { select: { discordId: true, globalName: true, username: true } }, position: { select: { title: true } } },
  });
  const ids: string[] = [];
  for (const a of apps) {
    if (!a.interviewAt || a.interviewRemindedFor?.getTime() === a.interviewAt.getTime()) continue;
    const claimed = await db.application.updateMany({
      where: { id: a.id, interviewAt: a.interviewAt, OR: [{ interviewRemindedFor: null }, { interviewRemindedFor: { isSet: false } }, { interviewRemindedFor: { not: a.interviewAt } }] },
      data: { interviewRemindedFor: a.interviewAt },
    });
    if (!claimed.count) continue;
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: a.user.discordId,
        purpose: "reminder",
        // Gespräch vor Ende der Nachtruhe → Erinnerung trotzdem sofort
        ignoreNight: a.interviewAt < nightEndsAt(settings, now),
        message: buildApplicantMessage({
          title: "Heute ist dein Gespräch",
          body: `Moin ${a.user.globalName || a.user.username}, kurze Erinnerung: Dein Gespräch für **${a.position.title}** ist **heute um ${discordTime(a.interviewAt, "t")} Uhr** auf TeamSpeak.${a.interviewNote ? `\n\n${a.interviewNote}` : ""}\n\nKommst du nicht? Sag bitte im Portal Bescheid.`,
          publicId: a.publicId,
          statusUrl: `${publicEnv.appUrl}/dashboard/${a.id}`,
        }),
      },
      { applicationId: a.id },
    );
    ids.push(job.id);
  }
  if (ids.length) await runOutbox({ ids }).catch((e) => console.error("[reminder]", e));
  return ids.length;
}
