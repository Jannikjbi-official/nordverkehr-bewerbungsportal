"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireTeam } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { deliverNow } from "@/lib/discord/outbox-db";
import { acknowledgeWithdrawal, changeStatus, interviewBlockReason, sendTeamMessage, setClaim } from "@/lib/team/service";
import { UserFacingError } from "@/lib/applications/service";
import { REJECTION_KEYS } from "@/lib/applications/rejection";
import type { ActionResult } from "@/app/actions/application";

const id = z.string().min(10).max(40);
const STATUS = z.enum(["SUBMITTED", "IN_REVIEW", "INTERVIEW", "ACCEPTED", "REJECTED"]);
const CATEGORY = z.enum(["EINGANG", "RUECKFRAGE", "EINLADUNG", "ANNAHME", "ABLEHNUNG", "ERINNERUNG", "SONSTIGES"]);

/** Junior-Teammitglieder dürfen nur lesen, kommentieren und bewerten (lib/team/rights.ts). */
async function juniorDenied(user: { roleIds?: string[] | null }, access: { isAdmin: boolean } | null | undefined): Promise<{ ok: false; error: string } | null> {
  const { isJunior, JUNIOR_DENIED } = await import("@/lib/team/rights");
  const { getSettings } = await import("@/lib/settings");
  return isJunior(user.roleIds, !!access?.isAdmin, (await getSettings())["team.juniorRoleIds"]) ? { ok: false, error: JUNIOR_DENIED } : null;
}

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof UserFacingError) return { ok: false, error: err.message };
  console.error("[team-action]", err);
  return { ok: false, error: "Das hat nicht geklappt. Versuch es nochmal." };
}

/** Zustellen: kurz direkt (Nachricht ist dann gleich „zugestellt“), Rest nach der Antwort. */
async function kick(jobIds: string[]) {
  await deliverNow(jobIds);
}

// ─── Bewerbungen ──────────────────────────────────────────────

const statusSchema = z.object({
  applicationId: id,
  to: STATUS,
  note: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(1000).optional(),
  category: z.enum(REJECTION_KEYS).optional(),
});

export async function changeStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  const p = statusSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Ungültige Eingabe." };
  {
    const denied = await guardApp(user, access, p.data.applicationId);
    if (denied) return denied;
  }
  try {
    const { jobIds } = await changeStatus({ ...p.data, actorId: user.id });
    await kick(jobIds);
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
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  const p = interviewSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Bitte ein gültiges Datum wählen." };
  {
    const denied = await guardApp(user, access, p.data.applicationId);
    if (denied) return denied;
  }
  const app = await db.application.findUnique({ where: { id: p.data.applicationId } });
  if (!app || app.status === "DRAFT") return { ok: false, error: "Bewerbung nicht gefunden." };
  const at = p.data.at ? new Date(p.data.at) : null;
  // Termin setzen heißt Phase 2 – vorher die Sterne-Hürde prüfen, damit nichts halb gespeichert wird
  if (at && ["SUBMITTED", "IN_REVIEW"].includes(app.status)) {
    const { getSettings } = await import("@/lib/settings");
    const block = await interviewBlockReason(app.id, (await getSettings())["interview.minStars"]);
    if (block) return { ok: false, error: block };
  }
  await db.application.update({
    where: { id: app.id },
    data: { interviewAt: at, interviewNote: p.data.note || null },
  });
  // Selbst gebuchter Termin passt nicht mehr zur festen Uhrzeit → wieder freigeben
  await db.interviewSlot.updateMany({
    where: { applicationId: app.id, ...(at ? { NOT: { startsAt: at } } : {}) },
    data: { applicationId: null, bookedAt: null },
  });
  if (p.data.at && ["SUBMITTED", "IN_REVIEW"].includes(app.status)) {
    await changeStatus({ applicationId: app.id, to: "INTERVIEW", actorId: user.id, note: "Gesprächstermin festgelegt", keepInterview: true });
  }
  await audit("application.interview", { actorId: user.id, targetType: "application", targetId: app.id, meta: { at: p.data.at } });
  const { syncInterviewLater } = await import("@/lib/team/interview-sync");
  await syncInterviewLater(app.id);
  revalidatePath(`/team/bewerbungen/${app.id}`);
  return { ok: true };
}

