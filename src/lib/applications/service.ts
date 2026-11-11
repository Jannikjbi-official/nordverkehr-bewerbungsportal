import "server-only";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { getSettings, type Settings } from "@/lib/settings";
import { checkEligibility, effectiveMinAge } from "@/lib/applications/rules";
import {
  CONSENT_VERSION,
  confirmationsSchema,
  normalizeAnswers,
  validateAll,
  type AnswerMap,
  type FormSectionDef,
} from "@/lib/applications/form";
import { computeFlags, type ApplicationFlag } from "@/lib/applications/flags";
import { mergeProfile, type ProfileAnswers } from "@/lib/applications/profile";
import { getFormDefinition } from "@/lib/data/positions";
import { buildApplicantMessage, buildLogMessage } from "@/lib/messages/embed";
import { buildTemplateVars, renderTemplate } from "@/lib/messages/placeholders";
import { enqueue } from "@/lib/discord/outbox-db";
import type { Prisma } from "@prisma/client";

export class UserFacingError extends Error {
  constructor(message: string, public readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export async function getEligibility(userId: string, position: { id: string; status: "OPEN" | "CLOSED" | "HIDDEN"; cooldownDays: number | null; minAge: number | null }, settings?: Settings) {
  const s = settings ?? (await getSettings());
  const [previous, ban] = await Promise.all([
    db.application.findMany({
      where: { userId, positionId: position.id },
      select: { id: true, status: true, decidedAt: true },
    }),
    db.userBan.findFirst({
      where: { subjectId: userId, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return checkEligibility({
    now: new Date(),
    position,
    settings: { cooldownDays: s["applications.cooldownDays"], minAge: s["applications.minAge"] },
    previous,
    activeBan: ban ? { reason: ban.reason, expiresAt: ban.expiresAt } : null,
  });
}

async function nextPublicId(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const key = `publicId:${year}`;
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${env().PUBLIC_ID_PREFIX}-${year}-${String(row.value).padStart(4, "0")}`;
}

/** Prüft, dass alle referenzierten Uploads dem Nutzer gehören. */
async function verifyUploads(userId: string, sections: FormSectionDef[], answers: AnswerMap) {
  const ids: string[] = [];
  for (const s of sections)
    for (const q of s.questions)
      if (q.type === "FILE" && Array.isArray(answers[q.id])) ids.push(...(answers[q.id] as string[]));
  if (!ids.length) return ids;
  const count = await db.upload.count({ where: { id: { in: ids }, ownerId: userId } });
  if (count !== new Set(ids).size) throw new UserFacingError("Mindestens ein Bild gehört nicht zu deinem Account.");
  return ids;
}

export interface SubmitInput {
  draftId: string;
  data: AnswerMap;
  age: number;
  confirmations: unknown;
  honeypot?: string;
}

export async function submitApplication(user: { id: string; discordId: string; username: string; globalName: string | null; discordCreatedAt: Date }, input: SubmitInput) {
  const settings = await getSettings();
  const draft = await db.application.findFirst({
    where: { id: input.draftId, userId: user.id, status: "DRAFT" },
    include: { position: true },
  });
  if (!draft) throw new UserFacingError("Entwurf nicht gefunden. Lade die Seite neu.");

  // Spam-Schutz: Honeypot + Mindest-Ausfüllzeit
  if (input.honeypot) throw new UserFacingError("Das hat nicht geklappt. Bitte lade die Seite neu.");
  const elapsed = (Date.now() - draft.createdAt.getTime()) / 1000;
  if (elapsed < settings["applications.minFillSeconds"]) {
    throw new UserFacingError("Das ging ungewöhnlich schnell. Lies deine Antworten bitte nochmal in Ruhe durch.");
  }

  const eligibility = await getEligibility(user.id, draft.position, settings);
  if (!eligibility.ok) throw new UserFacingError(eligibility.message);

  const minAge = effectiveMinAge(draft.position, { minAge: settings["applications.minAge"] });
  if (!Number.isInteger(input.age) || input.age < 10 || input.age > 99) {
    throw new UserFacingError("Bitte gib dein Alter an.", { age: "Bitte gib dein Alter an." });
  }
  if (input.age < minAge) {
    throw new UserFacingError(`Für Team-Positionen gilt ein Mindestalter von ${minAge} Jahren.`, {
      age: `Mindestalter ${minAge} Jahre.`,
    });
  }

  const sections = await getFormDefinition(draft.position);
  const answers = normalizeAnswers(sections, input.data);
  const validation = validateAll(sections, answers);
  if (!validation.ok) throw new UserFacingError("Ein paar Angaben fehlen noch.", validation.errors);

  const confirmations = confirmationsSchema.safeParse(input.confirmations);
  if (!confirmations.success) throw new UserFacingError("Bitte bestätige alle Punkte im letzten Schritt.");

  const uploadIds = await verifyUploads(user.id, sections, answers);

  // Hinweise (kein Score) – Vergleich mit den letzten Bewerbungen derselben Position
  const recent = await db.application.findMany({
    where: { positionId: draft.positionId, submittedAt: { not: null }, NOT: { userId: user.id } },
    orderBy: { submittedAt: "desc" },
    take: 150,
    select: { publicId: true, answers: { where: { type: { in: ["LONG_TEXT", "SCENARIO"] } }, select: { value: true } } },
  });
  const textAnswers = sections.flatMap((s) =>
    s.questions
      .filter((q) => ["LONG_TEXT", "SCENARIO"].includes(q.type) && typeof answers[q.id] === "string")
      .map((q) => ({ label: q.label, value: answers[q.id] as string, minExpected: q.minLength ?? 0 })),
  );
  const flags: ApplicationFlag[] = computeFlags({
    textAnswers,
    discordCreatedAt: user.discordCreatedAt,
    now: new Date(),
    minAccountDays: settings["applications.minDiscordAccountDays"],
    otherApplications: recent.map((r) => ({
      publicId: r.publicId ?? "?",
      text: r.answers.map((a) => (typeof a.value === "string" ? a.value : "")).join(" \n "),
    })),
  });

  const submittedAt = new Date();
  const dashboardUrl = `${publicEnv.appUrl}/dashboard/${draft.id}`;
  const e = env();

  const result = await db.$transaction(async (tx) => {
    const publicId = await nextPublicId(tx);

    let order = 0;
    const answerRows: Prisma.AnswerCreateManyInput[] = [];
    for (const s of sections) {
      for (const q of s.questions) {
        const v = answers[q.id];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
        answerRows.push({
          applicationId: draft.id,
          questionId: q.id,
          sectionTitle: s.title,
          label: q.label,
          type: q.type,
          value: v as Prisma.InputJsonValue,
          sortOrder: order++,
        });
      }
    }
    await tx.answer.createMany({ data: answerRows });
    if (uploadIds.length) {
      await tx.upload.updateMany({ where: { id: { in: uploadIds }, ownerId: user.id }, data: { applicationId: draft.id } });
    }

    await tx.application.update({
      where: { id: draft.id },
      data: {
        publicId,
        status: "SUBMITTED",
        submittedAt,
        age: input.age,
        confirmations: confirmations.data,
        consentVersion: CONSENT_VERSION,
        consentAt: submittedAt,
        flags: flags as unknown as Prisma.InputJsonValue,
        draftData: {},
        confirmationDmStatus: "PENDING",
      },
    });
    await tx.statusChange.create({ data: { applicationId: draft.id, to: "SUBMITTED", actorId: user.id } });

    // Allgemeine Antworten fürs nächste Mal merken (per Fragen-Key)
    const profile = await tx.applicantProfile.findUnique({ where: { userId: user.id }, select: { answers: true } });
    const profileAnswers = mergeProfile(sections, (profile?.answers ?? {}) as ProfileAnswers, answers) as Prisma.InputJsonValue;
    await tx.applicantProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, age: input.age, answers: profileAnswers },
      update: { age: input.age, answers: profileAnswers },
    });

    // Automatische Bestätigung: im Portal + per DM
    const rendered = renderTemplate(
      settings["messages.confirmationTemplate"],
      buildTemplateVars({
        applicant: user,
        positionTitle: draft.position.title,
        publicId,
        submittedAt,
        processingTime: settings["applications.processingTime"],
        dashboardUrl,
      }),
    );
    const message = await tx.message.create({
      data: {
        applicationId: draft.id,
        direction: "SYSTEM",
        body: rendered.text,
        deliveryStatus: "PENDING",
      },
    });
    const jobIds: string[] = [];
    const dm = await enqueue(
      {
        type: "DM",
        discordUserId: user.discordId,
        purpose: "confirmation",
        message: buildApplicantMessage({
          title: "Bewerbung eingegangen",
          body: rendered.text,
          publicId,
          statusUrl: dashboardUrl,
        }),
      },
      { tx, messageId: message.id, applicationId: draft.id },
    );
    jobIds.push(dm.id);

    if (settings["discord.logChannelEnabled"] && e.DISCORD_LOG_CHANNEL_ID) {
      const log = await enqueue(
        {
          type: "CHANNEL_MESSAGE",
          channelId: e.DISCORD_LOG_CHANNEL_ID,
          message: buildLogMessage({
            positionTitle: draft.position.title,
            applicantDiscordId: user.discordId,
            applicantName: user.globalName || user.username,
            publicId,
            age: input.age,
            teamUrl: `${publicEnv.appUrl}/team/bewerbungen/${draft.id}`,
            flags: flags.map((f) => f.message),
          }),
        },
        { tx, applicationId: draft.id },
      );
      jobIds.push(log.id);
    }

    await tx.auditLog.create({
      data: { actorId: user.id, action: "application.submit", targetType: "application", targetId: draft.id, meta: { publicId } },
    });

    return { publicId, jobIds };
  });

  return { applicationId: draft.id, ...result };
}
