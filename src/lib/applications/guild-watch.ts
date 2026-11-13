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
/** Bann auf dem Nordverkehr-Discord nachsehen. null = nicht gebannt oder nicht prüfbar (fehlende Rechte, kein Bot). */
export async function lookupBan(discordId: string): Promise<{ reason: string | null } | null> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return null;
  try {
    const { getDiscordApi } = await import("@/lib/discord/client");
    const api = getDiscordApi();
    return api.getBan ? await api.getBan(guildId, discordId) : null;
  } catch {
    return null;
  }
}

/** Bewerbung als „auf dem Discord gebannt“ markieren (einmal), Hinweis + Bot-Log. */
async function markBanned(
  app: { id: string; publicId: string | null; flags: unknown; guildBannedAt: Date | null; user: { globalName: string | null; username: string }; position: { title: string } },
  reason: string | null,
  now: Date,
): Promise<"banned" | null> {
  if (app.guildBannedAt) return null;
  const flags = ((app.flags as { code: string; message: string }[]) ?? []).filter((f) => f.code !== "guild_banned");
  flags.push({ code: "guild_banned", message: `Auf dem Nordverkehr-Discord gebannt${reason ? ` (Grund: ${reason.slice(0, 120)})` : ""}.` });
  const res = await db.application.updateMany({
    where: { id: app.id, OR: [{ guildBannedAt: null }] },
    data: { guildBannedAt: now, guildBanReason: reason, guildLeftNotifiedAt: now, flags: flags as never },
  });
  if (!res.count) return null;
  const name = app.user.globalName || app.user.username;
  const job = await botLog(`⛔ ${esc(name)} ist auf dem Discord **gebannt** (**${app.publicId}**, ${app.position.title})${reason ? ` – Grund: ${esc(reason.slice(0, 200))}` : ""}. Keine Nachricht an den Bewerber.`, {
    applicationId: app.id,
    tone: "warn",
    url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
  });
  if (job) await runOutbox({ ids: [job] }).catch(() => {});
  return "banned";
}

export async function applyGuildState(applicationId: string, inGuild: boolean): Promise<"notified" | "back" | "banned" | null> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { id: true, publicId: true, status: true, guildLeftNotifiedAt: true, guildBannedAt: true, flags: true, user: { select: { globalName: true, username: true, discordId: true } }, position: { select: { title: true } } },
  });
  if (!app) return null;

  if (inGuild) {
    if (!app.guildLeftNotifiedAt) return null;
    // Bedingt zurücksetzen: erkennen mehrere Stellen die Rückkehr gleichzeitig, loggt nur eine
    const reset = await db.application.updateMany({
      where: { id: app.id, guildLeftNotifiedAt: { not: null } },
      // Wieder auf dem Server = auch kein Bann mehr
      data: {
        guildLeftNotifiedAt: null,
        guildBannedAt: null,
        guildBanReason: null,
        flags: ((app.flags as { code: string }[]) ?? []).filter((f) => f.code !== "guild_banned") as never,
      },
    });
    if (reset.count !== 1) return null;
    const job = await botLog(`↩️ ${esc(app.user.globalName || app.user.username)} ist wieder auf dem Discord (**${app.publicId}**).`, { applicationId: app.id });
    if (job) await runOutbox({ ids: [job] }).catch(() => {});
    return "back";
  }

  if (!WATCHED.includes(app.status)) return null;
  const now = new Date();
  if (app.guildLeftNotifiedAt) {
    // Schon als „weg“ gemeldet – wurde die Person inzwischen gebannt? (einmal markieren)
    if (app.guildBannedAt) return null;
    const later = await lookupBan(app.user.discordId);
    return later ? markBanned(app, later.reason, now) : null;
  }
  // Gebannt? Dann keine „tritt wieder bei“-Nachricht, sondern ein Hinweis fürs Team
  const ban = await lookupBan(app.user.discordId);
  if (ban) return markBanned(app, ban.reason, now);
  // Reservieren: nur eine Instanz verschickt die Nachricht
  const claimed = await db.application.updateMany({
    where: { id: app.id, OR: [{ guildLeftNotifiedAt: null }] },
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

export interface ScanResult {
  checked: number;
  notInGuild: number;
  notified: number;
  back: number;
  unknown: number;
}

/**
 * Alle laufenden Bewerbungen prüfen. `fresh` fragt Discord direkt (statt Rollen-Cache).
 * Läuft parallel in kleinen Gruppen, Discord-Ratelimits regelt der REST-Client.
 */
export async function scanApplicantsInGuild(opts: { limit?: number; fresh?: boolean; deadline?: number } = {}): Promise<ScanResult> {
  const { getAccess } = await import("@/lib/auth/user-access");
  const apps = await db.application.findMany({
    where: { status: { in: WATCHED } },
    select: { id: true, user: true },
    orderBy: { submittedAt: "asc" },
    take: opts.limit ?? 200,
  });
  const r: ScanResult = { checked: 0, notInGuild: 0, notified: 0, back: 0, unknown: 0 };
  const one = async (a: (typeof apps)[number]) => {
    const access = await getAccess(a.user, { force: !!opts.fresh }).catch(() => null);
    if (!guildStateKnown(access)) {
      r.unknown++;
      return;
    }
    r.checked++;
    const inGuild = (access as Access).inGuild;
    if (!inGuild) r.notInGuild++;
    const res = await applyGuildState(a.id, inGuild).catch(() => null);
    if (res === "notified") r.notified++;
    if (res === "back") r.back++;
  };
  for (let i = 0; i < apps.length; i += 5) {
    // Zeitbudget (Crons): lieber abbrechen, als dass die ganze Funktion am Limit scheitert
    if (opts.deadline && Date.now() >= opts.deadline) break;
    await Promise.all(apps.slice(i, i + 5).map(one));
  }
  return r;
}

/** Höchstens alle 15 Minuten im Hintergrund prüfen (z. B. wenn das Team das Dashboard öffnet). */
export async function scanIfDue(minutes = 15) {
  // Ein Eintrag pro Zeitfenster: nur wer ihn anlegen kann, prüft (eindeutiger Key)
  const key = `guildscan:${Math.floor(Date.now() / (minutes * 60_000))}`;
  if (await db.setting.findUnique({ where: { key }, select: { key: true } })) return null;
  try {
    await db.setting.create({ data: { key, value: { at: new Date().toISOString() } } });
  } catch {
    return null; // andere Instanz war schneller
  }
  // Alte Fenster aufräumen
  await db.setting.deleteMany({ where: { key: { startsWith: "guildscan:" }, NOT: { key } } }).catch(() => {});
  return scanApplicantsInGuild();
}
