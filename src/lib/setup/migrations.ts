/**
 * Daten-Migrationen (MongoDB hat keine Schema-Migrationen).
 *
 * Laufen automatisch beim Serverstart (instrumentation.ts), beim täglichen Cron
 * und per CLI (`npm run db:migrate-questions`, Probelauf ohne `--apply`).
 * Jede Migration läuft genau einmal (Markierung in `Setting`), parallele
 * Instanzen werden über ein Sperr-Dokument ausgeschlossen.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GENERAL_SECTIONS,
  LEGACY_LABELS,
  LEGACY_SECTION_TITLES,
  POSITION_SECTIONS,
  RETIRED_KEYS,
  normalizeLabel,
  type SeedQuestion,
} from "@/lib/setup/questions";

export interface MigrationReport {
  sectionsKeyed: string[];
  questionsKeyed: string[];
  sectionsMerged: string[];
  questionsMerged: string[];
  answersRemapped: number;
  draftsUpdated: number;
  retired: string[];
  updatedContent: string[];
  sectionsRenamed: string[];
}

interface Options {
  dryRun?: boolean;
  log?: (m: string) => void;
}

/** Fragen, deren Inhalt sich durch die Bereinigung ändert (Text, Typ, Optionen). */
const CONTENT_UPDATES = ["scenario_insult", "support.tickets", "entwickler.platforms", "entwickler.project", "experience_teams"];

const seedByKey = new Map<string, SeedQuestion>();
for (const s of [...GENERAL_SECTIONS, ...Object.values(POSITION_SECTIONS).flat()]) for (const q of s.questions) seedByKey.set(q.key, q);
// Aktuelle Seed-Texte zählen ebenfalls als bekannte Texte
const LABEL_TO_KEY: Record<string, string> = { ...LEGACY_LABELS };
for (const [key, q] of seedByKey) LABEL_TO_KEY[normalizeLabel(q.label)] ??= key;

type SectionRow = Prisma.FormSectionGetPayload<{ include: { questions: true; position: { select: { slug: true; title: true } } } }>;

/**
 * Fragen bereinigen (11/2026):
 * Keys vergeben, doppelte Abschnitte/Fragen zusammenführen (Antworten & Entwürfe
 * werden umgehängt, nichts geht verloren), überholte Fragen archivieren,
 * umformulierte Fragen aktualisieren, "Abschnitt = Position" → "Fachfragen".
 */
