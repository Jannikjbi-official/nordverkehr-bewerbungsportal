import "server-only";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { enqueue } from "@/lib/discord/outbox-db";
import { canTeamTransition } from "@/lib/applications/status";
import { cooldownUntil, effectiveCooldownDays } from "@/lib/applications/rules";
import { buildApplicantMessage } from "@/lib/messages/embed";
import { buildTemplateVars, renderTemplate, type TemplateVars } from "@/lib/messages/placeholders";
import type { ApplicationStatus } from "@prisma/client";
import { UserFacingError } from "@/lib/applications/service";
import { botLog, esc } from "@/lib/discord/botlog";
import { avatarUrl } from "@/lib/discord/snowflake";
import { STATUS_LABEL } from "@/lib/applications/status";

type Actor = { id: string; globalName: string | null; username: string; discordId: string; avatar: string | null; isAdmin: boolean };
const actorName = (a: { globalName: string | null; username: string }) => a.globalName || a.username;

const FINAL: ApplicationStatus[] = ["ACCEPTED", "REJECTED"];

/** Statuswechsel durch das Team (inkl. optionaler Rollenvergabe bei Annahme). */
export async function changeStatus(opts: {
  applicationId: string;
  to: ApplicationStatus;
  actorId: string;
  note?: string | null;
  reason?: string | null;
}) {
  const app = await db.application.findUnique({ where: { id: opts.applicationId }, include: { position: true, user: true } });
  if (!app) throw new UserFacingError("Bewerbung nicht gefunden.");
  if (app.status === opts.to) return { jobIds: [] as string[] };
  if (!canTeamTransition(app.status, opts.to)) {
    throw new UserFacingError(`Wechsel von „${app.status}“ nach „${opts.to}“ ist nicht möglich.`);
  }
  const settings = await getSettings();
  const now = new Date();
  const jobIds: string[] = [];

  await db.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: app.id },
      data: {
        status: opts.to,
        firstReviewedAt: app.firstReviewedAt ?? (app.status === "SUBMITTED" ? now : undefined),
        decidedAt: FINAL.includes(opts.to) ? now : null,
        decidedById: FINAL.includes(opts.to) ? opts.actorId : null,
        rejectionReason: opts.to === "REJECTED" ? (opts.reason ?? app.rejectionReason) : null,
        // Angenommen → Probezeit startet (Einarbeitung siehe lib/team/onboarding.ts)
        ...(opts.to === "ACCEPTED" && settings["onboarding.probationDays"] > 0
          ? { probationUntil: new Date(now.getTime() + settings["onboarding.probationDays"] * 86_400_000) }
          : {}),
      },
    });
    await tx.statusChange.create({
      data: { applicationId: app.id, from: app.status, to: opts.to, actorId: opts.actorId, note: opts.note ?? null },
    });
    // Nicht mehr im Gespräch → künftigen Selbstbucher-Termin wieder freigeben
    if (opts.to !== "INTERVIEW") await tx.interviewSlot.updateMany({ where: { applicationId: app.id, startsAt: { gt: now } }, data: { applicationId: null, bookedAt: null } });
    const actor = await tx.user.findUnique({ where: { id: opts.actorId }, select: { globalName: true, username: true } });
    const logJob = await botLog(
      `🔁 **${app.publicId}** (${app.position.title}): ${STATUS_LABEL[app.status]} → **${STATUS_LABEL[opts.to]}** – von ${esc(actor ? actorName(actor) : "Team")}`,
      { tx, applicationId: app.id, url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
    );
    if (logJob) jobIds.push(logJob);
    await tx.auditLog.create({
      data: {
        actorId: opts.actorId,
        action: "application.status",
        targetType: "application",
        targetId: app.id,
        meta: { from: app.status, to: opts.to, publicId: app.publicId },
      },
    });

    const e = env();
    if (opts.to === "ACCEPTED" && settings["discord.autoRoleOnAccept"] && app.position.acceptRoleId && e.DISCORD_GUILD_ID) {
      const job = await enqueue(
        {
          type: "ADD_ROLE",
          guildId: e.DISCORD_GUILD_ID,
          discordUserId: app.user.discordId,
          roleId: app.position.acceptRoleId,
          reason: `Bewerbung ${app.publicId} angenommen`,
        },
        { tx, applicationId: app.id },
      );
      jobIds.push(job.id);
    }
  });
  return { jobIds };
}

