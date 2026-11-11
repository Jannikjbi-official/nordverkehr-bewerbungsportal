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
      },
    });
    await tx.statusChange.create({
      data: { applicationId: app.id, from: app.status, to: opts.to, actorId: opts.actorId, note: opts.note ?? null },
    });
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
  actor: { id: string; globalName: string | null; username: string };
  title: string;
  body: string;
  templateIds: string[];
  vars?: Partial<TemplateVars>;
}) {
  const app = await db.application.findUnique({ where: { id: opts.applicationId }, include: { user: true } });
  if (!app || app.status === "DRAFT") throw new UserFacingError("Bewerbung nicht gefunden.");
  const baseVars = await getTemplateVarsFor(app.id, opts.actor);
  const rendered = renderTemplate(opts.body, { ...baseVars, ...opts.vars });
  if (rendered.text.trim().length < 2) throw new UserFacingError("Die Nachricht ist leer.");

  return db.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        applicationId: app.id,
        direction: "TEAM_TO_APPLICANT",
        authorId: opts.actor.id,
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
          title: opts.title || "Nachricht vom Nordverkehr-Team",
          body: rendered.text,
          publicId: app.publicId,
          statusUrl: `${publicEnv.appUrl}/dashboard/${app.id}`,
        }),
      },
      { tx, messageId: message.id, applicationId: app.id },
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
    return { messageId: message.id, jobId: job.id, missing: rendered.missing };
  });
}
