/**
 * Basisdaten (Bewerbungsart, Positionen, Fragen, Nachrichtenbausteine) und
 * Datenbank-Einrichtung. Von Seed-Skript, Admin-Button und Cron genutzt.
 */
import type { PrismaClient } from "@prisma/client";
import { GENERAL_SECTIONS, POSITIONS, TEMPLATES, type SeedSection } from "@/lib/setup/seed-data";
import { ensureIndexes } from "@/lib/setup/indexes";

async function createSections(db: PrismaClient, typeId: string, positionId: string | null, sections: SeedSection[], offset = 0) {
  for (const [i, s] of sections.entries()) {
    await db.formSection.create({
      data: {
        typeId,
        positionId,
        title: s.title,
        description: s.description,
        sortOrder: offset + i,
        questions: {
          create: s.questions.map((q, qi) => ({
            label: q.label,
            type: q.type,
            required: q.required ?? true,
            helpText: q.helpText,
            placeholder: q.placeholder,
            minLength: q.minLength,
            maxLength: q.maxLength,
            minValue: q.minValue,
            maxValue: q.maxValue,
            options: q.options ?? [],
            sortOrder: qi,
          })),
        },
      },
    });
  }
}

/** Legt fehlende Basisdaten an (idempotent – vorhandene Positionen bleiben unberührt). */
export async function seedBase(db: PrismaClient, log: (m: string) => void = () => {}) {
  const type = await db.applicationType.upsert({
    where: { key: "team" },
    create: { key: "team", name: "Team-Bewerbung", description: "Bewerbungen für das Nordverkehr-Team" },
    update: {},
  });

  if ((await db.formSection.count({ where: { typeId: type.id, positionId: null } })) === 0) {
    await createSections(db, type.id, null, GENERAL_SECTIONS);
    log(`✓ ${GENERAL_SECTIONS.length} allgemeine Formular-Schritte`);
  }

  for (const [i, p] of POSITIONS.entries()) {
    if (await db.position.findUnique({ where: { slug: p.slug } })) continue;
    const pos = await db.position.create({
      data: {
        typeId: type.id,
        slug: p.slug,
        title: p.title,
        tagline: p.tagline,
        description: p.description,
        icon: p.icon,
        status: p.status,
        tasks: p.tasks,
        requirements: p.requirements,
        sortOrder: i,
      },
    });
    await createSections(db, type.id, pos.id, p.sections, 100);
    log(`✓ Position ${p.title}`);
  }

  if ((await db.messageTemplate.count()) === 0) {
    await db.messageTemplate.createMany({ data: TEMPLATES.map((t, i) => ({ ...t, sortOrder: i })) });
    log(`✓ ${TEMPLATES.length} Nachrichtenbausteine`);
  }
  return type;
}

export interface BootstrapResult {
  indexes: true;
  seeded: boolean;
}

/**
 * Indizes sicherstellen und – nur in einer leeren Datenbank – Basisdaten anlegen.
 * So kommen gelöschte Positionen nicht von selbst zurück.
 */
export async function bootstrapDatabase(db: PrismaClient): Promise<BootstrapResult> {
  await ensureIndexes(db);
  const empty = (await db.applicationType.count()) === 0;
  if (empty) await seedBase(db);
  return { indexes: true, seeded: empty };
}
