/**
 * Daten-Migrationen (Inhalte, z. B. Fragen umbauen) – das Schema selbst kommt aus prisma/migrations.
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
  RETIRED_GENERAL_SCENARIOS,
  normalizeLabel,
  type SeedQuestion,
} from "@/lib/setup/questions";
import { POSITION_QUIZ } from "@/lib/setup/quiz-questions";

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
for (const s of [...GENERAL_SECTIONS, RETIRED_GENERAL_SCENARIOS, ...Object.values(POSITION_SECTIONS).flat()]) for (const q of s.questions) seedByKey.set(q.key, q);
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

/**
 * Früher (MongoDB): Standardwerte in Altdokumenten nachtragen. In Postgres hat
 * jede Spalte ihren Standardwert – diese Schritte sind leer und bleiben nur,
 * damit die Liste der erledigten Migrationen stimmt.
 */
const noop = async () => 0;

/** Neue Fachfragen (11/2026) – werden ergänzt, wenn es den Key noch nicht gibt. */
const NEW_SPECIFIC_KEYS = [
  "support.voice_issue",
  "support.escalation",
  "support.voice_tools",
  "moderator.documentation",
  "moderator.explain_decision",
  "moderator.hold_back",
  "eventteam.planning",
  "eventteam.crowd",
  "eventteam.feedback",
];

async function addSpecificQuestions(db: PrismaClient, opts: Options) {
  const log = opts.log ?? (() => {});
  const added: string[] = [];
  for (const [slug, sections] of Object.entries(POSITION_SECTIONS)) {
    const wanted = sections.flatMap((s) => s.questions).filter((q) => NEW_SPECIFIC_KEYS.includes(q.key));
    if (!wanted.length) continue;
    const position = await db.position.findUnique({ where: { slug }, select: { id: true, typeId: true } });
    if (!position) continue; // Position wurde gelöscht
    // Fachfragen-Abschnitt der Position (per Key, sonst der erste aktive)
    const section =
      (await db.formSection.findFirst({ where: { key: `${slug}.fach`, positionId: position.id, archived: false } })) ??
      (await db.formSection.findFirst({ where: { positionId: position.id, archived: false }, orderBy: { sortOrder: "asc" } }));
    if (!section) continue;
    const max = await db.question.aggregate({ _max: { sortOrder: true }, where: { sectionId: section.id } });
    let order = (max._max.sortOrder ?? 0) + 1;
    for (const q of wanted) {
      if (await db.question.findFirst({ where: { key: q.key }, select: { id: true } })) continue; // existiert (auch archiviert)
      added.push(q.key);
      if (opts.dryRun) continue;
      await db.question.create({
        data: {
          key: q.key,
          sectionId: section.id,
          label: q.label,
          type: q.type,
          required: q.required ?? true,
          helpText: q.helpText ?? null,
          placeholder: q.placeholder ?? null,
          minLength: q.minLength ?? null,
          maxLength: q.maxLength ?? null,
          minValue: q.minValue ?? null,
          maxValue: q.maxValue ?? null,
          options: q.options ?? [],
          sortOrder: order++,
        },
      });
    }
  }
  log(`Neue Fachfragen: ${added.length ? added.join(", ") : "keine"}`);
  return added;
}

/**
 * Szenarien pro Stelle (11/2026): Die allgemeinen Szenarien (für alle gleich)
 * werden archiviert – Antworten bleiben über den Snapshot erhalten. Jede Stelle
 * bekommt einen eigenen Abschnitt „Szenarien“; vorhandene Szenario-Fachfragen
 * ziehen dorthin um, neue werden ergänzt.
 */
