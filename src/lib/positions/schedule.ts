/**
 * Stellen automatisch öffnen und schließen:
 *  - nach Datum (`opensAt` / `closesAt`) – läuft in den täglichen Crons
 *  - nach Höchstzahl (`maxApplications`) – direkt nach jeder neuen Bewerbung
 * Öffnet eine Stelle, bekommen alle, die sich vorgemerkt haben, eine DM.
 * Danach wird der Stellenaufruf in Discord automatisch aktualisiert.
 */
import type { PrismaClient } from "@prisma/client";
import { enqueue, runOutbox, runOutboxAll } from "@/lib/discord/outbox-db";
import { botLog } from "@/lib/discord/botlog";
import { publicEnv } from "@/lib/env";
import { buildApplicantMessage } from "@/lib/messages/embed";

type Status = "OPEN" | "CLOSED" | "HIDDEN";

export interface ScheduledPosition {
  id: string;
  status: Status;
  opensAt: Date | null;
  closesAt: Date | null;
}

export interface Transition {
  id: string;
  to: "OPEN" | "CLOSED";
  reason: "opensAt" | "closesAt";
}

/** Welche Stellen müssen jetzt umgeschaltet werden? (Versteckte bleiben unberührt) */
export function dueTransitions(positions: ScheduledPosition[], now: Date): Transition[] {
  const out: Transition[] = [];
  for (const p of positions) {
    const closed = !!p.closesAt && p.closesAt <= now;
    if (p.status === "OPEN" && closed) out.push({ id: p.id, to: "CLOSED", reason: "closesAt" });
    else if (p.status === "CLOSED" && p.opensAt && p.opensAt <= now && !closed) out.push({ id: p.id, to: "OPEN", reason: "opensAt" });
  }
  return out;
}

/**
 * Status wurde von Hand (oder per Höchstzahl) geändert: Datumsregeln, die danach
 * sofort wieder greifen würden, leeren. Gibt nur die zu ändernden Felder zurück.
 *  - geöffnet: Startdatum ist verbraucht, ein abgelaufenes Enddatum würde sofort wieder schließen
 *  - geschlossen: Enddatum ist verbraucht, ein erreichtes Startdatum würde sofort wieder öffnen
 */
export function clearStaleSchedule(to: Status, p: { opensAt: Date | null; closesAt: Date | null }, now: Date) {
  const data: { opensAt?: null; closesAt?: null } = {};
  if (to === "OPEN") {
    if (p.opensAt) data.opensAt = null;
    if (p.closesAt && p.closesAt <= now) data.closesAt = null;
  } else if (to === "CLOSED") {
    if (p.closesAt) data.closesAt = null;
    if (p.opensAt && p.opensAt <= now) data.opensAt = null;
  }
  return data;
}

/** Bewerbungen, die auf die Höchstzahl zählen (eingereicht, nicht zurückgezogen). */
export const countingWhere = (positionId: string) => ({ positionId, submittedAt: { not: null }, status: { not: "WITHDRAWN" as const }, isTest: { not: true } });

/** Datums-Regeln anwenden. Gibt die Umschaltungen zurück. */
export async function applyPositionSchedule(db: PrismaClient, now = new Date()) {
  const positions = await db.position.findMany({
    where: { status: { in: ["OPEN", "CLOSED"] }, OR: [{ opensAt: { not: null } }, { closesAt: { not: null } }] },
    select: { id: true, title: true, slug: true, status: true, opensAt: true, closesAt: true },
  });
  const due = dueTransitions(positions as ScheduledPosition[], now);
  const logIds: string[] = [];
  for (const t of due) {
    const p = positions.find((x) => x.id === t.id)!;
    // Datum verbraucht → zurücksetzen, sonst würde die Regel morgen erneut greifen
    const res = await db.position.updateMany({
      where: { id: t.id, status: p.status },
      data: t.to === "OPEN" ? { status: "OPEN", opensAt: null } : { status: "CLOSED", closesAt: null },
    });
    if (!res.count) continue; // andere Instanz war schneller
    await db.auditLog.create({ data: { action: "position.auto", targetType: "position", targetId: t.id, meta: { to: t.to, reason: t.reason } } });
    const log = await botLog(t.to === "OPEN" ? `🟢 **${p.title}** ist jetzt automatisch geöffnet (Startdatum erreicht).` : `🔴 **${p.title}** wurde automatisch geschlossen (Enddatum erreicht).`);
    if (log) logIds.push(log);
    if (t.to === "OPEN") await notifyPositionOpened(db, p);
  }
  if (logIds.length) await runOutboxAll(logIds).catch(() => {});
  if (due.length) await refreshJobs(db);
  return due;
}

/** Nach einer neuen Bewerbung: Höchstzahl erreicht → Stelle schließen. */
export async function closeIfFull(db: PrismaClient, positionId: string) {
  const p = await db.position.findUnique({ where: { id: positionId }, select: { id: true, title: true, status: true, maxApplications: true } });
  if (!p || p.status !== "OPEN" || !p.maxApplications) return false;
  const count = await db.application.count({ where: countingWhere(p.id) });
  if (count < p.maxApplications) return false;
  // Voll → auch geplante Daten leeren, sonst öffnet der Cron die volle Stelle am Startdatum wieder
  const res = await db.position.updateMany({ where: { id: p.id, status: "OPEN" }, data: { status: "CLOSED", opensAt: null, closesAt: null } });
  if (!res.count) return false;
  await db.auditLog.create({ data: { action: "position.auto", targetType: "position", targetId: p.id, meta: { to: "CLOSED", reason: "max", count } } });
  const job = await botLog(`🔴 **${p.title}** wurde automatisch geschlossen – ${count} von ${p.maxApplications} Bewerbungen erreicht.`, { tone: "warn" });
  if (job) await runOutbox({ ids: [job] }).catch(() => {});
  await refreshJobs(db);
  return true;
}

/** DM an alle, die bei neuen Stellen Bescheid bekommen möchten. */
export async function notifyPositionOpened(db: PrismaClient, position: { id: string; title: string; slug: string }) {
  const users = await db.user.findMany({ where: { notifyNewPositions: true }, select: { discordId: true } });
  if (!users.length) return 0;
  const url = `${publicEnv.appUrl}/positionen/${position.slug}`;
  const message = buildApplicantMessage({
    title: `${position.title} – jetzt bewerben!`,
    body: `Moin! Die Stelle **${position.title}** bei Nordverkehr ist ab sofort offen. Du wolltest Bescheid bekommen – hier geht's direkt zur Bewerbung.\n\n-# Keine Benachrichtigungen mehr? Im Portal unter „Konto“ abschalten.`,
    statusUrl: url,
    buttonLabel: "Jetzt bewerben",
  });
  const ids: string[] = [];
  for (const u of users) {
    const job = await enqueue({ type: "DM", discordUserId: u.discordId, purpose: "notify", message });
    ids.push(job.id);
  }
  // DMs gleich zustellen (in Paketen) – höchstens ~15 s lang, der Rest geht mit der
  // nächsten Zustellung raus (der Cron läuft danach weiter und darf nicht ins Zeitlimit laufen)
  await runOutboxAll(ids, { deadline: Date.now() + 15_000 }).catch(() => {});
  return ids.length;
}

async function refreshJobs(db: PrismaClient) {
  const { refreshJobsPostQuietly } = await import("@/lib/discord/jobs-post");
  await refreshJobsPostQuietly(db).catch((e) => console.error("[positions] Stellenaufruf", e));
}
