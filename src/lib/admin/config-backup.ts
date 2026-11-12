/**
 * Einstellungen sichern & wiederherstellen (Admin-Bereich → Daten & Tests):
 * Positionen, Formular (Schritte + Fragen inkl. Quiz-Lösungen), Nachrichtenbausteine
 * und Einstellungen als JSON. Import führt zusammen, löscht nie: vorhandene Einträge
 * werden aktualisiert (Positionen per Slug, Schritte/Fragen per Key bzw. Titel/Text,
 * Bausteine per Kategorie + Titel), fehlende angelegt. Bewerbungen sind nie enthalten.
 */
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { SETTING_KEYS, getSettings, saveSettings, settingsSchema, type Settings } from "@/lib/settings";

export const BACKUP_VERSION = 1;

const QTYPE = z.enum(["SHORT_TEXT", "LONG_TEXT", "NUMBER", "SELECT", "MULTI_SELECT", "CHECKBOX", "URL", "FILE", "SCENARIO", "QUIZ"]);
const CATEGORY = z.enum(["EINGANG", "RUECKFRAGE", "EINLADUNG", "ANNAHME", "ABLEHNUNG", "ERINNERUNG", "SONSTIGES"]);
const str = (max: number) => z.string().max(max);

const questionSchema = z.object({
  key: str(60).nullable(),
  label: str(300),
  helpText: str(400).nullable(),
  placeholder: str(120).nullable(),
  type: QTYPE,
  required: z.boolean(),
  minLength: z.number().int().nullable(),
  maxLength: z.number().int().nullable(),
  minValue: z.number().int().nullable(),
  maxValue: z.number().int().nullable(),
  options: z.array(str(120)).max(30),
  correctOption: str(120).nullable().optional(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export const backupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  settings: z.record(z.string(), z.unknown()),
  positions: z.array(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
      title: str(60),
      tagline: str(120),
      description: str(2000),
      tasks: z.array(str(200)).max(15),
      requirements: z.array(str(200)).max(15),
      icon: str(20),
      status: z.enum(["OPEN", "CLOSED", "HIDDEN"]),
      sortOrder: z.number().int(),
      minAge: z.number().int().nullable(),
      cooldownDays: z.number().int().nullable(),
      acceptRoleId: z.string().nullable(),
      maxApplications: z.number().int().nullable(),
      quizMinScore: z.number().int().nullable(),
      interviewQuestions: z.array(str(300)).max(30),
      minProVotes: z.number().int().nullable(),
      requireAdminApproval: z.boolean(),
      teamRoleIds: z.array(z.string()).max(10),
    }),
  ).max(50),
  sections: z.array(
    z.object({
      key: str(60).nullable(),
      title: str(80),
      description: str(400).nullable(),
      sortOrder: z.number().int(),
      archived: z.boolean(),
      positionSlug: z.string().nullable(),
      questions: z.array(questionSchema).max(100),
    }),
  ).max(200),
  templates: z.array(z.object({ category: CATEGORY, title: str(200), body: str(5000), sortOrder: z.number().int(), active: z.boolean() })).max(300),
});
export type Backup = z.infer<typeof backupSchema>;

export async function exportConfig(db: PrismaClient): Promise<Backup> {
  const [settings, positions, sections, templates] = await Promise.all([
    getSettings(),
    db.position.findMany({ orderBy: { sortOrder: "asc" } }),
    db.formSection.findMany({ include: { questions: { orderBy: { sortOrder: "asc" } }, position: { select: { slug: true } } }, orderBy: { sortOrder: "asc" } }),
    db.messageTemplate.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings as unknown as Record<string, unknown>,
    positions: positions.map((p) => ({
      slug: p.slug,
      title: p.title,
      tagline: p.tagline,
      description: p.description,
      tasks: p.tasks,
      requirements: p.requirements,
      icon: p.icon,
      status: p.status,
      sortOrder: p.sortOrder,
      minAge: p.minAge,
      cooldownDays: p.cooldownDays,
      acceptRoleId: p.acceptRoleId,
      maxApplications: p.maxApplications,
      quizMinScore: p.quizMinScore,
      interviewQuestions: p.interviewQuestions ?? [],
      minProVotes: p.minProVotes,
      requireAdminApproval: !!p.requireAdminApproval,
      teamRoleIds: p.teamRoleIds ?? [],
    })),
    sections: sections.map((s) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      sortOrder: s.sortOrder,
      archived: !!s.archived,
      positionSlug: s.position?.slug ?? null,
      questions: s.questions.map((q) => ({
        key: q.key,
        label: q.label,
        helpText: q.helpText,
        placeholder: q.placeholder,
        type: q.type,
        required: q.required,
        minLength: q.minLength,
        maxLength: q.maxLength,
        minValue: q.minValue,
        maxValue: q.maxValue,
        options: q.options,
        correctOption: q.correctOption,
        sortOrder: q.sortOrder,
        archived: !!q.archived,
      })),
    })),
    templates: templates.map((t) => ({ category: t.category, title: t.title, body: t.body, sortOrder: t.sortOrder, active: t.active })),
  };
}