async function scenariosPerPosition(db: PrismaClient, opts: Options) {
  const dry = !!opts.dryRun;
  const log = opts.log ?? (() => {});
  const report = { archived: [] as string[], sections: [] as string[], moved: [] as string[], added: [] as string[] };

  // a) Allgemeinen Abschnitt "Szenarien" samt Fragen archivieren
  const general = await db.formSection.findMany({ where: { key: "scenarios", positionId: null, archived: false }, select: { id: true } });
  for (const s of general) {
    report.archived.push("Allgemeine Szenarien");
    if (dry) continue;
    await db.question.updateMany({ where: { sectionId: s.id }, data: { archived: true } });
    await db.formSection.update({ where: { id: s.id }, data: { archived: true } });
  }
  // Einzelne allgemeine Szenario-Fragen, die woanders gelandet sind
  for (const q of RETIRED_GENERAL_SCENARIOS.questions) {
    const found = await db.question.findMany({ where: { key: q.key, archived: false }, select: { id: true } });
    if (found.length && !dry) await db.question.updateMany({ where: { key: q.key }, data: { archived: true } });
  }

  // b) Pro Stelle: Abschnitt "Szenarien" + Fragen
  for (const [slug, sections] of Object.entries(POSITION_SECTIONS)) {
    const seed = sections.find((s) => s.key === `${slug}.szenarien`);
    if (!seed) continue;
    const position = await db.position.findUnique({ where: { slug }, select: { id: true, typeId: true } });
    if (!position) continue; // Position gelöscht
    let section = await db.formSection.findFirst({ where: { key: seed.key } });
    if (section?.archived) continue; // bewusst entfernt
    if (!section) {
      report.sections.push(slug);
      if (dry) continue;
      const max = await db.formSection.aggregate({ _max: { sortOrder: true }, where: { positionId: position.id } });
      section = await db.formSection.create({
        data: { key: seed.key, typeId: position.typeId, positionId: position.id, title: seed.title, description: seed.description ?? null, sortOrder: (max._max.sortOrder ?? 100) + 1 },
      });
    }
    for (const [i, q] of seed.questions.entries()) {
      const existing = await db.question.findFirst({ where: { key: q.key }, select: { id: true, archived: true, sectionId: true } });
      if (existing?.archived) continue; // bewusst archiviert
      if (existing) {
        if (existing.sectionId !== section.id) {
          report.moved.push(q.key);
          if (!dry) await db.question.update({ where: { id: existing.id }, data: { sectionId: section.id, sortOrder: i } });
        }
        continue;
      }
      report.added.push(q.key);
      if (dry) continue;
      await db.question.create({
        data: {
          key: q.key,
          sectionId: section.id,
          label: q.label,
          type: q.type,
          required: q.required ?? true,
          helpText: q.helpText ?? null,
          placeholder: q.placeholder ?? null,
          minLength: q.minLength ?? null,
          maxLength: q.maxLength ?? null,
          minValue: q.minValue ?? null,
          maxValue: q.maxValue ?? null,
          options: q.options ?? [],
          sortOrder: i,
        },
      });
    }
  }
  log(`Szenarien pro Stelle: ${JSON.stringify(report)}`);
  return report;
}

/**
 * Regel-Quiz pro Stelle (11/2026): Schritt „Regel-Quiz“ mit sechs passenden Fragen
 * an jede vorhandene Stelle hängen – nur, wenn es den Schritt (Key) noch nicht gibt.
 */
async function addPositionQuiz(db: PrismaClient, opts: Options) {
  const log = opts.log ?? (() => {});
  const added: string[] = [];
  for (const [slug, quiz] of Object.entries(POSITION_QUIZ)) {
    const position = await db.position.findUnique({ where: { slug }, select: { id: true, typeId: true } });
    if (!position) continue; // Stelle wurde gelöscht
    if (await db.formSection.findFirst({ where: { key: quiz.key }, select: { id: true } })) continue;
    added.push(slug);
    if (opts.dryRun) continue;
    const max = await db.formSection.aggregate({ _max: { sortOrder: true }, where: { positionId: position.id } });
    const section = await db.formSection.create({
      data: { key: quiz.key, typeId: position.typeId, positionId: position.id, title: quiz.title, description: quiz.description ?? null, sortOrder: (max._max.sortOrder ?? 100) + 1 },
    });
    for (const [i, q] of quiz.questions.entries()) {
      if (await db.question.findFirst({ where: { key: q.key }, select: { id: true } })) continue;
      await db.question.create({
        data: { key: q.key, sectionId: section.id, label: q.label, type: q.type, required: true, options: q.options ?? [], correctOption: q.correctOption ?? null, sortOrder: i },
      });
    }
  }
  log(`Regel-Quiz: ${added.length ? added.join(", ") : "nichts zu tun"}`);
  return added;
}