export async function voteAction(applicationId: string, value: "PRO" | "CONTRA" | "ABSTAIN" | null): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
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

const slotSchema = z.object({
  start: z.coerce.date(),
  count: z.number().int().min(1).max(20),
  durationMin: z.number().int().min(10).max(180),
  gapMin: z.number().int().min(0).max(120).default(0),
  note: z.string().trim().max(200).optional(),
});

/** Freie Gesprächstermine anlegen (mehrere am Stück). */
export async function createSlotsAction(input: z.input<typeof slotSchema>): Promise<ActionResult<{ count: number }>> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  const p = slotSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Bitte Startzeit, Anzahl und Dauer prüfen." };
  if (p.data.start.getTime() < Date.now()) return { ok: false, error: "Der Termin liegt in der Vergangenheit." };
  const { slotTimes } = await import("@/lib/team/slots");
  const times = slotTimes(p.data.start, p.data.count, p.data.durationMin, p.data.gapMin);
  const clash = await db.interviewSlot.count({ where: { startsAt: { in: times } } });
  if (clash) return { ok: false, error: "Zu mindestens einer dieser Uhrzeiten gibt es schon einen Termin." };
  await db.interviewSlot.createMany({
    data: times.map((startsAt) => ({ startsAt, durationMin: p.data.durationMin, note: p.data.note || null, createdById: user.id, applicationId: null, bookedAt: null })),
  });
  await audit("slot.create", { actorId: user.id, meta: { count: times.length, start: p.data.start.toISOString() } });
  revalidatePath("/team/termine");
  return { ok: true, data: { count: times.length } };
}

/** Freien Termin löschen (gebuchte nur, wenn sie vorbei sind). */
export async function deleteSlotAction(slotId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  if (!id.safeParse(slotId).success) return { ok: false, error: "Ungültig." };
  const slot = await db.interviewSlot.findUnique({ where: { id: slotId } });
  if (!slot) return { ok: true };
  // Atomar: nur löschen, wenn (noch) frei oder schon vorbei – sonst könnte eine Buchung
  // genau zwischen Prüfung und Löschen verloren gehen
  const res = await db.interviewSlot.deleteMany({
    where: { id: slotId, OR: [{ applicationId: null }, { startsAt: { lte: new Date() } }] },
  });
  if (res.count === 0) {
    const still = await db.interviewSlot.count({ where: { id: slotId } });
    if (still) return { ok: false, error: "Der Termin ist gebucht. Klär das erst mit dem Bewerber (oder setz in der Bewerbung eine andere Zeit)." };
    return { ok: true };
  }
  await audit("slot.delete", { actorId: user.id, meta: { at: slot.startsAt.toISOString() } });
  revalidatePath("/team/termine");
  return { ok: true };
}

/** Einarbeitungs-Punkt abhaken / zurücknehmen. */
export async function toggleOnboardingAction(applicationId: string, item: string, done: boolean): Promise<ActionResult<{ state: Record<string, { at: string; by: string }> }>> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  if (!id.safeParse(applicationId).success || typeof item !== "string" || item.length > 200) return { ok: false, error: "Ungültig." };
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  const { readOnboarding } = await import("@/lib/team/onboarding");
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { status: true, onboarding: true } });
  if (!app || app.status !== "ACCEPTED") return { ok: false, error: "Nur bei angenommenen Bewerbungen." };
  const state = readOnboarding(app.onboarding);
  if (done) state[item] = { at: new Date().toISOString(), by: user.globalName || user.username };
  else delete state[item];
  await db.application.update({ where: { id: applicationId }, data: { onboarding: state as object } });
  // Kein revalidatePath: die Checkliste aktualisiert sich selbst (optimistisch) – sonst rendert die ganze Detailseite neu
  await audit("application.onboarding", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { item, done } });
  return { ok: true, data: { state } };
}