export async function migrateQuestionsV2(db: PrismaClient, opts: Options = {}): Promise<MigrationReport> {
  const dry = !!opts.dryRun;
  const log = opts.log ?? (() => {});
  const r: MigrationReport = {
    sectionsKeyed: [],
    questionsKeyed: [],
    sectionsMerged: [],
    questionsMerged: [],
    answersRemapped: 0,
    draftsUpdated: 0,
    retired: [],
    updatedContent: [],
    sectionsRenamed: [],
  };

  // Alte Abschnitte ohne `archived`-Feld vereinheitlichen. Läuft auch im Probelauf:
  // Prisma-Filter wie `NOT: { archived: true }` treffen Dokumente ohne das Feld nicht,
  // ohne diesen Schritt sähe der Probelauf die Altdaten gar nicht. Es wird nur der
  // Standardwert ergänzt – inhaltlich ändert sich nichts.
  const normalized = await db.$runCommandRaw({
    update: "FormSection",
    updates: [{ q: { archived: { $exists: false } }, u: { $set: { archived: false } }, multi: true }],
  });
  const nNormalized = Number((normalized as { nModified?: number }).nModified ?? 0);
  if (nNormalized) log(`· ${nNormalized} Abschnitt(e): Standardwert archived=false ergänzt`);

  const sections: SectionRow[] = await db.formSection.findMany({
    where: { NOT: { archived: true } },
    include: { questions: { where: { archived: false } }, position: { select: { slug: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });

  // 1) Abschnitts-Keys bestimmen (vorhanden > alter Titel > "<slug>.fach")
  const sectionKey = new Map<string, string | null>();
  for (const s of sections) {
    let key = s.key;
    if (!key && !s.positionId) key = LEGACY_SECTION_TITLES[normalizeLabel(s.title)] ?? null;
    if (!key && s.position && POSITION_SECTIONS[s.position.slug]) {
      const firstOfPosition = sections.find((x) => x.positionId === s.positionId);
      if (firstOfPosition?.id === s.id) key = `${s.position.slug}.fach`;
    }
    sectionKey.set(s.id, key);
  }

  // 2) Doppelte Abschnitte (gleicher Key) → ältester bleibt
  const keepSection = new Map<string, string>(); // key → section id
  const mergedInto = new Map<string, string>(); // dup section id → kept id
  for (const s of sections) {
    const key = sectionKey.get(s.id);
    if (!key) continue;
    const kept = keepSection.get(key);
    if (kept) mergedInto.set(s.id, kept);
    else keepSection.set(key, s.id);
  }

  // 3) Fragen-Keys bestimmen und Duplikate je Bereich (allgemein / Position) finden
  type Q = SectionRow["questions"][number] & { scope: string; resolvedKey: string | null; sectionId: string };
  const questions: Q[] = [];
  for (const s of sections) {
    const scope = s.positionId ? `pos:${s.positionId}` : "general";
    for (const q of s.questions) {
      questions.push({ ...q, scope, sectionId: mergedInto.get(s.id) ?? s.id, resolvedKey: q.key ?? LABEL_TO_KEY[normalizeLabel(q.label)] ?? null });
    }
  }
  questions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const keepQuestion = new Map<string, Q>(); // dedupe-id → kept question
  const questionMergedInto = new Map<string, Q>(); // dup id → kept
  for (const q of questions) {
    // Allgemeine Keys sind global eindeutig; Text-Duplikate nur innerhalb eines Bereichs
    const id = q.resolvedKey ? `key:${q.resolvedKey}` : `label:${q.scope}:${normalizeLabel(q.label)}`;
    const kept = keepQuestion.get(id);
    if (kept) questionMergedInto.set(q.id, kept);
    else keepQuestion.set(id, q);
  }

  // ─── Schreiben ───
  // a) Fragen aus doppelten Abschnitten, die es im Ziel noch nicht gibt, umziehen
  for (const q of keepQuestion.values()) {
    const original = sections.find((s) => s.questions.some((x) => x.id === q.id));
    if (original && mergedInto.has(original.id)) {
      log(`Frage „${q.label}“ → Abschnitt ${mergedInto.get(original.id)}`);
      if (!dry) await db.question.update({ where: { id: q.id }, data: { sectionId: mergedInto.get(original.id)! } });
    }
  }

  // b) Duplikate zusammenführen: Antworten, Uploads, Entwürfe umhängen, dann archivieren
  const drafts = await db.application.findMany({ where: { status: "DRAFT" }, select: { id: true, draftData: true } });
  const draftChanges = new Map<string, Record<string, unknown>>();
  for (const [dupId, kept] of questionMergedInto) {
    r.questionsMerged.push(`${kept.resolvedKey ?? kept.label} (${dupId} → ${kept.id})`);
    if (!dry) {
      const a = await db.answer.updateMany({ where: { questionId: dupId }, data: { questionId: kept.id } });
      r.answersRemapped += a.count;
      await db.upload.updateMany({ where: { questionId: dupId }, data: { questionId: kept.id } });
      await db.question.update({ where: { id: dupId }, data: { archived: true, key: null } });
    } else {
      r.answersRemapped += await db.answer.count({ where: { questionId: dupId } });
    }
    for (const d of drafts) {
      const data = (draftChanges.get(d.id) ?? { ...((d.draftData as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
      if (dupId in data) {
        if (!(kept.id in data) || data[kept.id] === "" || data[kept.id] == null) data[kept.id] = data[dupId];
        delete data[dupId];
        draftChanges.set(d.id, data);
      }
    }
  }

  // c) Keys setzen (nach dem Freigeben der Duplikat-Keys)
  for (const q of keepQuestion.values()) {
    if (q.resolvedKey && q.key !== q.resolvedKey) {
      r.questionsKeyed.push(`${q.resolvedKey} ← „${q.label}“`);
      if (!dry) await db.question.update({ where: { id: q.id }, data: { key: q.resolvedKey } });
    }
  }
  for (const s of sections) {
    const target = mergedInto.get(s.id);
    if (target) {
      r.sectionsMerged.push(`${s.title} (${s.id} → ${target})`);
      if (!dry) await db.formSection.update({ where: { id: s.id }, data: { archived: true, key: null } });
      continue;
    }
    const key = sectionKey.get(s.id);
    if (key && s.key !== key) {
      r.sectionsKeyed.push(`${key} ← „${s.title}“`);
      if (!dry) await db.formSection.update({ where: { id: s.id }, data: { key } });
    }
    // "SUPPORT // SUPPORT" vermeiden
    if (s.position && normalizeLabel(s.title) === normalizeLabel(s.position.title)) {
      r.sectionsRenamed.push(`${s.position.title}: „${s.title}“ → „Fachfragen“`);
      if (!dry) await db.formSection.update({ where: { id: s.id }, data: { title: "Fachfragen" } });
    }
  }

  // d) Überholte Fragen archivieren (Antworten bleiben über den Snapshot erhalten)
  for (const q of keepQuestion.values()) {
    if (q.resolvedKey && RETIRED_KEYS.includes(q.resolvedKey)) {
      r.retired.push(`${q.resolvedKey}: „${q.label}“`);
      if (!dry) await db.question.update({ where: { id: q.id }, data: { archived: true } });
      for (const d of drafts) {
        const data = (draftChanges.get(d.id) ?? { ...((d.draftData as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
        if (q.id in data) {
          delete data[q.id];
          draftChanges.set(d.id, data);
        }
      }
    }
  }

  // e) Umformulierte Fragen aktualisieren (Text, Typ, Optionen); unpassende Entwurfswerte verwerfen
  for (const q of keepQuestion.values()) {
    if (!q.resolvedKey || !CONTENT_UPDATES.includes(q.resolvedKey)) continue;
    const seed = seedByKey.get(q.resolvedKey)!;
    const changed =
      q.label !== seed.label || q.type !== seed.type || (q.helpText ?? null) !== (seed.helpText ?? null) || q.options.join("|") !== (seed.options ?? []).join("|");
    if (!changed) continue;
    r.updatedContent.push(`${q.resolvedKey}: „${q.label}“ → „${seed.label}“`);
    if (!dry) {
      await db.question.update({
        where: { id: q.id },
        data: {
          label: seed.label,
          type: seed.type,
          helpText: seed.helpText ?? null,
          placeholder: seed.placeholder ?? null,
          options: seed.options ?? [],
          minLength: seed.minLength ?? null,
          maxLength: seed.maxLength ?? null,
          minValue: seed.minValue ?? null,
          maxValue: seed.maxValue ?? null,
          required: seed.required ?? true,
        },
      });
    }
    if (q.type !== seed.type || q.options.join("|") !== (seed.options ?? []).join("|")) {
      for (const d of drafts) {
        const data = (draftChanges.get(d.id) ?? { ...((d.draftData as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
        if (!(q.id in data)) continue;
        const v = data[q.id];
        const fits =
          seed.type === "MULTI_SELECT"
            ? Array.isArray(v) && v.every((x) => (seed.options ?? []).includes(String(x)))
            : seed.type === "SELECT"
              ? typeof v === "string" && (seed.options ?? []).includes(v)
              : true;
        if (!fits) {
          delete data[q.id];
          draftChanges.set(d.id, data);
        }
      }
    }
  }

  // f) Entwürfe speichern
  for (const [id, data] of draftChanges) {
    r.draftsUpdated++;
    if (!dry) await db.application.update({ where: { id }, data: { draftData: data as Prisma.InputJsonValue } });
  }

  log(JSON.stringify(r, null, 2));
  return r;
}

const MIGRATIONS: { id: string; run: (db: PrismaClient, opts: Options) => Promise<unknown> }[] = [
  { id: "2026-11-questions-v2", run: migrateQuestionsV2 },
];

const LOCK_KEY = "lock:migrations";
const LOCK_TTL_MS = 5 * 60_000;

async function acquireLock(db: PrismaClient) {
  try {
    await db.setting.create({ data: { key: LOCK_KEY, value: { at: Date.now() } } });
    return true;
  } catch {
    const lock = await db.setting.findUnique({ where: { key: LOCK_KEY } });
    const at = (lock?.value as { at?: number } | null)?.at ?? 0;
    if (Date.now() - at > LOCK_TTL_MS) {
      // Verwaiste Sperre (Funktion abgebrochen) übernehmen
      const res = await db.setting.updateMany({ where: { key: LOCK_KEY, updatedAt: lock?.updatedAt }, data: { value: { at: Date.now() } } });
      return res.count === 1;
    }
    return false;
  }
}

/** Führt alle noch nicht erledigten Migrationen aus. Gibt die IDs der ausgeführten zurück. */
export async function runMigrations(db: PrismaClient, opts: Options = {}): Promise<string[]> {
  const pending: typeof MIGRATIONS = [];
  for (const m of MIGRATIONS) {
    if (!(await db.setting.findUnique({ where: { key: `migration:${m.id}` } }))) pending.push(m);
  }
  if (!pending.length || !(await acquireLock(db))) return [];
  const done: string[] = [];
  try {
    for (const m of pending) {
      // Erneut prüfen – eine andere Instanz könnte sie inzwischen erledigt haben
      if (await db.setting.findUnique({ where: { key: `migration:${m.id}` } })) continue;
      const result = await m.run(db, opts);
      await db.setting.create({ data: { key: `migration:${m.id}`, value: { at: new Date().toISOString(), result } as Prisma.InputJsonValue } });
      await db.auditLog.create({ data: { action: "form.update", targetType: "migration", targetId: m.id, meta: result as Prisma.InputJsonValue } });
      done.push(m.id);
    }
  } finally {
    await db.setting.delete({ where: { key: LOCK_KEY } }).catch(() => {});
  }
  return done;
}

/** In einer frisch eingerichteten Datenbank sind alle Migrationen schon erfüllt. */
export async function markMigrationsDone(db: PrismaClient) {
  for (const m of MIGRATIONS) {
    await db.setting
      .create({ data: { key: `migration:${m.id}`, value: { at: new Date().toISOString(), fresh: true } } })
      .catch(() => {});
  }
}
