/**
 * Seed: Bewerbungsart, Positionen, Formularfragen, Nachrichtenbausteine
 * und (optional) Demo-Bewerbungen.
 *
 *   npm run db:seed              # alles
 *   SEED_DEMO=false npm run db:seed   # ohne Testbewerbungen (Produktion)
 *
 * Idempotent: Bereits vorhandene Positionen/Bausteine werden nicht doppelt angelegt.
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { ApplicationStatus, QuestionType, VoteValue } from "@prisma/client";
import { GENERAL_SECTIONS, POSITIONS, TEMPLATES, type SeedSection } from "./seed-data";
import { ensureIndexes } from "../scripts/mongo-indexes";
import { withDatabaseName } from "../src/lib/db";

const db = new PrismaClient({ datasourceUrl: withDatabaseName(process.env.DATABASE_URL ?? "") });

async function createSections(typeId: string, positionId: string | null, sections: SeedSection[], offset = 0) {
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

async function seedStructure() {
  const type = await db.applicationType.upsert({
    where: { key: "team" },
    create: { key: "team", name: "Team-Bewerbung", description: "Bewerbungen für das Nordverkehr-Team" },
    update: {},
  });

  const generalCount = await db.formSection.count({ where: { typeId: type.id, positionId: null } });
  if (generalCount === 0) {
    await createSections(type.id, null, GENERAL_SECTIONS);
    console.log(`✓ ${GENERAL_SECTIONS.length} allgemeine Formular-Schritte`);
  }

  for (const [i, p] of POSITIONS.entries()) {
    const exists = await db.position.findUnique({ where: { slug: p.slug } });
    if (exists) continue;
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
    await createSections(type.id, pos.id, p.sections, 100);
    console.log(`✓ Position ${p.title}`);
  }
  return type;
}

async function seedTemplates() {
  if ((await db.messageTemplate.count()) > 0) return;
  await db.messageTemplate.createMany({
    data: TEMPLATES.map((t, i) => ({ ...t, sortOrder: i })),
  });
  console.log(`✓ ${TEMPLATES.length} Nachrichtenbausteine`);
}

// ─── Demo-Daten ──────────────────────────────────────────────

const DEMO_PREFIX = "11000000000000000";

const PERSONAS = [
  { name: "Jonas", user: "jonas.hh", age: 24, tone: "solide", status: "SUBMITTED", position: "support" },
  { name: "Lea", user: "lea_nord", age: 21, tone: "stark", status: "IN_REVIEW", position: "moderator" },
  { name: "Mats", user: "matsdev", age: 27, tone: "stark", status: "INTERVIEW", position: "entwickler" },
  { name: "Finn", user: "finnyboy", age: 19, tone: "kurz", status: "SUBMITTED", position: "support" },
  { name: "Svenja", user: "svenja.media", age: 23, tone: "solide", status: "ACCEPTED", position: "media" },
  { name: "Ole", user: "ole_maps", age: 30, tone: "solide", status: "REJECTED", position: "mapper" },
  { name: "Kim", user: "kim.k", age: 22, tone: "stark", status: "IN_REVIEW", position: "support" },
  { name: "Hauke", user: "hauke_rp", age: 26, tone: "kurz", status: "DRAFT", position: "moderator" },
] as const;

const TEXT = {
  stark: [
    "Ich spiele seit gut vier Jahren RP und war zwei Jahre im Support eines mittelgroßen Servers. Dort habe ich gelernt, dass die meisten Konflikte sich mit Ruhe und einer klaren Erklärung lösen lassen. Mir ist wichtig, dass Spieler sich ernst genommen fühlen.",
    "Mich reizt an Nordverkehr, dass ihr klein und mit klarem Plan startet. Ich habe auf größeren Servern erlebt, wie schnell Teams unübersichtlich werden. Hier kann ich von Anfang an mithelfen, Abläufe sauber aufzusetzen, und das macht mir einfach Spaß.",
    "Ich würde erst mal nicht auf die Beleidigung eingehen, sondern sachlich bleiben und nachfragen, worum es eigentlich geht. Meistens steckt Frust über etwas anderes dahinter. Wenn es weitergeht, weise ich auf die Regeln hin und gebe das Ticket notfalls an jemand anderen ab, damit es nicht persönlich wird.",
  ],
  solide: [
    "Ich bin seit ungefähr zwei Jahren im RP unterwegs, vor allem als Zivilist und eine Zeit lang bei der Polizei. Im Team war ich bisher nur kurz auf einem kleinen Server als Supporter, das hat mir aber gut gefallen.",
    "Ich finde den Ansatz gut, dass ehrliches RP im Vordergrund steht und nicht Show. Ich möchte mithelfen, dass sich neue Spieler schnell wohlfühlen, und bin abends eigentlich immer online.",
    "Ich bleibe ruhig und erkläre dem Spieler, dass so ein Ton im Ticket nicht geht. Dann versuche ich trotzdem, sein Problem zu lösen. Wenn er weiter beleidigt, schließe ich das Ticket und gebe es an die Leitung weiter.",
  ],
  kurz: ["Bin schon lange dabei.", "Weil der Server cool ist.", "Ich sag ihm er soll aufhören."],
};

function answerFor(type: QuestionType, options: string[], tone: keyof typeof TEXT, i: number): Prisma.InputJsonValue | null {
  const pool = TEXT[tone];
  switch (type) {
    case "SHORT_TEXT":
      return tone === "kurz" ? "Finn" : "Passt so";
    case "LONG_TEXT":
    case "SCENARIO":
      return pool[i % pool.length];
    case "SELECT":
      return options[Math.min(options.length - 1, tone === "stark" ? 2 : 1)] ?? null;
    case "MULTI_SELECT":
      return options.slice(0, tone === "stark" ? 2 : 1);
    case "URL":
      return "https://github.com/";
    case "NUMBER":
      return 10;
    case "CHECKBOX":
      return true;
    case "FILE":
      return [];
  }
}

async function seedDemo() {
  if (process.env.SEED_DEMO === "false") return;
  if ((await db.user.count({ where: { discordId: { startsWith: DEMO_PREFIX } } })) > 0) {
    console.log("• Demo-Daten existieren bereits – übersprungen");
    return;
  }

  const reviewer = await db.user.create({
    data: {
      discordId: `${DEMO_PREFIX}99`,
      username: "demo.teammitglied",
      globalName: "Demo-Teammitglied",
      discordCreatedAt: new Date("2019-04-12"),
      isTeam: true,
      isAdmin: true,
      inGuild: true,
    },
  });

  const now = Date.now();
  const year = new Date().getFullYear();
  let counter = 0;

  for (const [idx, p] of PERSONAS.entries()) {
    const user = await db.user.create({
      data: {
        discordId: `${DEMO_PREFIX}${String(idx + 10).padStart(2, "0")}`,
        username: p.user,
        globalName: p.name,
        discordCreatedAt: new Date(now - (idx === 3 ? 12 : 400 + idx * 90) * 86_400_000),
        inGuild: true,
        guildJoinedAt: new Date(now - (60 + idx * 7) * 86_400_000),
      },
    });
    const position = await db.position.findUniqueOrThrow({ where: { slug: p.position } });
    const sections = await db.formSection.findMany({
      where: { typeId: position.typeId, OR: [{ positionId: null }, { positionId: position.id }] },
      orderBy: [{ sortOrder: "asc" }],
      include: { questions: { where: { archived: false }, orderBy: { sortOrder: "asc" } } },
    });

    const status = p.status as ApplicationStatus;
    const submittedAt = new Date(now - (14 - idx) * 86_400_000);

    if (status === "DRAFT") {
      await db.application.create({
        data: { userId: user.id, positionId: position.id, status, draftStep: 1, draftData: {} },
      });
      continue;
    }

    counter++;
    const publicId = `NV-${year}-${String(counter).padStart(4, "0")}`;
    const answers: Prisma.AnswerCreateWithoutApplicationInput[] = [];
    let order = 0;
    for (const s of sections) {
      for (const [qi, q] of s.questions.entries()) {
        const value = answerFor(q.type, q.options, p.tone, qi);
        if (value === null) continue;
        answers.push({ questionId: q.id, sectionTitle: s.title, label: q.label, type: q.type, value, sortOrder: order++ });
      }
    }

    const decided = status === "ACCEPTED" || status === "REJECTED";
    const flags =
      p.tone === "kurz"
        ? [
            { code: "short_answers", message: "Viele sehr kurze Antworten." },
            ...(idx === 3 ? [{ code: "young_account", message: "Discord-Account ist erst 12 Tage alt." }] : []),
          ]
        : [];

    const app = await db.application.create({
      data: {
        publicId,
        userId: user.id,
        positionId: position.id,
        status,
        age: p.age,
        submittedAt,
        firstReviewedAt: status !== "SUBMITTED" ? new Date(submittedAt.getTime() + 86_400_000) : null,
        decidedAt: decided ? new Date(submittedAt.getTime() + 5 * 86_400_000) : null,
        decidedById: decided ? reviewer.id : null,
        interviewAt: status === "INTERVIEW" ? new Date(now + 2 * 86_400_000 + 19 * 3_600_000) : null,
        consentVersion: "2026-11-v1",
        consentAt: submittedAt,
        confirmations: { voice: true, rules: true, truth: true, privacy: true },
        confirmationDmStatus: idx === 6 ? "DM_CLOSED" : "SENT",
        flags,
        answers: { create: answers },
        statusChanges: {
          create: [
            { to: "SUBMITTED", createdAt: submittedAt },
            ...(status !== "SUBMITTED"
              ? [{ from: "SUBMITTED" as const, to: status, actorId: reviewer.id, createdAt: new Date(submittedAt.getTime() + 2 * 86_400_000) }]
              : []),
          ],
        },
        messages: {
          create: [
            {
              direction: "SYSTEM",
              body: `Moin ${p.name},\n\ndanke für deine Bewerbung als **${position.title}** – sie ist bei uns eingegangen.\n\n**Bewerbungs-ID:** ${publicId}`,
              deliveryStatus: idx === 6 ? "DM_CLOSED" : "SENT",
              sentAt: submittedAt,
              createdAt: submittedAt,
            },
            ...(status === "INTERVIEW"
              ? [
                  {
                    direction: "TEAM_TO_APPLICANT" as const,
                    authorId: reviewer.id,
                    body: `Moin ${p.name},\n\ndeine Bewerbung hat uns gefallen – wir wollen dich kennenlernen. Termin folgt per DM.`,
                    deliveryStatus: "SENT" as const,
                    sentAt: new Date(submittedAt.getTime() + 2 * 86_400_000),
                  },
                ]
              : []),
          ],
        },
      },
    });

    if (status !== "SUBMITTED") {
      await db.vote.create({
        data: {
          applicationId: app.id,
          userId: reviewer.id,
          value: (status === "REJECTED" ? "CONTRA" : "PRO") as VoteValue,
        },
      });
      await db.comment.create({
        data: {
          applicationId: app.id,
          authorId: reviewer.id,
          body:
            status === "REJECTED"
              ? "Screenshots wirken nicht selbst gemacht – Quelle unklar. Lieber nochmal in ein paar Monaten."
              : "Antworten wirken durchdacht, Szenario 1 besonders gut gelöst.",
        },
      });
    }
  }

  await db.counter.upsert({
    where: { key: `publicId:${year}` },
    create: { key: `publicId:${year}`, value: counter },
    update: { value: counter },
  });

  const support = await db.user.findFirst({ where: { username: "finnyboy" } });
  if (support) {
    await db.userNote.create({
      data: { subjectId: support.id, authorId: reviewer.id, body: "War im Ticket #212 recht ungeduldig, sonst unauffällig." },
    });
  }
  console.log(`✓ ${PERSONAS.length} Demo-Bewerbungen`);
}

async function main() {
  await ensureIndexes(db);
  await seedStructure();
  await seedTemplates();
  await seedDemo();
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