/** Probezeit-Ende setzen oder entfernen. */
export async function setProbationAction(applicationId: string, until: string | null): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  const date = until ? new Date(until) : null;
  if (date && Number.isNaN(date.getTime())) return { ok: false, error: "Ungültiges Datum." };
  await db.application.update({ where: { id: applicationId }, data: { probationUntil: date } });
  await audit("application.onboarding", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { probationUntil: until } });
  return { ok: true };
}

const ratingSchema = z.object({ applicationId: id, scores: z.record(z.string(), z.number()), note: z.string().trim().max(1000).optional() });

/** Bewertungsbogen speichern (leere Bewertung = löschen). */
export async function rateAction(input: z.input<typeof ratingSchema>): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  const p = ratingSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Ungültige Bewertung." };
  {
    const denied = await guardApp(user, access, p.data.applicationId);
    if (denied) return denied;
  }
  const { cleanScores, criteriaFor } = await import("@/lib/team/ratings");
  const app = await db.application.findUnique({ where: { id: p.data.applicationId }, select: { position: { select: { ratingCriteria: true } } } });
  if (!app) return { ok: false, error: "Bewerbung nicht gefunden." };
  const scores = cleanScores(p.data.scores, criteriaFor(app.position));
  const note = p.data.note || null;
  const where = { applicationId_userId: { applicationId: p.data.applicationId, userId: user.id } };
  if (!Object.keys(scores).length && !note) {
    await db.rating.deleteMany({ where: { applicationId: p.data.applicationId, userId: user.id } });
  } else {
    await db.rating.upsert({
      where,
      create: { applicationId: p.data.applicationId, userId: user.id, scores, note },
      update: { scores, note },
    });
  }
  await audit("application.rating", { actorId: user.id, targetType: "application", targetId: p.data.applicationId, meta: { scores } });
  revalidatePath(`/team/bewerbungen/${p.data.applicationId}`);
  return { ok: true };
}

const commentSchema = z.object({ applicationId: id, body: z.string().trim().min(1).max(3000) });