export interface ImportReport {
  positions: { created: number; updated: number };
  sections: { created: number; updated: number };
  questions: { created: number; updated: number };
  templates: { created: number; updated: number };
  settings: number;
  skipped: string[];
}

/** Zusammenführen. Mit `dryRun` wird nur gezählt. */
export async function importConfig(db: PrismaClient, backup: Backup, opts: { dryRun: boolean; actorId: string }): Promise<ImportReport> {
  const r: ImportReport = { positions: { created: 0, updated: 0 }, sections: { created: 0, updated: 0 }, questions: { created: 0, updated: 0 }, templates: { created: 0, updated: 0 }, settings: 0, skipped: [] };
  const type = await db.applicationType.findUnique({ where: { key: "team" } });
  if (!type) throw new Error("Bewerbungsart „team“ fehlt – Datenbank erst einrichten.");

  // Positionen per Slug
  const posIds = new Map<string, string>();
  for (const p of backup.positions) {
    const existing = await db.position.findUnique({ where: { slug: p.slug }, select: { id: true } });
    if (existing) {
      r.positions.updated++;
      posIds.set(p.slug, existing.id);
      if (!opts.dryRun) await db.position.update({ where: { id: existing.id }, data: p });
    } else {
      r.positions.created++;
      if (!opts.dryRun) posIds.set(p.slug, (await db.position.create({ data: { ...p, typeId: type.id, opensAt: null, closesAt: null } })).id);
    }
  }
  const knownPositions = new Map((await db.position.findMany({ select: { id: true, slug: true } })).map((p) => [p.slug, p.id]));
  for (const [k, v] of knownPositions) if (!posIds.has(k)) posIds.set(k, v);

  // Schritte per Key, sonst (Stelle, Titel); Fragen per Key, sonst (Schritt, Text)
  for (const s of backup.sections) {
    const positionId = s.positionSlug ? (posIds.get(s.positionSlug) ?? null) : null;
    if (s.positionSlug && !positionId) {
      if (!opts.dryRun) r.skipped.push(`Schritt „${s.title}“: Stelle ${s.positionSlug} fehlt`);
      else r.sections.created++;
      continue;
    }
    const existing = s.key
      ? await db.formSection.findFirst({ where: { key: s.key } })
      : await db.formSection.findFirst({ where: { title: s.title, positionId } });
    const data = { key: s.key, title: s.title, description: s.description, sortOrder: s.sortOrder, archived: s.archived, positionId, typeId: type.id };
    let sectionId = existing?.id ?? null;
    if (existing) {
      r.sections.updated++;
      if (!opts.dryRun) await db.formSection.update({ where: { id: existing.id }, data });
    } else {
      r.sections.created++;
      if (!opts.dryRun) sectionId = (await db.formSection.create({ data })).id;
    }
    for (const q of s.questions) {
      const found = q.key
        ? await db.question.findFirst({ where: { key: q.key } })
        : sectionId
          ? await db.question.findFirst({ where: { sectionId, label: q.label } })
          : null;
      const qdata = { ...q, correctOption: q.type === "QUIZ" ? (q.correctOption ?? null) : null };
      if (found) {
        r.questions.updated++;
        if (!opts.dryRun) await db.question.update({ where: { id: found.id }, data: { ...qdata, sectionId: sectionId! } });
      } else {
        r.questions.created++;
        if (!opts.dryRun && sectionId) await db.question.create({ data: { ...qdata, sectionId } });
      }
    }
  }

  // Bausteine per Kategorie + Titel
  for (const t of backup.templates) {
    const found = await db.messageTemplate.findFirst({ where: { category: t.category, title: t.title } });
    if (found) {
      r.templates.updated++;
      if (!opts.dryRun) await db.messageTemplate.update({ where: { id: found.id }, data: t });
    } else {
      r.templates.created++;
      if (!opts.dryRun) await db.messageTemplate.create({ data: { ...t, createdById: opts.actorId } });
    }
  }

  // Einstellungen: nur bekannte, gültige Werte
  const valid: Partial<Settings> = {};
  for (const key of SETTING_KEYS) {
    if (!(key in backup.settings)) continue;
    const parsed = settingsSchema.shape[key].safeParse(backup.settings[key]);
    if (parsed.success) (valid as Record<string, unknown>)[key] = parsed.data;
    else r.skipped.push(`Einstellung ${key}: ungültiger Wert`);
  }
  r.settings = Object.keys(valid).length;
  if (!opts.dryRun && r.settings) await saveSettings(valid, opts.actorId);
  return r;
}