const MIGRATIONS: { id: string; run: (db: PrismaClient, opts: Options) => Promise<unknown> }[] = [
  { id: "2026-11-questions-v2", run: migrateQuestionsV2 },
  { id: "2026-11-claims", run: noop },
  { id: "2026-11-explicit-nulls", run: noop },
  { id: "2026-11-fachfragen-v2", run: addSpecificQuestions },
  { id: "2026-11-szenarien-pro-stelle", run: scenariosPerPosition },
  // KI-Text-Check wurde wieder entfernt → gespeicherte Ergebnisse und Audit-Einträge löschen
  { id: "2026-11-remove-textcheck", run: (db, o) => (o.dryRun ? Promise.resolve(0) : removeTextCheckData(db)) },
  // Neuer Baustein: Zustimmung zu KI-Punkten (nur anlegen, falls es ihn noch nicht gibt)
  { id: "2026-11-template-ki-zustimmung", run: (db, o) => (o.dryRun ? Promise.resolve(0) : addKiConsentTemplate(db)) },
  // Eigene Sperrfrist pro Stelle (nur wo noch keine eingetragen ist)
  { id: "2026-11-sperrfristen-pro-stelle", run: (db, o) => (o.dryRun ? Promise.resolve(0) : setPositionCooldowns(db)) },
  // Absage-Bausteine nennen die Sperrfrist der Stelle (Tage + Datum)
  { id: "2026-11-absage-sperrfrist", run: (db, o) => (o.dryRun ? Promise.resolve(0) : rejectionTemplatesWithCooldown(db)) },
  { id: "2026-11-is-test", run: noop },
  // Regel-Quiz mit passenden Fragen für jede Stelle
  { id: "2026-11-quiz-pro-stelle", run: addPositionQuiz },
  { id: "2026-11-digest-optout", run: noop },
  // Bewerbungsgespräche und Support laufen über Discord (TeamSpeak nur Ingame-Voice)
  { id: "2026-11-gespraech-auf-discord", run: (db, o) => (o.dryRun ? Promise.resolve(0) : interviewsOnDiscord(db)) },
  // Einarbeitung: TeamSpeak ist nur Ingame-Voice – Punkt „TeamSpeak-Rechte gesetzt“ entfällt
  { id: "2026-11-einarbeitung-ohne-teamspeak", run: (db, o) => (o.dryRun ? Promise.resolve(0) : onboardingWithoutTeamspeak(db)) },
  // Moderator/Support: Ingame-Voice wieder in der Anforderung (Zwischenstand korrigieren)
  { id: "2026-11-anforderung-ingame-voice", run: (db, o) => (o.dryRun ? Promise.resolve(0) : interviewsOnDiscord(db)) },
  // Open Source: Kanal-IDs stehen nicht mehr als Standard im Code – bestehende Installation behält ihre Werte
  { id: "2026-11-kanal-ids-sichern", run: (db, o) => (o.dryRun ? Promise.resolve(0) : keepLegacyChannelIds(db)) },
  // Kommende Gespräche: Termin-Notizen und Discord-Events auf Discord umstellen
  { id: "2026-11-kommende-gespraeche-discord", run: (db, o) => (o.dryRun ? Promise.resolve(0) : upcomingInterviewsOnDiscord(db)) },
  // Neue Bewerbungsarten Whitelist und Beta (je eine Stelle, startet geschlossen)
  {
    id: "2026-11-whitelist-beta",
    run: async (db, o) => (o.dryRun ? 0 : (await import("@/lib/setup/base-seed")).seedKinds(db)),
  },
  // Bausteine je Bewerbungsart: mitgelieferte Team-/Whitelist-/Beta-Bausteine zuordnen (nur wenn noch nicht zugeordnet)
  { id: "2026-11-bausteine-arten", run: (db, o) => (o.dryRun ? Promise.resolve(0) : tagTemplateKinds(db)) },
  // Bausteine in allen Kategorien für Whitelist und Beta; allgemeine Team-Texte dem Team zuordnen
  {
    id: "2026-11-bausteine-alle-kategorien",
    run: async (db, o) => {
      if (o.dryRun) return 0;
      const tagged = await tagTemplateKinds(db);
      return tagged + (await (await import("@/lib/setup/base-seed")).ensureKindTemplates(db));
    },
  },
];

/** „TeamSpeak-Channel …“ in Notizen → Discord-Sprachkanal (rein, für Tests) */
export const noteOnDiscord = (note: string) => note.replace(/TeamSpeak[- ]?(?:Channel|Kanal)/gi, "Discord-Sprachkanal").replace(/TeamSpeak/gi, "Discord");

async function upcomingInterviewsOnDiscord(db: PrismaClient, now = new Date()) {
  let changed = 0;
  for (const slot of await db.interviewSlot.findMany({ where: { startsAt: { gt: now }, note: { contains: "TeamSpeak", mode: "insensitive" } }, select: { id: true, note: true } })) {
    await db.interviewSlot.update({ where: { id: slot.id }, data: { note: noteOnDiscord(slot.note ?? "") } });
    changed++;
  }
  const apps = await db.application.findMany({ where: { status: "INTERVIEW", interviewAt: { not: null, gt: now } }, select: { id: true, interviewNote: true, discordEventId: true } });
  const { syncInterview } = await import("@/lib/team/interview-sync");
  for (const a of apps) {
    if (a.interviewNote && /teamspeak/i.test(a.interviewNote)) {
      await db.application.update({ where: { id: a.id }, data: { interviewNote: noteOnDiscord(a.interviewNote) } });
      changed++;
    }
    // Bestehendes Server-Event bekommt den neuen Ort (bzw. den Sprachkanal)
    if (a.discordEventId) await syncInterview(a.id, now).catch(() => {});
  }
  return changed;
}