export async function addCommentAction(input: z.input<typeof commentSchema>): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  const p = commentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Kommentar ist leer oder zu lang." };
  {
    const denied = await guardApp(user, access, p.data.applicationId);
    if (denied) return denied;
  }
  await db.comment.create({ data: { applicationId: p.data.applicationId, authorId: user.id, body: p.data.body } });
  await audit("application.comment", { actorId: user.id, targetType: "application", targetId: p.data.applicationId });
  // In den Discord-Thread der Bewerbung spiegeln (falls eingerichtet)
  const app = await db.application.findUnique({ where: { id: p.data.applicationId }, select: { id: true, discordThreadId: true } });
  if (app?.discordThreadId) {
    const { postToThread } = await import("@/lib/discord/threads");
    const { esc } = await import("@/lib/discord/botlog");
    const { publicEnv } = await import("@/lib/env");
    const body = p.data.body.length > 1500 ? `${p.data.body.slice(0, 1500)} …` : p.data.body;
    const job = await postToThread(app, `💬 **${esc(user.globalName || user.username)}** (Portal): ${esc(body)}`, { kind: "comment", url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` });
    if (job) await kick([job]);
  }
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
  /** Rückfrage mit Frist: Bewerber wird erinnert, wenn keine Antwort kommt */
  expectReply: z.boolean().default(false),
});

export async function sendMessageAction(input: z.input<typeof messageSchema>): Promise<ActionResult<{ missing: string[] }>> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  const p = messageSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Nachricht ist leer oder zu lang (max. 3800 Zeichen)." };
  {
    const denied = await guardApp(user, access, p.data.applicationId);
    if (denied) return denied;
  }
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
      expectReply: p.data.expectReply,
    });
    jobIds.push(...res.jobIds);
    await kick(jobIds);
    revalidatePath(`/team/bewerbungen/${p.data.applicationId}`);
    return { ok: true, data: { missing: res.missing } };
  } catch (err) {
    return fail(err);
  }
}

export async function claimAction(applicationId: string, action: "claim" | "release"): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  if (!id.safeParse(applicationId).success || !["claim", "release"].includes(action)) return { ok: false, error: "Ungültig." };
  try {
    const r = await setClaim({ applicationId, actor: user, action });
    await kick(r.jobIds);
    revalidatePath(`/team/bewerbungen/${applicationId}`);
    revalidatePath("/team/bewerbungen");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function retryDeliveryAction(messageId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  const job = await db.outboxJob.findFirst({ where: { messageId }, orderBy: { createdAt: "desc" } });
  if (!job) return { ok: false, error: "Kein Zustellauftrag gefunden." };
  await db.$transaction([
    db.outboxJob.update({ where: { id: job.id }, data: { status: "PENDING", runAt: new Date(), attempts: 0, lastError: null } }),
    db.message.update({ where: { id: messageId }, data: { deliveryStatus: "PENDING", deliveryError: null } }),
  ]);
  await kick([job.id]);
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
  /** Nur bei diesen Bewerbungsarten – leer = alle */
  kinds: z.array(z.enum(["team", "whitelist", "beta"])).max(3).default([]),
});

export async function saveTemplateAction(input: z.input<typeof templateSchema>): Promise<ActionResult<{ id: string }>> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
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
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  if (!id.safeParse(templateId).success) return { ok: false, error: "Ungültig." };
  await db.messageTemplate.delete({ where: { id: templateId } }).catch(() => null);
  await audit("template.delete", { actorId: user.id, targetType: "template", targetId: templateId });
  revalidatePath("/team/bausteine");
  return { ok: true };
}

export async function reorderTemplatesAction(ids: string[]): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
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
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
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
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
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
  const { user, access } = await requireTeam();
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
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

/**
 * Admin-Freigabe: KI-Punkte auch für Bewerbungen mit älterer Einwilligung –
 * nur, wenn der Bewerber zugestimmt hat (Admin bestätigt das, Audit-Log).
 */
export async function overrideAiConsentAction(applicationId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { status: true, publicId: true } });
  if (!app || app.status === "DRAFT") return { ok: false, error: "Bewerbung nicht gefunden." };
  await db.application.update({ where: { id: applicationId }, data: { aiConsentOverrideAt: new Date(), aiConsentOverrideById: user.id } });
  await audit("application.ai_override", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { publicId: app.publicId } });
  return rescoreAction(applicationId);
}

/** KI-Punkte (neu) berechnen. */
export async function rescoreAction(applicationId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  const { getSettings } = await import("@/lib/settings");
  const { assertAiAllowed, AiError } = await import("@/lib/ai/service");
  const { scoreApplication } = await import("@/lib/ai/scoring");
  try {
    await assertAiAllowed(user.id, await getSettings());
    const r = await scoreApplication(applicationId, { actorId: user.id, force: true });
    if (!r) return { ok: false, error: "KI-Punkte gehen nur bei neuen Bewerbungen (Einwilligung) und wenn die KI an ist und Budget hat." };
    revalidatePath(`/team/bewerbungen/${applicationId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    return fail(err);
  }
}

/** Rückzug während der Bearbeitung bestätigen (raus aus dem Dashboard, Bewerber wird informiert). */
export async function acknowledgeWithdrawalAction(applicationId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  try {
    const r = await acknowledgeWithdrawal({ applicationId, actor: user });
    await kick(r.jobIds);
    revalidatePath("/team");
    revalidatePath(`/team/bewerbungen/${applicationId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ─── Gesprächsprotokoll ───────────────────────────────────────

const protocolQuestion = z.string().max(300);

async function protocolApp(applicationId: string) {
  if (!id.safeParse(applicationId).success) return null;
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { id: true, status: true } });
  return app && app.status !== "DRAFT" ? app : null;
}

/** Frage im Protokoll abhaken / zurücknehmen. */
export async function toggleInterviewCheckAction(applicationId: string, question: string, done: boolean): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  if (!(await protocolApp(applicationId)) || !protocolQuestion.min(1).safeParse(question).success) return { ok: false, error: "Ungültig." };
  if (done) {
    try {
      await db.interviewCheck.upsert({
        where: { applicationId_question: { applicationId, question } },
        create: { applicationId, question, checkedById: user.id },
        update: {},
      });
    } catch (e) {
      // Gleichzeitig von jemand anderem abgehakt (Unique-Key) → Haken ist gesetzt, alles gut
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  } else {
    await db.interviewCheck.deleteMany({ where: { applicationId, question } });
  }
  await audit("application.protocol", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { check: question.slice(0, 80), done } });
  revalidatePath(`/team/bewerbungen/${applicationId}`);
  return { ok: true };
}

const noteSchema = z.object({ applicationId: id, question: protocolQuestion, body: z.string().trim().min(1).max(3000) });

/** Notiz zu einer Frage (oder zum Gesamtfazit, question = "") hinzufügen. */
export async function addInterviewNoteAction(input: z.input<typeof noteSchema>): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  const p = noteSchema.safeParse(input);
  if (!p.success || !(await protocolApp(p.data.applicationId))) return { ok: false, error: "Notiz ist leer oder zu lang." };
  {
    const denied = await guardApp(user, access, p.data.applicationId);
    if (denied) return denied;
  }
  const note = await db.interviewNote.create({ data: { applicationId: p.data.applicationId, question: p.data.question, body: p.data.body, authorId: user.id } });
  await audit("application.protocol", { actorId: user.id, targetType: "application", targetId: p.data.applicationId, meta: { note: note.id, fazit: p.data.question === "" } });
  revalidatePath(`/team/bewerbungen/${p.data.applicationId}`);
  return { ok: true };
}

/** Eigene Notiz löschen (Admins: jede). */
export async function deleteInterviewNoteAction(noteId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  if (!id.safeParse(noteId).success) return { ok: false, error: "Ungültig." };
  const note = await db.interviewNote.findUnique({ where: { id: noteId } });
  if (!note) return { ok: true };
  if (note.authorId !== user.id && !access?.isAdmin) return { ok: false, error: "Nur eigene Notizen (oder als Admin)." };
  await db.interviewNote.delete({ where: { id: noteId } });
  await audit("application.protocol", { actorId: user.id, targetType: "application", targetId: note.applicationId, meta: { deleted: noteId } });
  revalidatePath(`/team/bewerbungen/${note.applicationId}`);
  return { ok: true };
}

/** Eigene Fragen für diese Bewerbung ergänzen (eine pro Zeile, z. B. aus den KI-Gesprächsfragen). */
export async function addInterviewQuestionsAction(applicationId: string, text: string): Promise<ActionResult<{ added: number }>> {
  const { user, access } = await requireTeam();
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  if (typeof text !== "string" || text.length > 5000) return { ok: false, error: "Zu lang." };
  const app = await protocolApp(applicationId);
  if (!app) return { ok: false, error: "Bewerbung nicht gefunden." };
  const { splitLines } = await import("@/lib/team/interview");
  const current = await db.application.findUnique({ where: { id: applicationId }, select: { interviewExtraQuestions: true } });
  const have = new Set((current?.interviewExtraQuestions ?? []).map((q) => q.toLowerCase()));
  const lines = splitLines(text).filter((l) => !have.has(l.toLowerCase())).slice(0, 20);
  if (!lines.length) return { ok: false, error: "Keine neuen Fragen gefunden (eine pro Zeile)." };
  // push ist atomar – gleichzeitige Ergänzungen gehen nicht verloren
  await db.application.update({ where: { id: applicationId }, data: { interviewExtraQuestions: { push: lines } } });
  await audit("application.protocol", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { questionsAdded: lines.length } });
  revalidatePath(`/team/bewerbungen/${applicationId}`);
  return { ok: true, data: { added: lines.length } };
}

// ─── Nicht erschienen ─────────────────────────────────────────

/**
 * Bewerber war nicht beim Gespräch: Termin wird frei, Bewerber bekommt eine Nachricht
 * (Portal + DM) und kann neu buchen; ab dem zweiten Mal erscheint ein Hinweis.
 */
export async function markNoShowAction(applicationId: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { user: true, position: { select: { title: true } } } });
  if (!app || app.status !== "INTERVIEW" || !app.interviewAt) return { ok: false, error: "Nur bei einem Gespräch mit Termin." };
  if (app.interviewAt.getTime() > Date.now()) return { ok: false, error: "Der Termin liegt noch in der Zukunft." };
  const { enqueue } = await import("@/lib/discord/outbox-db");
  const { buildApplicantMessage } = await import("@/lib/messages/embed");
  const { botLog, esc } = await import("@/lib/discord/botlog");
  const { publicEnv } = await import("@/lib/env");
  const count = app.noShowCount + 1;
  const name = app.user.globalName || app.user.username;
  const body =
    `Moin ${name},\n\nleider warst du bei deinem Gespräch für **${app.position.title}** nicht da. ` +
    `Kein Drama – such dir im Portal einfach einen neuen Termin aus oder schreib uns kurz, was los war.` +
    (count >= 2 ? `\n\n-# Das ist schon das zweite Mal. Bitte sag uns Bescheid, wenn es mit einem Termin nicht klappt.` : "");
  const flags = (app.flags as unknown as { code: string; message: string }[]).filter((f) => f.code !== "no_show");
  if (count >= 2) flags.push({ code: "no_show", message: `${count}× nicht zum Gespräch erschienen.` });
  const jobIds = await db.$transaction(async (tx) => {
    // Termin lösen: vergangener Slot wird frei, Bewerber kann neu buchen
    await tx.interviewSlot.updateMany({ where: { applicationId: app.id }, data: { applicationId: null, bookedAt: null } });
    await tx.application.update({
      where: { id: app.id },
      data: { noShowCount: count, interviewAt: null, interviewRemindedFor: null, flags: flags as never },
    });
    const message = await tx.message.create({ data: { applicationId: app.id, direction: "SYSTEM", body, deliveryStatus: "PENDING" } });
    const dm = await enqueue(
      {
        type: "DM",
        discordUserId: app.user.discordId,
        purpose: "status",
        message: buildApplicantMessage({ title: "Wir haben dich beim Gespräch vermisst", body, publicId: app.publicId, statusUrl: `${publicEnv.appUrl}/dashboard/${app.id}` }),
      },
      { tx, messageId: message.id, applicationId: app.id },
    );
    const log = await botLog(`🚫 **${app.publicId}** (${app.position.title}): nicht zum Gespräch erschienen (${count}×) – markiert von ${esc(user.globalName || user.username)}`, {
      tx,
      applicationId: app.id,
      tone: count >= 2 ? "warn" : "default",
      url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
    });
    await tx.auditLog.create({ data: { actorId: user.id, action: "application.no_show", targetType: "application", targetId: app.id, meta: { count } } });
    return [dm.id, ...(log ? [log] : [])];
  });
  await kick(jobIds);
  const { syncInterviewLater } = await import("@/lib/team/interview-sync");
  await syncInterviewLater(app.id);
  revalidatePath(`/team/bewerbungen/${app.id}`);
  return { ok: true };
}

/** Zuständigkeit pro Stelle: Zugriff auf die Bewerbung? (Admins immer) */
async function guardApp(user: { id: string; roleIds?: string[] }, access: { isAdmin: boolean } | null | undefined, applicationId: unknown): Promise<{ ok: false; error: string } | null> {
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  const { canAccessApplication, viewerOf } = await import("@/lib/team/visibility");
  return (await canAccessApplication(viewerOf(user, access), applicationId as string)) ? null : { ok: false, error: "Für diese Stelle bist du nicht zuständig." };
}

/** Bewerbung stummschalten: neue Bewerber-Nachrichten erzeugen so lange keinen Bot-Log (0 = aufheben). */
export async function setMuteAction(applicationId: string, hours: number): Promise<ActionResult<{ until: string | null }>> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  if (!id.safeParse(applicationId).success || ![0, 1, 8, 24, 72].includes(hours)) return { ok: false, error: "Ungültig." };
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  const until = hours ? new Date(Date.now() + hours * 3_600_000) : null;
  const res = await db.application.updateMany({ where: { id: applicationId }, data: { mutedUntil: until } });
  if (!res.count) return { ok: false, error: "Bewerbung nicht gefunden." };
  await audit("application.mute", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { hours } });
  return { ok: true, data: { until: until?.toISOString() ?? null } };
}

/** Probezeit abschließen (nur Admins/Leitung): bestanden, verlängern (+14 Tage) oder beenden. */
export async function decideProbationAction(applicationId: string, decision: "PASSED" | "EXTEND" | "END"): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  if (!access.isAdmin) return { ok: false, error: "Das entscheidet die Leitung (Admins)." };
  if (!id.safeParse(applicationId).success || !["PASSED", "EXTEND", "END"].includes(decision)) return { ok: false, error: "Ungültig." };
  try {
    const { decideProbation } = await import("@/lib/team/probation");
    const { jobIds } = await decideProbation(db, { applicationId, decision, actor: user });
    await kick(jobIds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Hat nicht geklappt." };
  }
  revalidatePath(`/team/bewerbungen/${applicationId}`);
  revalidatePath("/team/verzeichnis");
  return { ok: true };
}

/** Paten zuteilen bzw. entfernen (Teammitglied). */
export async function setMentorAction(applicationId: string, mentorId: string | null): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  {
    const j = await juniorDenied(user, access);
    if (j) return j;
  }
  if (!id.safeParse(applicationId).success || (mentorId !== null && !id.safeParse(mentorId).success)) return { ok: false, error: "Ungültig." };
  {
    const denied = await guardApp(user, access, applicationId);
    if (denied) return denied;
  }
  if (mentorId) {
    const m = await db.user.findFirst({ where: { id: mentorId, OR: [{ isTeam: true }, { isAdmin: true }] }, select: { id: true } });
    if (!m) return { ok: false, error: "Pate muss im Team sein." };
  }
  const res = await db.application.updateMany({ where: { id: applicationId, status: "ACCEPTED" }, data: { mentorId, mentorRemindedAt: null } });
  if (!res.count) return { ok: false, error: "Nur bei angenommenen Bewerbungen." };
  await audit("application.onboarding", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { mentorId } });
  revalidatePath(`/team/bewerbungen/${applicationId}`);
  revalidatePath("/team/verzeichnis");
  return { ok: true };
}

