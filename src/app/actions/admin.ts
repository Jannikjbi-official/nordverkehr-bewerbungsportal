"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { saveSettings, settingsSchema, type Settings } from "@/lib/settings";
import type { ActionResult } from "@/app/actions/application";

const id = z.string().min(10).max(40);
const QTYPE = z.enum(["SHORT_TEXT", "LONG_TEXT", "NUMBER", "SELECT", "MULTI_SELECT", "CHECKBOX", "URL", "FILE", "SCENARIO"]);
const snowflake = z.string().regex(/^\d{15,25}$/, "Ungültige Rollen-ID").nullable();

// ─── Einstellungen ────────────────────────────────────────────

export async function saveSettingsAction(patch: Record<string, unknown>): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const parsed = settingsSchema.partial().safeParse(patch);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Ungültiger Wert bei „${String(first.path[0])}“: ${first.message}` };
  }
  // Nur explizit übergebene Schlüssel speichern (partial() füllt keine Defaults ein)
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in patch)) as Partial<Settings>;
  await saveSettings(data, user.id);
  await audit("settings.update", { actorId: user.id, meta: { keys: Object.keys(data) } });
  revalidatePath("/team/einstellungen");
  return { ok: true };
}

// ─── Positionen ───────────────────────────────────────────────

const positionSchema = z.object({
  id: id.optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "Slug: nur a–z, 0–9 und Bindestriche"),
  title: z.string().trim().min(2).max(60),
  tagline: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(2000),
  tasks: z.array(z.string().trim().min(1).max(200)).max(15),
  requirements: z.array(z.string().trim().min(1).max(200)).max(15),
  icon: z.string().max(20),
  status: z.enum(["OPEN", "CLOSED", "HIDDEN"]),
  minAge: z.number().int().min(12).max(99).nullable(),
  cooldownDays: z.number().int().min(0).max(365).nullable(),
  acceptRoleId: snowflake,
});

export async function savePositionAction(input: z.input<typeof positionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = positionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id: pid, ...data } = p.data;
  const clash = await db.position.findFirst({ where: { slug: data.slug, NOT: pid ? { id: pid } : undefined } });
  if (clash) return { ok: false, error: "Dieser Slug ist schon vergeben." };
  let saved;
  if (pid) {
    saved = await db.position.update({ where: { id: pid }, data });
    await audit("position.update", { actorId: user.id, targetType: "position", targetId: pid });
  } else {
    const type = await db.applicationType.findUniqueOrThrow({ where: { key: "team" } });
    const max = await db.position.aggregate({ _max: { sortOrder: true } });
    saved = await db.position.create({ data: { ...data, typeId: type.id, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    await audit("position.create", { actorId: user.id, targetType: "position", targetId: saved.id });
  }
  revalidatePath("/team/positionen");
  revalidatePath("/");
  return { ok: true, data: { id: saved.id } };
}

export async function setPositionStatusAction(positionId: string, status: "OPEN" | "CLOSED" | "HIDDEN"): Promise<ActionResult> {
  const { user } = await requireAdmin();
  if (!["OPEN", "CLOSED", "HIDDEN"].includes(status)) return { ok: false, error: "Ungültig." };
  await db.position.update({ where: { id: positionId }, data: { status } });
  await audit("position.status", { actorId: user.id, targetType: "position", targetId: positionId, meta: { status } });
  revalidatePath("/team/positionen");
  revalidatePath("/");
  return { ok: true };
}

export async function deletePositionAction(positionId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const count = await db.application.count({ where: { positionId } });
  if (count > 0) return { ok: false, error: "Es gibt Bewerbungen auf diese Position. Setz sie stattdessen auf „Versteckt“." };
  await db.position.delete({ where: { id: positionId } });
  await audit("position.delete", { actorId: user.id, targetType: "position", targetId: positionId });
  revalidatePath("/team/positionen");
  return { ok: true };
}

export async function reorderPositionsAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const p = z.array(id).max(100).safeParse(ids);
  if (!p.success) return { ok: false, error: "Ungültig." };
  await db.$transaction(p.data.map((pid, i) => db.position.update({ where: { id: pid }, data: { sortOrder: i } })));
  revalidatePath("/team/positionen");
  revalidatePath("/");
  return { ok: true };
}

// ─── Formular-Schritte & Fragen ───────────────────────────────

const sectionSchema = z.object({
  id: id.optional(),
  positionId: id.nullable(),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).nullable(),
});

export async function saveSectionAction(input: z.input<typeof sectionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = sectionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const type = await db.applicationType.findUniqueOrThrow({ where: { key: "team" } });
  let saved;
  if (p.data.id) {
    saved = await db.formSection.update({ where: { id: p.data.id }, data: { title: p.data.title, description: p.data.description } });
  } else {
    const max = await db.formSection.aggregate({ _max: { sortOrder: true }, where: { positionId: p.data.positionId } });
    saved = await db.formSection.create({
      data: { typeId: type.id, positionId: p.data.positionId, title: p.data.title, description: p.data.description, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  }
  await audit("form.update", { actorId: user.id, targetType: "section", targetId: saved.id });
  revalidatePath("/team/positionen", "layout");
  return { ok: true, data: { id: saved.id } };
}

export async function deleteSectionAction(sectionId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  // Antworten bleiben erhalten (Snapshot); Fragen werden mit gelöscht
  await db.formSection.delete({ where: { id: sectionId } }).catch(() => null);
  await audit("form.update", { actorId: user.id, targetType: "section", targetId: sectionId, meta: { deleted: true } });
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}

export async function reorderSectionsAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const p = z.array(id).max(100).safeParse(ids);
  if (!p.success) return { ok: false, error: "Ungültig." };
  await db.$transaction(p.data.map((sid, i) => db.formSection.update({ where: { id: sid }, data: { sortOrder: i } })));
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}

const questionSchema = z
  .object({
    id: id.optional(),
    sectionId: id,
    label: z.string().trim().min(3).max(300),
    helpText: z.string().trim().max(400).nullable(),
    placeholder: z.string().trim().max(120).nullable(),
    type: QTYPE,
    required: z.boolean(),
    minLength: z.number().int().min(0).max(10000).nullable(),
    maxLength: z.number().int().min(1).max(10000).nullable(),
    minValue: z.number().int().nullable(),
    maxValue: z.number().int().nullable(),
    options: z.array(z.string().trim().min(1).max(120)).max(30),
  })
  .refine((q) => !["SELECT", "MULTI_SELECT"].includes(q.type) || q.options.length >= 2, "Auswahlfragen brauchen mindestens 2 Optionen.")
  .refine((q) => q.minLength === null || q.maxLength === null || q.minLength <= q.maxLength, "Mindestlänge ist größer als Maximallänge.");

export async function saveQuestionAction(input: z.input<typeof questionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = questionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id: qid, ...data } = p.data;
  let saved;
  if (qid) saved = await db.question.update({ where: { id: qid }, data });
  else {
    const max = await db.question.aggregate({ _max: { sortOrder: true }, where: { sectionId: data.sectionId } });
    saved = await db.question.create({ data: { ...data, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }
  await audit("form.update", { actorId: user.id, targetType: "question", targetId: saved.id });
  revalidatePath("/team/positionen", "layout");
  return { ok: true, data: { id: saved.id } };
}

/** Fragen werden archiviert statt gelöscht – Entwürfe & Auswertungen bleiben konsistent. */
export async function archiveQuestionAction(questionId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  await db.question.update({ where: { id: questionId }, data: { archived: true } }).catch(() => null);
  await audit("form.update", { actorId: user.id, targetType: "question", targetId: questionId, meta: { archived: true } });
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}

export async function reorderQuestionsAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const p = z.array(id).max(200).safeParse(ids);
  if (!p.success) return { ok: false, error: "Ungültig." };
  await db.$transaction(p.data.map((qid, i) => db.question.update({ where: { id: qid }, data: { sortOrder: i } })));
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}
