/**
 * Bewerber muss auf dem Nordverkehr-Discord sein. Verlässt jemand den Server,
 * während seine Bewerbung läuft, schreibt der Bot ihm automatisch eine
 * Nachricht ins Portal (per DM geht nicht – kein gemeinsamer Server mehr).
 *
 * Einmal pro Austritt: `guildLeftNotifiedAt` merkt sich die Nachricht; ist die
 * Person wieder da, wird das Feld zurückgesetzt.
 *
 * Erkannt wird beim Öffnen der Bewerbung (Team oder Bewerber) und morgens per Cron.
 */
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { botLog, esc } from "@/lib/discord/botlog";
import { runOutbox } from "@/lib/discord/outbox-db";
import type { Access } from "@/lib/auth/access";
import type { ApplicationStatus } from "@prisma/client";

const WATCHED: ApplicationStatus[] = ["SUBMITTED", "IN_REVIEW", "INTERVIEW"];

/** Sichere Aussage von Discord? (Bei Fehlern oder ohne Konfiguration nichts tun) */
export function guildStateKnown(access: Pick<Access, "source"> | null | undefined): access is Pick<Access, "source"> {
  return !!access && access.source !== "error" && access.source !== "unconfigured";
}

export function leftGuildMessage(name: string, position: string, invite: string) {
  return (
    `Moin ${name},\n\n` +
    `uns ist aufgefallen, dass du gerade **nicht mehr auf unserem Discord-Server** bist. Für deine Bewerbung als **${position}** brauchen wir dich dort: ` +
    `Gespräch, Rückfragen und Nachrichten laufen über Discord.\n\n` +
    `Bitte tritt wieder bei: ${invite}\n\n` +
    `Bist du in den nächsten Tagen nicht wieder auf dem Server, können wir deine Bewerbung leider nicht weiter bearbeiten. ` +
    `Fragen? Antworte einfach hier im Portal.`
  );
}

/**
 * Stand für eine Bewerbung anwenden. Gibt "notified" zurück, wenn gerade eine
 * Nachricht verschickt wurde, "back" bei Rückkehr, sonst null.
 */
export async function applyGuildState(applicationId: string, inGuild: boolean): Promise<"notified" | "back" | null> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { id: true, publicId: true, status: true, guildLeftNotifiedAt: true, user: { select: { globalName: true, username: true } }, position: { select: { title: true } } },
  });
  if (!app) return null;

  if (inGuild) {
    if (!app.guildLeftNotifiedAt) return null;
    await db.application.update({ where: { id: app.id }, data: { guildLeftNotifiedAt: null } });
    const job = await botLog(`↩️ ${esc(app.user.globalName || app.user.username)} ist wieder auf dem Discord (**${app.publicId}**).`, { applicationId: app.id });
    if (job) await runOutbox({ ids: [job] }).catch(() => {});
    return "back";
  }

  if (!WATCHED.includes(app.status) || app.guildLeftNotifiedAt) return null;
  const now = new Date();
  // Reservieren: nur eine Instanz verschickt die Nachricht
  const claimed = await db.application.updateMany({
    where: { id: app.id, OR: [{ guildLeftNotifiedAt: null }, { guildLeftNotifiedAt: { isSet: false } }] },
    data: { guildLeftNotifiedAt: now },
  });
  if (!claimed.count) return null;

  const name = app.user.globalName || app.user.username;
  await db.message.create({
    data: {
      applicationId: app.id,
      direction: "SYSTEM",
      body: leftGuildMessage(name, app.position.title, publicEnv.discordInvite),
      // Keine DM: ohne gemeinsamen Server kann der Bot nicht schreiben
      deliveryStatus: "NOT_SENT",
    },
  });
  const job = await botLog(
    `🚪 ${esc(name)} ist **nicht mehr auf dem Discord** (**${app.publicId}**, ${app.position.title}) – der Bot hat automatisch im Portal Bescheid gegeben.`,
    { applicationId: app.id, tone: "warn", url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
  );
  if (job) await runOutbox({ ids: [job] }).catch(() => {});
  return "notified";
}

/** Alle laufenden Bewerbungen prüfen (Cron). Nutzt den Rollen-Cache, fragt Discord nur bei Bedarf. */
export async function scanApplicantsInGuild(limit = 40) {
  const { getAccess } = await import("@/lib/auth/user-access");
  const apps = await db.application.findMany({
    where: { status: { in: WATCHED } },
    select: { id: true, user: true },
    orderBy: { submittedAt: "asc" },
    take: limit,
  });
  let notified = 0;
  for (const a of apps) {
    const access = await getAccess(a.user).catch(() => null);
    if (!guildStateKnown(access)) continue;
    if ((await applyGuildState(a.id, (access as Access).inGuild)) === "notified") notified++;
  }
  return notified;
}