/**
 * Bewerbung claimen (betreuen), freigeben oder übernehmen.
 * Freigeben dürfen der Claimer selbst und Admins; übernehmen darf jedes Teammitglied.
 */
export async function setClaim(opts: { applicationId: string; actor: Actor; action: "claim" | "release" }) {
  const app = await db.application.findUnique({
    where: { id: opts.applicationId },
    include: { position: { select: { title: true } }, claimedBy: { select: { id: true, globalName: true, username: true } } },
  });
  if (!app || app.status === "DRAFT") throw new UserFacingError("Bewerbung nicht gefunden.");
  const jobIds: string[] = [];

  if (opts.action === "release") {
    if (!app.claimedById) return { jobIds };
    if (app.claimedById !== opts.actor.id && !opts.actor.isAdmin) throw new UserFacingError("Nur wer die Bewerbung geclaimt hat (oder ein Admin) kann sie freigeben.");
    await db.application.update({ where: { id: app.id }, data: { claimedById: null, claimedAt: null } });
    const j = await botLog(`🔓 ${esc(actorName(opts.actor))} hat **${app.publicId}** freigegeben`, { applicationId: app.id });
    if (j) jobIds.push(j);
  } else {
    if (app.claimedById === opts.actor.id) return { jobIds };
    // Bedingtes Update: niemand claimt versehentlich über einen gleichzeitigen Claim hinweg
    const res = await db.application.updateMany({
      // Ungeclaimt heißt in MongoDB: Feld null ODER gar nicht gesetzt
      where: app.claimedById
        ? { id: app.id, claimedById: app.claimedById }
        : { id: app.id, OR: [{ claimedById: null }, { claimedById: { isSet: false } }] },
      data: { claimedById: opts.actor.id, claimedAt: new Date() },
    });
    if (res.count === 0) throw new UserFacingError("Gerade hat jemand anderes geclaimt. Lade die Seite neu.");
    const from = app.claimedBy ? ` (übernommen von ${esc(actorName(app.claimedBy))})` : "";
    const j = await botLog(`📌 ${esc(actorName(opts.actor))} betreut jetzt **${app.publicId}** (${app.position.title})${from}`, { applicationId: app.id });
    if (j) jobIds.push(j);
  }
  await db.auditLog.create({
    data: { actorId: opts.actor.id, action: `application.${opts.action}`, targetType: "application", targetId: app.id, meta: { publicId: app.publicId } },
  });
  return { jobIds };
}

/** Platzhalter-Werte für eine Bewerbung (für Vorschau und Versand). */
export async function getTemplateVarsFor(applicationId: string, teamMember: { globalName: string | null; username: string }) {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { position: true, user: true } });
  if (!app) return null;
  const settings = await getSettings();
  const cooldownDays = effectiveCooldownDays(app.position, { cooldownDays: settings["applications.cooldownDays"], minAge: 0 });
  const decided = app.decidedAt ?? new Date();
  return buildTemplateVars({
    applicant: app.user,
    positionTitle: app.position.title,
    publicId: app.publicId,
    submittedAt: app.submittedAt,
    interviewAt: app.interviewAt,
    teamMemberName: teamMember.globalName || teamMember.username,
    cooldownUntil: cooldownUntil(decided, cooldownDays),
    processingTime: settings["applications.processingTime"],
    dashboardUrl: `${publicEnv.appUrl}/dashboard/${app.id}`,
  });
}

