/**
 * Basisdaten (Bewerbungsart, Positionen, Fragen, Nachrichtenbausteine) und
 * Datenbank-Einrichtung. Von Seed-Skript und Ersteinrichtung genutzt.
 *
 * Idempotent und sicher bei parallelen Aufrufen: Abschnitte und Fragen haben
 * eindeutige Keys (Unique-Indizes), doppelte Anlage scheitert am Index.
 */
import type { PrismaClient } from "@prisma/client";
import { GENERAL_SECTIONS, POSITIONS, POSITION_COOLDOWNS, TEAM_ONLY_TEMPLATE_TITLES, TEMPLATES, type SeedSection } from "@/lib/setup/seed-data";
import { markMigrationsDone, runMigrations } from "@/lib/setup/migrations";
import { KIND_SEEDS } from "@/lib/setup/kinds-seed";

function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Legt einen Abschnitt samt Fragen an, falls es seinen Key noch nicht gibt. */
async function ensureSection(db: PrismaClient, typeId: string, positionId: string | null, s: SeedSection, sortOrder: number) {
  if (await db.formSection.findFirst({ where: { key: s.key }, select: { id: true } })) return false;
  try {
    const section = await db.formSection.create({
      data: { key: s.key, typeId, positionId, title: s.title, description: s.description, sortOrder },
    });
    for (const [qi, q] of s.questions.entries()) {
      try {
        await db.question.create({
          data: {
            key: q.key,
            sectionId: section.id,
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
            correctOption: q.type === "QUIZ" ? (q.correctOption ?? null) : null,
            sortOrder: qi,
          },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e; // Frage existiert schon (paralleler Lauf)
      }
    }
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false; // Abschnitt wurde parallel angelegt
    throw e;
  }
}

/** Legt fehlende Basisdaten an (idempotent – vorhandene Inhalte bleiben unberührt). */
export async function seedBase(db: PrismaClient, log: (m: string) => void = () => {}) {
  let type = await db.applicationType.findUnique({ where: { key: "team" } });
  if (!type) {
    try {
      type = await db.applicationType.create({
        data: { key: "team", name: "Team-Bewerbung", description: "Bewerbungen für das Nordverkehr-Team" },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      type = await db.applicationType.findUniqueOrThrow({ where: { key: "team" } });
    }
  }

  for (const [i, s] of GENERAL_SECTIONS.entries()) {
    if (await ensureSection(db, type.id, null, s, i)) log(`✓ Allgemeiner Abschnitt „${s.title}“`);
  }

  for (const [i, p] of POSITIONS.entries()) {
    let pos = await db.position.findUnique({ where: { slug: p.slug } });
    if (!pos) {
      try {
        pos = await db.position.create({
          data: {
            typeId: type.id,
            slug: p.slug,
            title: p.title,
            cooldownDays: POSITION_COOLDOWNS[p.slug] ?? null,
            tagline: p.tagline,
            description: p.description,
            icon: p.icon,
            status: p.status,
            tasks: p.tasks,
            requirements: p.requirements,
            sortOrder: i,
          },
        });
        log(`✓ Position ${p.title}`);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        continue;
      }
      for (const [si, s] of p.sections.entries()) await ensureSection(db, type.id, pos.id, s, 100 + si);
    }
  }

  if ((await db.messageTemplate.count()) === 0) {
    await db.messageTemplate.createMany({
      data: TEMPLATES.map((t, i) => ({ ...t, kinds: TEAM_ONLY_TEMPLATE_TITLES.includes(t.title) ? ["team"] : (t.kinds ?? []), sortOrder: i })),
    });
    log(`✓ ${TEMPLATES.length} Nachrichtenbausteine`);
  }
  await seedKinds(db, log);
  return type;
}

/**
 * Bewerbungsarten Whitelist und Beta: Art, Stelle (geschlossen), Abschnitte und
 * Bausteine anlegen, falls noch nicht vorhanden. Idempotent – auch für
 * bestehende Installationen (Daten-Migration „2026-11-whitelist-beta“).
 */
export async function seedKinds(db: PrismaClient, log: (m: string) => void = () => {}) {
  let created = 0;
  for (const k of KIND_SEEDS) {
    let type = await db.applicationType.findUnique({ where: { key: k.type.key } });
    if (!type) {
      try {
        type = await db.applicationType.create({ data: k.type });
        log(`✓ Bewerbungsart ${k.type.name}`);
        created++;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        type = await db.applicationType.findUniqueOrThrow({ where: { key: k.type.key } });
      }
    }
    let pos = await db.position.findUnique({ where: { slug: k.position.slug } });
    if (!pos) {
      const { sections, ...p } = k.position;
      try {
        pos = await db.position.create({ data: { ...p, typeId: type.id, sortOrder: 0 } });
        log(`✓ ${k.type.name}: Stelle „${p.title}“ (geschlossen)`);
        created++;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        pos = await db.position.findUniqueOrThrow({ where: { slug: k.position.slug } });
      }
      for (const [si, s] of sections.entries()) await ensureSection(db, type.id, pos.id, s, 100 + si);
    }
  }
  await ensureKindTemplates(db);
  return created;
}

/** Bausteine für Whitelist und Beta anlegen, die es (nach Titel) noch nicht gibt. Gibt die Anzahl zurück. */
export async function ensureKindTemplates(db: PrismaClient) {
  let n = 0;
  for (const k of KIND_SEEDS) {
    for (const t of k.templates) {
      if (await db.messageTemplate.findFirst({ where: { title: t.title }, select: { id: true } })) continue;
      const last = await db.messageTemplate.aggregate({ _max: { sortOrder: true }, where: { category: t.category } });
      await db.messageTemplate.create({ data: { ...t, kinds: [k.type.key], sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      n++;
    }
  }
  return n;
}

export interface BootstrapResult {
  seeded: boolean;
  migrations: string[];
}

/**
 * Ausstehende Daten-Migrationen ausführen und – nur in einer leeren
 * Datenbank – Basisdaten anlegen. So kommen gelöschte Positionen nicht von
 * selbst zurück. (Tabellen und Indizes: `prisma migrate deploy` beim Build.)
 */
export async function bootstrapDatabase(db: PrismaClient): Promise<BootstrapResult> {
  const empty = (await db.applicationType.count()) === 0;
  const migrations = empty ? [] : await runMigrations(db);
  if (empty) {
    // Erst als erledigt markieren: Ein parallel startender Server (instrumentation)
    // sieht sonst halb angelegte Basisdaten und startet die Migrationen erneut
    await markMigrationsDone(db);
    await seedBase(db);
  }
  return { seeded: empty, migrations };
}