export const removeTeamspeakItem = (items: string) =>
  items
    .split("\n")
    .filter((l) => l.trim() !== "TeamSpeak-Rechte gesetzt")
    .join("\n");

async function onboardingWithoutTeamspeak(db: PrismaClient) {
  const s = await db.setting.findUnique({ where: { key: "onboarding.items" } });
  if (!s || typeof s.value !== "string") return 0; // Standard aus dem Code gilt – dort schon entfernt
  const value = removeTeamspeakItem(s.value);
  if (value === s.value) return 0;
  // War das der einzige Punkt: Einstellung löschen → Standardliste gilt (statt leerer Checkliste)
  if (!value.trim()) await db.setting.delete({ where: { key: s.key } });
  else await db.setting.update({ where: { key: s.key }, data: { value } });
  return 1;
}

/** Alte Standardtexte (genau so ausgeliefert) → neue Fassung. Von Admins geänderte Texte bleiben unberührt. */
export const DISCORD_TEXT_REPLACE: [string, string][] = [
  ["**Wo:** TeamSpeak, Warteraum Bewerbungsgespräche", "**Wo:** Discord, Sprachkanal „Bewerbungsgespräche“"],
  ["Dein Gespräch ist am **{termin}** auf TeamSpeak. Bis dann!", "Dein Gespräch ist am **{termin}** auf unserem Discord. Bis dann!"],
  ["laden wir dich zu einem kurzen Gespräch auf TeamSpeak ein.", "laden wir dich zu einem kurzen Gespräch auf unserem Discord ein."],
  ["Funktionierendes Mikrofon, TeamSpeak & SaltyChat", "Funktionierendes Mikrofon – Discord (Gespräch & Support), TeamSpeak & SaltyChat (Ingame)"],
  // Zwischenstand (kurz ausgeliefert) ohne Ingame-Voice
  ["Funktionierendes Mikrofon – Gespräch & Support auf Discord", "Funktionierendes Mikrofon – Discord (Gespräch & Support), TeamSpeak & SaltyChat (Ingame)"],
];
export const replaceDiscordTexts = (text: string) => DISCORD_TEXT_REPLACE.reduce((t, [a, b]) => t.split(a).join(b), text);

async function interviewsOnDiscord(db: PrismaClient) {
  let changed = 0;
  for (const t of await db.messageTemplate.findMany({ select: { id: true, body: true } })) {
    const body = replaceDiscordTexts(t.body);
    if (body !== t.body) {
      await db.messageTemplate.update({ where: { id: t.id }, data: { body } });
      changed++;
    }
  }
  for (const p of await db.position.findMany({ select: { id: true, requirements: true } })) {
    const requirements = p.requirements.map(replaceDiscordTexts);
    if (requirements.some((r, i) => r !== p.requirements[i])) {
      await db.position.update({ where: { id: p.id }, data: { requirements } });
      changed++;
    }
  }
  const conf = await db.setting.findUnique({ where: { key: "messages.confirmationTemplate" } });
  if (conf && typeof conf.value === "string") {
    const value = replaceDiscordTexts(conf.value);
    if (value !== conf.value) {
      await db.setting.update({ where: { key: conf.key }, data: { value } });
      changed++;
    }
  }
  // Stellenaufruf im Discord zeigt die Anforderungen – mit aktualisieren
  if (changed) {
    const { refreshJobsPostQuietly } = await import("@/lib/discord/jobs-post");
    await refreshJobsPostQuietly(db).catch(() => {});
  }
  return changed;
}


export const COOLDOWN_SENTENCE = "Für {position} gilt nach einer Absage eine Sperrfrist von **{sperrfrist_tage}** – du kannst dich also ab dem **{sperrfrist}** wieder bewerben.";
const COOLDOWN_REPLACE: [string, string][] = [
  ["Du kannst dich ab dem {sperrfrist} wieder bewerben.", COOLDOWN_SENTENCE],
  [
    "Wenn sich bei dir etwas ändert, bewirb dich gern ab dem {sperrfrist} nochmal.",
    "Wenn sich bei dir etwas ändert, bewirb dich gern nochmal: Die Sperrfrist für {position} beträgt **{sperrfrist_tage}**, also ab dem **{sperrfrist}**.",
  ],
];

