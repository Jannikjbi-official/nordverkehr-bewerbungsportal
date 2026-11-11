"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireTeam } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { runOutbox } from "@/lib/discord/outbox-db";
import { changeStatus, sendTeamMessage, setClaim } from "@/lib/team/service";
import { UserFacingError } from "@/lib/applications/service";
import type { ActionResult } from "@/app/actions/application";

const id = z.string().min(10).max(40);
const STATUS = z.enum(["SUBMITTED", "IN_REVIEW", "INTERVIEW", "ACCEPTED", "REJECTED"]);
const CATEGORY = z.enum(["EINGANG", "RUECKFRAGE", "EINLADUNG", "ANNAHME", "ABLEHNUNG", "ERINNERUNG", "SONSTIGES"]);

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof UserFacingError) return { ok: false, error: err.message };
  console.error("[team-action]", err);
  return { ok: false, error: "Das hat nicht geklappt. Versuch es nochmal." };
}

function kick(jobIds: string[]) {
  if (jobIds.length) after(() => runOutbox({ ids: jobIds }).catch((e) => console.error("[outbox]", e)));
}

// ─── Bewerbungen ──────────────────────────────────────────────

const statusSchema = z.object({
  applicationId: id,
  to: STATUS,
  note: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(1000).optional(),
});

export async function changeStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const { user } = await requireTeam();
  const p = statusSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Ungültige Eingabe." };
  try {
    const { jobIds } = await changeStatus({ ...p.data, actorId: user.id });
    kick(jobIds);
    revalidatePath(`/team/bewerbungen/${p.data.applicationId}`);
    revalidatePath("/team/bewerbungen");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const interviewSchema = z.object({
  applicationId: id,
  at: z.iso.datetime({ offset: true }).nullable(),
  note: z.string().trim().max(500).optional(),
});

export async function setInterviewAction(input: z.input<typeof interviewSchema>): Promise<ActionResult> {
  const { user } = await requireTeam();
  const p = interviewSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Bitte ein gültiges Datum wählen." };
  const app = await db.application.findUnique({ where: { id: p.data.applicationId } });
  if (!app || app.status === "DRAFT") return { ok: false, error: "Bewerbung nicht gefunden." };
  await db.application.update({
    where: { id: app.id },
    data: { interviewAt: p.data.at ? new Date(p.data.at) : null, interviewNote: p.data.note || null },
  });
  if (p.data.at && ["SUBMITTED", "IN_REVIEW"].includes(app.status)) {
    await changeStatus({ applicationId: app.id, to: "INTERVIEW", actorId: user.id, note: "Gesprächstermin festgelegt" });
  }
  await audit("application.interview", { actorId: user.id, targetType: "application", targetId: app.id, meta: { at: p.data.at } });
  revalidatePath(`/team/bewerbungen/${app.id}`);
  return { ok: true };
}

export async function voteAction(applicationId: string, value: "PRO" | "CONTRA" | "ABSTAIN" | null): Promise<ActionResult> {
  const { user } = await requireTeam();
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  if (value === null) {
    await db.vote.deleteMany({ where: { applicationId, userId: user.id } });
  } else {
    if (!["PRO", "CONTRA", "ABSTAIN"].includes(value)) return { ok: false, error: "Ungültig." };
    await db.vote.upsert({
      where: { applicationId_userId: { applicationId, userId: user.id } },
      create: { applicationId, userId: user.id, value },
      update: { value },
    });
  }
  await audit("application.vote", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { value } });
  revalidatePath(`/team/bewerbungen/${applicationId}`);
  return { ok: true };
}

const commentSchema = z.object({ applicationId: id, body: z.string().trim().min(1).max(3000) });

export async function addCommentAction(input: z.input<typeof commentSchema>): Promise<ActionResult> {
  const { user } = await requireTeam();
  const p = commentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Kommentar ist leer oder zu lang." };
  await db.comment.create({ data: { applicationId: p.data.applicationId, authorId: user.id, body: p.data.body } });
  await audit("application.comment", { actorId: user.id, targetType: "application", targetId: p.data.applicationId });
  revalidatePath(`/team/bewerbungen/${p.data.applicationId}`);
  return { ok: true };
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  const c = await db.comment.findUnique({ where: { id: commentId } });
  if (!c) return { ok: false, error: "Nicht gefunden." };
  if (c.authorId !== user.id && !access.isAdmin) return { ok: false, error: "Nur eigene Kommentare." };
  await db.comment.delete({ where: { id: c.id } });
  revalidatePath(`/team/bewerbungen/${c.applicationId}`);
  return { ok: true };
}

