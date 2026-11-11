/**
 * Probelauf der Fragen-Migration gegen eine Wegwerf-Datenbank mit Altbestand:
 * doppelt angelegte allgemeine Abschnitte (alter Race-Bug), allgemeine Fragen
 * in Positions-Abschnitten, Abschnitte mit Positionsnamen, Antworten und
 * Entwürfe auf Duplikaten. Prüft, dass danach nichts doppelt ist und keine
 * Antwort verloren geht.
 *
 *   npm run db:dev                 # lokale MongoDB (Replica Set)
 *   npx tsx scripts/test-migration.mts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "../src/lib/db";
import { migrateQuestionsV2, runMigrations } from "../src/lib/setup/migrations";
import { ensureIndexes } from "../src/lib/setup/indexes";
import { assembleForm, duplicateCheck } from "../src/lib/applications/assemble";
import { POSITIONS } from "../src/lib/setup/seed-data";

const url = new URL(resolveDatabaseUrl());
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Nur gegen eine lokale Datenbank ausführen.");
url.pathname = "/nordverkehr_migtest";
const db = new PrismaClient({ datasourceUrl: url.toString() });

const id = () => randomUUID().replace(/-/g, "").slice(0, 25);
let failures = 0;
function check(ok: boolean, msg: string) {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
}

type Q = { label: string; type?: string; options?: string[] };
async function legacySection(typeId: string, positionId: string | null, title: string, sortOrder: number, questions: Q[]) {
  const sectionId = id();
  // Alte Dokumente: ohne `key` und ohne `archived` (wie vor der Bereinigung)
  await db.$runCommandRaw({
    insert: "FormSection",
    documents: [{ _id: sectionId, typeId, positionId, title, description: null, sortOrder, createdAt: { $date: new Date().toISOString() } }],
  });
  const ids: string[] = [];
  for (const [i, q] of questions.entries()) {
    const qid = id();
    ids.push(qid);
    await db.$runCommandRaw({
      insert: "Question",
      documents: [
        {
          _id: qid,
          sectionId,
          label: q.label,
          type: q.type ?? "LONG_TEXT",
          required: true,
          options: q.options ?? [],
          sortOrder: i,
          archived: false,
          createdAt: { $date: new Date().toISOString() },
          updatedAt: { $date: new Date().toISOString() },
        },
      ],
    });
  }
  return ids;
}

const GENERAL_OLD: [string, Q[]][] = [
  [
    "Über dich",
    [
      { label: "Wie sollen wir dich nennen?", type: "SHORT_TEXT" },
      { label: "Wie viele Stunden pro Woche kannst du realistisch fürs Team einplanen?", type: "NUMBER" },
      { label: "Wann bist du meistens erreichbar?", type: "SHORT_TEXT" },
      { label: "Erzähl kurz etwas über dich." },
    ],
  ],
  [
    "Erfahrung & Motivation",
    [
      { label: "Welche Erfahrung hast du in anderen Teams oder Projekten?" },
      { label: "Warum willst du ausgerechnet bei Nordverkehr ins Team?" },
      { label: "Was sind deine Stärken?" },
      { label: "Woran arbeitest du noch?" },
    ],
  ],
  [
    "Szenarien",
    [
      { label: "Ein Spieler beleidigt dich im Support-Ticket. Wie reagierst du?", type: "SCENARIO" },
      { label: "Ein Freund von dir bricht eine Regel und du bekommst es mit. Was machst du?", type: "SCENARIO" },
      { label: "Zwei Teammitglieder sind sich öffentlich uneinig über eine Entscheidung. Wie gehst du damit um?", type: "SCENARIO" },
    ],
  ],
];

try {
  await db.$runCommandRaw({ dropDatabase: 1 });
  const type = await db.applicationType.create({ data: { key: "team", name: "Team-Bewerbung" } });
  const pos: Record<string, string> = {};
  for (const p of POSITIONS) {
    const created = await db.position.create({
      data: { typeId: type.id, slug: p.slug, title: p.title, tagline: p.tagline, description: p.description, tasks: p.tasks, requirements: p.requirements },
    });
    pos[p.slug] = created.id;
  }

  // Allgemeine Abschnitte zweimal (Race-Bug der alten Ersteinrichtung)
  const setA: string[][] = [];
  const setB: string[][] = [];
  for (const [i, [title, qs]] of GENERAL_OLD.entries()) setA.push(await legacySection(type.id, null, title, i, qs));
  for (const [i, [title, qs]] of GENERAL_OLD.entries()) setB.push(await legacySection(type.id, null, title, i, qs));

  // Support: Abschnitt heißt wie die Position, enthält eine allgemeine Frage doppelt + eigene Admin-Frage
  const support = await legacySection(type.id, pos.support, "Support", 100, [
    { label: "Wie viel Support-Erfahrung hast du ungefähr?", type: "SELECT", options: ["Keine", "Ein bisschen", "Viel"] },
    { label: "Ein neuer Spieler hat noch nie RP gespielt. Wie erklärst du ihm den Einstieg?", type: "SCENARIO" },
    { label: "Warum willst du ausgerechnet bei Nordverkehr ins Team?" },
    { label: "Was ist dein Lieblingsfahrzeug in Hamburg?", type: "SHORT_TEXT" },
  ]);
  const event = await legacySection(type.id, pos.eventteam, "Eventteam", 100, [
    { label: "Hast du schon Events organisiert? Erzähl kurz." },
    { label: "Beschreib ein Event, das du gern auf Nordverkehr veranstalten würdest." },
  ]);

  const user = await db.user.create({ data: { discordId: "100000000000000001", username: "tester", discordCreatedAt: new Date("2020-01-01") } });
  const user2 = await db.user.create({ data: { discordId: "100000000000000002", username: "tester2", discordCreatedAt: new Date("2020-01-01") } });

  // Eingereichte Bewerbung: Antworten auf Fragen aus dem ZWEITEN Duplikat-Satz + doppelte Motivation im Support-Abschnitt
  const app = await db.application.create({
    data: { userId: user.id, positionId: pos.support, status: "SUBMITTED", publicId: "NV-TEST-1", submittedAt: new Date() },
  });
  const answerQ = [...setB.flat(), ...support];
  await db.answer.createMany({
    data: answerQ.map((qid, i) => ({ applicationId: app.id, questionId: qid, sectionTitle: "alt", label: "alt", type: "LONG_TEXT" as const, value: `Antwort ${i}`, sortOrder: i })),
  });

  // Entwurf: Werte auf Duplikaten aus beiden Sätzen + Eventteam
  const draftData: Record<string, unknown> = {};
  setB[0].forEach((qid, i) => (draftData[qid] = `entwurf-b-${i}`));
  setA[1].forEach((qid, i) => (draftData[qid] = `entwurf-a-${i}`));
  draftData[event[1]] = "Eventidee";
  const draft = await db.application.create({ data: { userId: user2.id, positionId: pos.eventteam, status: "DRAFT", draftData: draftData as object } });

  const answersBefore = await db.answer.count();
  console.log(`Altbestand: ${await db.formSection.count()} Abschnitte, ${await db.question.count()} Fragen, ${answersBefore} Antworten\n`);

  // 1) Probelauf ändert nichts
  const dry = await migrateQuestionsV2(db, { dryRun: true });
  console.log("Probelauf-Report:", JSON.stringify({ ...dry, questionsKeyed: dry.questionsKeyed.length, sectionsKeyed: dry.sectionsKeyed.length }, null, 1));
  check(dry.sectionsMerged.length === 3 && dry.answersRemapped > 0, `Probelauf erkennt Duplikate (${dry.sectionsMerged.length} Abschnitte, ${dry.answersRemapped} Antworten)`);
  check((await db.question.count({ where: { key: { not: null } } })) === 0, "Probelauf setzt keine Keys");
  check((await db.answer.count({ where: { questionId: { in: setB.flat() } } })) > 0, "Probelauf hängt keine Antworten um");

  // 2) Ausführen (wie beim Serverstart)
  const done = await runMigrations(db, { log: () => {} });
  check(done.includes("2026-11-questions-v2"), `Migrationen ausgeführt: ${done.join(", ")}`);
  await ensureIndexes(db);
  check(true, "Unique-Indizes ließen sich anlegen (keine doppelten Keys mehr)");

  // 3) Formulare je Position: keine Duplikate
  for (const p of POSITIONS) {
    const sections = await db.formSection.findMany({
      where: { typeId: type.id, OR: [{ positionId: null }, { positionId: pos[p.slug] }], NOT: { archived: true } },
      include: { questions: { where: { archived: false } } },
    });
    const form = assembleForm(
      sections.map((s) => ({ ...s, questions: s.questions.map((q) => ({ ...q })) })),
      p,
    );
    const dup = duplicateCheck(form);
    check(dup.duplicateKeys.length === 0 && dup.duplicateLabels.length === 0, `${p.title}: keine doppelte Frage (${form.flatMap((s) => s.questions).length} Fragen)`);
    check(!form.some((s) => s.title.toLowerCase() === p.title.toLowerCase()), `${p.title}: kein Abschnitt „${p.title} // ${p.title}“`);
  }

  // 4) Rohdaten: allgemeine Abschnitte nur noch einmal aktiv
  const activeGeneral = await db.formSection.findMany({ where: { positionId: null, NOT: { archived: true } }, include: { questions: { where: { archived: false } } } });
  check(activeGeneral.length === 3, `3 aktive allgemeine Abschnitte (ist: ${activeGeneral.length})`);
  const activeKeys = (await db.question.findMany({ where: { archived: false, key: { not: null } }, select: { key: true } })).map((q) => q.key!);
  check(new Set(activeKeys).size === activeKeys.length, "jeder aktive Key genau einmal");

  // 5) Antworten: keine verloren, alle zeigen auf existierende Fragen
  const answers = await db.answer.findMany({ where: { applicationId: app.id } });
  check(answers.length === answersBefore, `alle ${answersBefore} Antworten noch da`);
  const qIds = new Set((await db.question.findMany({ select: { id: true } })).map((q) => q.id));
  check(answers.every((a) => a.questionId && qIds.has(a.questionId)), "alle Antworten zeigen auf existierende Fragen");
  const onArchivedDup = await db.answer.count({ where: { questionId: { in: setB.flat().filter((q) => !qIds.has(q)) } } });
  check(onArchivedDup === 0, "keine Antwort hängt an gelöschten Fragen");
  const supportMotivation = answers.find((a) => a.value === `Antwort ${setB.flat().length + 2}`);
  const motivationQ = supportMotivation?.questionId ? await db.question.findUnique({ where: { id: supportMotivation.questionId } }) : null;
  check(motivationQ?.key === "motivation" && !motivationQ.archived, "doppelte Motivation im Support-Abschnitt → allgemeine Frage „motivation“");

  // 6) Entwurf: Werte umgeschlüsselt auf aktive Fragen, nichts verloren (außer bei Duplikaten mit zwei Werten)
  const d = (await db.application.findUniqueOrThrow({ where: { id: draft.id } })).draftData as Record<string, unknown>;
  const activeIds = new Set((await db.question.findMany({ where: { archived: false }, select: { id: true } })).map((q) => q.id));
  const retiredIds = new Set((await db.question.findMany({ where: { archived: true, key: { in: ["callname", "eventteam.experience"] } }, select: { id: true } })).map((q) => q.id));
  check(Object.keys(d).every((k) => activeIds.has(k) || retiredIds.has(k)), "Entwurf zeigt nur noch auf aktive (oder bewusst entfallene) Fragen");
  check(Object.values(d).includes("Eventidee"), "Eventteam-Antwort im Entwurf erhalten");
  check(Object.values(d).filter((v) => String(v).startsWith("entwurf-")).length === 4 + 3, `alle 7 allgemeinen Entwurfswerte erhalten (ist: ${Object.values(d).filter((v) => String(v).startsWith("entwurf-")).length})`);

  // 7) Eigene Admin-Frage unverändert, Abschnitt umbenannt, entfallene Fragen archiviert
  const custom = await db.question.findFirst({ where: { label: "Was ist dein Lieblingsfahrzeug in Hamburg?" } });
  check(!!custom && !custom.archived, "eigene Admin-Frage bleibt aktiv");
  const supportSection = await db.formSection.findFirst({ where: { positionId: pos.support, NOT: { archived: true } } });
  check(supportSection?.title === "Fachfragen", `Support-Abschnitt heißt „Fachfragen“ (ist: ${supportSection?.title})`);
  const callname = await db.question.findMany({ where: { key: "callname" } });
  check(callname.length === 1 && callname[0].archived, "„Wie sollen wir dich nennen?“ archiviert (Antworten bleiben)");
  const tickets = await db.question.findFirst({ where: { key: "support.tickets", archived: false } });
  check(tickets?.label.includes("Tickets") === true && tickets.options.length === 4, "Support-Erfahrung → Ticket-Frage mit neuen Optionen");
  const insult = await db.question.findFirst({ where: { key: "scenario_insult", archived: false } });
  check(insult?.label.startsWith("Jemand beleidigt dich") === true, "Beleidigungs-Szenario neutral formuliert");

  // 8) Zweiter Lauf ist ein No-op
  check((await runMigrations(db, { log: () => {} })).length === 0, "zweiter Lauf tut nichts");
  const again = await migrateQuestionsV2(db, { dryRun: true });
  check(again.sectionsMerged.length === 0 && again.questionsMerged.length === 0, "erneuter Probelauf findet keine Duplikate");

  console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen.` : "\nAlle Prüfungen bestanden.");
  process.exitCode = failures ? 1 : 0;
} finally {
  await db.$runCommandRaw({ dropDatabase: 1 }).catch(() => {});
  await db.$disconnect();
}