/** Neuer Text eines Absage-Bausteins mit Sperrfrist – null, wenn nichts zu tun ist. */
export function withCooldownInfo(title: string, body: string): string | null {
  if (body.includes("{sperrfrist_tage}")) return null;
  if (/mindestalter/i.test(title)) return null; // Alter: erneut bewerben mit 18, nicht nach Frist
  for (const [from, to] of COOLDOWN_REPLACE) if (body.includes(from)) return body.replace(from, to);
  return `${body.trimEnd()}\n\n${COOLDOWN_SENTENCE}`;
}

async function rejectionTemplatesWithCooldown(db: PrismaClient) {
  const templates = await db.messageTemplate.findMany({ where: { category: "ABLEHNUNG" } });
  let n = 0;
  for (const t of templates) {
    const body = withCooldownInfo(t.title, t.body);
    if (body === null) continue;
    await db.messageTemplate.update({ where: { id: t.id }, data: { body } });
    n++;
  }
  return n;
}

async function setPositionCooldowns(db: PrismaClient) {
  const { POSITION_COOLDOWNS } = await import("@/lib/setup/seed-data");
  let n = 0;
  for (const [slug, days] of Object.entries(POSITION_COOLDOWNS)) {
    const r = await db.position.updateMany({ where: { slug, OR: [{ cooldownDays: null }] }, data: { cooldownDays: days } });
    n += r.count;
  }
  return n;
}

async function addKiConsentTemplate(db: PrismaClient) {
  const { KI_CONSENT_TEMPLATE_BODY, KI_CONSENT_TEMPLATE_TITLE } = await import("@/lib/setup/seed-data");
  if (await db.messageTemplate.findFirst({ where: { title: KI_CONSENT_TEMPLATE_TITLE } })) return 0;
  const last = await db.messageTemplate.aggregate({ _max: { sortOrder: true }, where: { category: "RUECKFRAGE" } });
  await db.messageTemplate.create({
    data: { category: "RUECKFRAGE", title: KI_CONSENT_TEMPLATE_TITLE, body: KI_CONSENT_TEMPLATE_BODY, sortOrder: (last._max.sortOrder ?? 0) + 1 },
  });
  return 1;
}

async function removeTextCheckData(db: PrismaClient) {
  // Die Felder gibt es in Postgres nicht mehr – nur die Audit-Einträge aufräumen
  return db.auditLog.deleteMany({ where: { action: "application.textcheck" } });
}

async function tagTemplateKinds(db: PrismaClient) {
  const { TEAM_ONLY_TEMPLATE_TITLES } = await import("@/lib/setup/seed-data");
  const { KIND_SEEDS } = await import("@/lib/setup/kinds-seed");
  let n = 0;
  const tag = async (titles: string[], kinds: string[]) => {
    n += (await db.messageTemplate.updateMany({ where: { title: { in: titles }, kinds: { isEmpty: true } }, data: { kinds } })).count;
  };
  await tag(TEAM_ONLY_TEMPLATE_TITLES, ["team"]);
  for (const k of KIND_SEEDS) await tag(k.templates.map((t) => t.title), [k.type.key]);
  return n;
}

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

/**
 * Bis Version 1.2 standen die Kanal-IDs des Nordverkehr-Servers als Standardwerte im Code.
 * Bestehende Installationen (nur dort läuft diese Migration – frische DBs markieren sie als
 * erledigt) bekommen die Werte einmalig fest gespeichert, sofern nichts eingestellt ist.
 */
const LEGACY_CHANNEL_IDS: Record<string, string> = {
  "discord.applicationsChannelId": "1570180703663165520",
  "discord.botLogChannelId": "1569736621019111515",
  "discord.jobsChannelId": "1569736461933084792",
  "discord.spotlightChannelId": "1569736463564808263",
  "discord.changelogChannelId": "1570181667627475146",
  "discord.summaryChannelId": "1569736476797837312",
  "discord.leadChannelId": "1569736564433494167",
};

async function keepLegacyChannelIds(db: PrismaClient) {
  let saved = 0;
  for (const [key, value] of Object.entries(LEGACY_CHANNEL_IDS)) {
    if (await db.setting.findUnique({ where: { key }, select: { key: true } })) continue;
    await db.setting.create({ data: { key, value } });
    saved++;
  }
  if (saved) {
    const { clearSettingsCache } = await import("@/lib/settings");
    clearSettingsCache();
  }
  return saved;
}