const messageSchema = z.object({
  applicationId: id,
  title: z.string().trim().max(120).default("Nachricht vom Nordverkehr-Team"),
  body: z.string().trim().min(2).max(3800),
  templateIds: z.array(id).max(10).default([]),
  grund: z.string().trim().max(1000).optional(),
  alsoStatus: STATUS.optional(),
  asTeam: z.boolean().default(false),
});

export async function sendMessageAction(input: z.input<typeof messageSchema>): Promise<ActionResult<{ missing: string[] }>> {
  const { user } = await requireTeam();
  const p = messageSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Nachricht ist leer oder zu lang (max. 3800 Zeichen)." };
  const rl = await rateLimit(`team-msg:${user.id}`, 60, 3600);
  if (!rl.ok) return { ok: false, error: "Zu viele Nachrichten in kurzer Zeit." };
  try {
    const jobIds: string[] = [];
    if (p.data.alsoStatus) {
      const r = await changeStatus({
        applicationId: p.data.applicationId,
        to: p.data.alsoStatus,
        actorId: user.id,
        reason: p.data.alsoStatus === "REJECTED" ? p.data.grund : undefined,
      });
      jobIds.push(...r.jobIds);
    }
    const res = await sendTeamMessage({
      applicationId: p.data.applicationId,
      actor: user,
      asTeam: p.data.asTeam,
      title: p.data.title,
      body: p.data.body,
      templateIds: p.data.templateIds,
      vars: { grund: p.data.grund },
    });
    jobIds.push(...res.jobIds);
    kick(jobIds);
    revalidatePath(`/team/bewerbungen/${p.data.applicationId}`);
    return { ok: true, data: { missing: res.missing } };
  } catch (err) {
    return fail(err);
  }
}