/** Nachricht an Bewerber: im Portal speichern + als Discord-DM zustellen. */
export async function sendTeamMessage(opts: {
  applicationId: string;
  actor: Actor;
  /** Als "Nordverkehr-Team" statt mit eigenem Namen senden */
  asTeam?: boolean;
  title: string;
  body: string;
  templateIds: string[];
  vars?: Partial<TemplateVars>;
}) {
  const app = await db.application.findUnique({ where: { id: opts.applicationId }, include: { user: true } });
  if (!app || app.status === "DRAFT") throw new UserFacingError("Bewerbung nicht gefunden.");
  const asTeam = !!opts.asTeam;
  const baseVars = await getTemplateVarsFor(app.id, asTeam ? { globalName: "das Nordverkehr-Team", username: "team" } : opts.actor);
  const rendered = renderTemplate(opts.body, { ...baseVars, ...opts.vars });
  const title = renderTemplate(opts.title || "Nachricht vom Nordverkehr-Team", { ...baseVars, ...opts.vars }).text.slice(0, 200);
  if (rendered.text.trim().length < 2) throw new UserFacingError("Die Nachricht ist leer.");

  return db.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        applicationId: app.id,
        direction: "TEAM_TO_APPLICANT",
        authorId: opts.actor.id,
        asTeam,
        body: rendered.text,
        templateIds: opts.templateIds,
        deliveryStatus: "PENDING",
      },
    });
    const job = await enqueue(
      {
        type: "DM",
        discordUserId: app.user.discordId,
        purpose: "team_message",
        message: buildApplicantMessage({
          title,
          body: rendered.text,
          publicId: app.publicId,
          statusUrl: `${publicEnv.appUrl}/dashboard/${app.id}`,
          author: asTeam ? null : { name: actorName(opts.actor), iconUrl: avatarUrl(opts.actor.discordId, opts.actor.avatar, 128) },
        }),
      },
      { tx, messageId: message.id, applicationId: app.id },
    );
    const logJob = await botLog(
      `✉️ ${esc(actorName(opts.actor))} hat **${app.publicId}** geschrieben${asTeam ? " (als Team)" : ""}`,
      { tx, applicationId: app.id, url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
    );
    await tx.auditLog.create({
      data: {
        actorId: opts.actor.id,
        action: "application.message",
        targetType: "application",
        targetId: app.id,
        meta: { messageId: message.id, templates: opts.templateIds.length },
      },
    });
    return { messageId: message.id, jobIds: [job.id, ...(logJob ? [logJob] : [])], missing: rendered.missing };
  });
}

/**
 * Rückzug während der Bearbeitung bestätigen: Bewerbung verschwindet aus dem
 * Dashboard, Rückfragen sind beendet, der Bewerber bekommt eine kurze
 * Bestätigung (Portal + DM) und das Bot-Log einen Eintrag.
 */
export async function acknowledgeWithdrawal(opts: { applicationId: string; actor: Actor }) {
  const app = await db.application.findUnique({ where: { id: opts.applicationId }, include: { user: true, position: { select: { title: true } } } });
  if (!app || app.status !== "WITHDRAWN") throw new UserFacingError("Diese Bewerbung ist nicht zurückgezogen.");
  if (app.withdrawAckAt) return { jobIds: [] as string[] };

  const name = app.user.globalName || app.user.username;
  const body =
    `Moin ${name},\n\nwir haben deinen Rückzug der Bewerbung als **${app.position.title}** (${app.publicId}) gesehen und bestätigt. ` +
    `Danke, dass du Bescheid gegeben hast – du kannst dich später jederzeit gern wieder bewerben.`;

  return db.$transaction(async (tx) => {
    // Bedingt setzen: zwei gleichzeitige Klicks erzeugen nur eine Bestätigung
    const res = await tx.application.updateMany({
      where: { id: app.id, OR: [{ withdrawAckAt: null }, { withdrawAckAt: { isSet: false } }] },
      data: { withdrawAckAt: new Date(), withdrawAckById: opts.actor.id },
    });
    if (res.count === 0) return { jobIds: [] as string[] };

    const message = await tx.message.create({
      data: { applicationId: app.id, direction: "SYSTEM", body, deliveryStatus: "PENDING" },
    });
    const dm = await enqueue(
      {
        type: "DM",
        discordUserId: app.user.discordId,
        purpose: "status",
        message: buildApplicantMessage({ title: "Rückzug bestätigt", body, publicId: app.publicId, statusUrl: `${publicEnv.appUrl}/dashboard/${app.id}` }),
      },
      { tx, messageId: message.id, applicationId: app.id },
    );
    const log = await botLog(`✅ ${esc(actorName(opts.actor))} hat den Rückzug von **${app.publicId}** (${app.position.title}) bestätigt`, {
      tx,
      applicationId: app.id,
      url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
    });
    await tx.auditLog.create({
      data: { actorId: opts.actor.id, action: "application.withdraw_ack", targetType: "application", targetId: app.id, meta: { publicId: app.publicId } },
    });
    return { jobIds: [dm.id, ...(log ? [log] : [])] };
  });
}