/** Rückmeldung des Paten (oder eines Admins): läuft gut / braucht Hilfe + kurze Notiz. */
export async function mentorFeedbackAction(applicationId: string, rating: "good" | "help", note: string): Promise<ActionResult> {
  const { user, access } = await requireTeam();
  if (!id.safeParse(applicationId).success || !["good", "help"].includes(rating) || typeof note !== "string" || note.length > 1000) return { ok: false, error: "Ungültig." };
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { status: true, mentorId: true } });
  if (!app || app.status !== "ACCEPTED") return { ok: false, error: "Nur bei angenommenen Bewerbungen." };
  if (app.mentorId !== user.id && !access.isAdmin) return { ok: false, error: "Nur der Pate (oder ein Admin) gibt die Rückmeldung." };
  const feedback = { rating, note: note.trim() || null, by: user.globalName || user.username, at: new Date().toISOString() };
  await db.application.update({ where: { id: applicationId }, data: { mentorFeedback: feedback } });
  await audit("application.onboarding", { actorId: user.id, targetType: "application", targetId: applicationId, meta: { mentorFeedback: rating } });
  if (rating === "help") {
    const { botLog } = await import("@/lib/discord/botlog");
    const { publicEnv } = await import("@/lib/env");
    const job = await botLog(`🆘 Pate meldet bei einem neuen Teammitglied „braucht Hilfe“ – bitte reinschauen`, { applicationId, tone: "warn", url: `${publicEnv.appUrl}/team/bewerbungen/${applicationId}` });
    if (job) await kick([job]);
  }
  revalidatePath(`/team/bewerbungen/${applicationId}`);
  return { ok: true };
}