export async function claimAction(applicationId: string, action: "claim" | "release"): Promise<ActionResult> {
  const { user } = await requireTeam();
  if (!id.safeParse(applicationId).success || !["claim", "release"].includes(action)) return { ok: false, error: "Ungültig." };
  try {
    const r = await setClaim({ applicationId, actor: user, action });
    kick(r.jobIds);
    revalidatePath(`/team/bewerbungen/${applicationId}`);
    revalidatePath("/team/bewerbungen");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function retryDeliveryAction(messageId: string): Promise<ActionResult> {
  await requireTeam();
  const job = await db.outboxJob.findFirst({ where: { messageId }, orderBy: { createdAt: "desc" } });
  if (!job) return { ok: false, error: "Kein Zustellauftrag gefunden." };
  await db.$transaction([
    db.outboxJob.update({ where: { id: job.id }, data: { status: "PENDING", runAt: new Date(), attempts: 0, lastError: null } }),
    db.message.update({ where: { id: messageId }, data: { deliveryStatus: "PENDING", deliveryError: null } }),
  ]);
  kick([job.id]);
  revalidatePath("/team/bewerbungen");
  return { ok: true };
}

// ─── Nachrichtenbausteine ─────────────────────────────────────

const templateSchema = z.object({
  id: id.optional(),
  category: CATEGORY,
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(3500),
  active: z.boolean().default(true),
});

export async function saveTemplateAction(input: z.input<typeof templateSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireTeam();
  const p = templateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Titel (2–80) und Text (2–3500 Zeichen) ausfüllen." };
  const { id: tid, ...data } = p.data;
  let saved;
  if (tid) {
    saved = await db.messageTemplate.update({ where: { id: tid }, data });
    await audit("template.update", { actorId: user.id, targetType: "template", targetId: tid });
  } else {
    const max = await db.messageTemplate.aggregate({ _max: { sortOrder: true }, where: { category: data.category } });
    saved = await db.messageTemplate.create({ data: { ...data, sortOrder: (max._max.sortOrder ?? 0) + 1, createdById: user.id } });
    await audit("template.create", { actorId: user.id, targetType: "template", targetId: saved.id });
  }
  revalidatePath("/team/bausteine");
  return { ok: true, data: { id: saved.id } };
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  const { user } = await requireTeam();
  if (!id.safeParse(templateId).success) return { ok: false, error: "Ungültig." };
  await db.messageTemplate.delete({ where: { id: templateId } }).catch(() => null);
  await audit("template.delete", { actorId: user.id, targetType: "template", targetId: templateId });
  revalidatePath("/team/bausteine");
  return { ok: true };
}

export async function reorderTemplatesAction(ids: string[]): Promise<ActionResult> {
  const { user } = await requireTeam();
  const p = z.array(id).max(500).safeParse(ids);
  if (!p.success) return { ok: false, error: "Ungültig." };
  await db.$transaction(p.data.map((tid, i) => db.messageTemplate.update({ where: { id: tid }, data: { sortOrder: i } })));
  await audit("template.reorder", { actorId: user.id, targetType: "template" });
  revalidatePath("/team/bausteine");
  return { ok: true };
}

// ─── Nutzer: Notizen & Sperren ────────────────────────────────

export async function addNoteAction(subjectId: string, body: string): Promise<ActionResult> {
  const { user } = await requireTeam();
  const p = z.object({ subjectId: id, body: z.string().trim().min(1).max(2000) }).safeParse({ subjectId, body });
  if (!p.success) return { ok: false, error: "Notiz ist leer oder zu lang." };
  await db.userNote.create({ data: { subjectId, authorId: user.id, body: p.data.body } });
  await audit("user.note", { actorId: user.id, targetType: "user", targetId: subjectId });
  revalidatePath(`/team/nutzer/${subjectId}`);
  return { ok: true };
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  const n = await db.userNote.findUnique({ where: { id: noteId } });
  if (!n) return { ok: false, error: "Nicht gefunden." };
  if (n.authorId !== user.id && !access.isAdmin) return { ok: false, error: "Nur eigene Notizen." };
  await db.userNote.delete({ where: { id: noteId } });
  revalidatePath(`/team/nutzer/${n.subjectId}`);
  return { ok: true };
}

const banSchema = z.object({
  subjectId: id,
  reason: z.string().trim().min(3).max(500),
  days: z.number().int().min(1).max(3650).nullable(),
});

export async function banUserAction(input: z.input<typeof banSchema>): Promise<ActionResult> {
  const { user } = await requireTeam();
  const p = banSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Bitte einen Grund (mind. 3 Zeichen) angeben." };
  if (p.data.subjectId === user.id) return { ok: false, error: "Du kannst dich nicht selbst sperren." };
  await db.userBan.create({
    data: {
      subjectId: p.data.subjectId,
      reason: p.data.reason,
      expiresAt: p.data.days ? new Date(Date.now() + p.data.days * 86_400_000) : null,
      createdById: user.id,
    },
  });
  await audit("user.ban", { actorId: user.id, targetType: "user", targetId: p.data.subjectId, meta: { days: p.data.days } });
  revalidatePath(`/team/nutzer/${p.data.subjectId}`);
  return { ok: true };
}

export async function liftBanAction(banId: string): Promise<ActionResult> {
  const { user } = await requireTeam();
  const ban = await db.userBan.update({ where: { id: banId }, data: { liftedAt: new Date(), liftedById: user.id } }).catch(() => null);
  if (!ban) return { ok: false, error: "Nicht gefunden." };
  await audit("user.unban", { actorId: user.id, targetType: "user", targetId: ban.subjectId });
  revalidatePath(`/team/nutzer/${ban.subjectId}`);
  return { ok: true };
}

/** Admin: Bewerbung endgültig löschen (z. B. auf Wunsch / DSGVO). */
export async function deleteApplicationAction(applicationId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { id: true, publicId: true } });
  if (!app) return { ok: false, error: "Nicht gefunden." };
  await db.application.delete({ where: { id: app.id } }); // inkl. Bilder (Cascade)
  await audit("application.delete", { actorId: user.id, targetType: "application", targetId: app.id, meta: { publicId: app.publicId } });
  revalidatePath("/team/bewerbungen");
  return { ok: true };
}

/** KI-Einordnung manuell (neu) anstoßen. */
export async function retagAction(applicationId: string): Promise<ActionResult<{ tags: string[] }>> {
  const { user } = await requireTeam();
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  const { getSettings } = await import("@/lib/settings");
  const { assertAiAllowed, AiError } = await import("@/lib/ai/service");
  const { tagApplication } = await import("@/lib/ai/tagging");
  try {
    await assertAiAllowed(user.id, await getSettings());
    const tags = await tagApplication(applicationId, { actorId: user.id, force: true });
    if (!tags) return { ok: false, error: "KI ist deaktiviert oder das Budget ist aufgebraucht." };
    revalidatePath(`/team/bewerbungen/${applicationId}`);
    return { ok: true, data: { tags } };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    return fail(err);
  }
}
