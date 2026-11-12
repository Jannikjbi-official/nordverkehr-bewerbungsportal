"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth/session";
import { draftDataSchema, type AnswerMap } from "@/lib/applications/form";
import { getEligibility, submitApplication, UserFacingError } from "@/lib/applications/service";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { runOutbox } from "@/lib/discord/outbox-db";
import { botLog, esc } from "@/lib/discord/botlog";
import { ACTIVE_STATUSES, canFollowUp, isInProcessing } from "@/lib/applications/status";
import type { Prisma } from "@prisma/client";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const idSchema = z.string().min(10).max(40);

const saveDraftSchema = z.object({
  positionId: idSchema,
  draftId: idSchema.nullable(),
  data: draftDataSchema,
  step: z.number().int().min(0).max(50),
  age: z.number().int().min(0).max(120).nullable(),
});

/** Autosave: legt den Entwurf beim ersten Speichern an. */
export async function saveDraft(input: z.input<typeof saveDraftSchema>): Promise<ActionResult<{ draftId: string; savedAt: string }>> {
  const user = await requireUser();
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Daten." };
  const { positionId, draftId, data, step, age } = parsed.data;

  const rl = await rateLimit(`draft:${user.id}`, 240, 600);
  if (!rl.ok) return { ok: false, error: "Zu viele Speichervorgänge. Kurz durchatmen." };

  const position = await db.position.findUnique({ where: { id: positionId } });
  if (!position || position.status === "HIDDEN") return { ok: false, error: "Position nicht gefunden." };

  if (draftId) {
    const updated = await db.application.updateMany({
      where: { id: draftId, userId: user.id, status: "DRAFT", positionId },
      data: { draftData: data as Prisma.InputJsonValue, draftStep: step, age },
    });
    if (updated.count === 0) return { ok: false, error: "Entwurf nicht mehr verfügbar." };
    return { ok: true, data: { draftId, savedAt: new Date().toISOString() } };
  }

  const eligibility = await getEligibility(user.id, position);
  if (!eligibility.ok) return { ok: false, error: eligibility.message };
  if (eligibility.draftId) {
    await db.application.update({
      where: { id: eligibility.draftId },
      data: { draftData: data as Prisma.InputJsonValue, draftStep: step, age },
    });
    return { ok: true, data: { draftId: eligibility.draftId, savedAt: new Date().toISOString() } };
  }

  try {
    const created = await db.application.create({
      data: { userId: user.id, positionId, status: "DRAFT", draftData: data as Prisma.InputJsonValue, draftStep: step, age },
      select: { id: true },
    });
    return { ok: true, data: { draftId: created.id, savedAt: new Date().toISOString() } };
  } catch {
    // Paralleler Request hat den Entwurf schon angelegt (Unique-Index)
    const existing = await db.application.findFirst({ where: { userId: user.id, positionId, status: "DRAFT" }, select: { id: true } });
    if (existing) return { ok: true, data: { draftId: existing.id, savedAt: new Date().toISOString() } };
    return { ok: false, error: "Speichern fehlgeschlagen." };
  }
}

const submitSchema = z.object({
  draftId: idSchema,
  data: draftDataSchema,
  age: z.number().int(),
  confirmations: z.record(z.string(), z.boolean()),
  website: z.string().max(200).optional(), // Honeypot
});

export async function submitApplicationAction(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<{ applicationId: string; publicId: string }>> {
  const user = await requireUser();
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Daten." };

  const rl = await rateLimit(`submit:${user.id}`, 5, 3600);
  if (!rl.ok) return { ok: false, error: "Zu viele Versuche. Probier es in einer Stunde nochmal." };

  try {
    const res = await submitApplication(user, {
      draftId: parsed.data.draftId,
      data: parsed.data.data as AnswerMap,
      age: parsed.data.age,
      confirmations: parsed.data.confirmations,
      honeypot: parsed.data.website,
    });
    // Bestätigungs-DM + Log-Post direkt nach der Antwort zustellen (Worker = Fallback)
    after(async () => {
      await runOutbox({ ids: res.jobIds }).catch((e) => console.error("[outbox]", e));
      // Höchstzahl erreicht? Dann Stelle automatisch schließen
      const app = await db.application.findUnique({ where: { id: res.applicationId }, select: { positionId: true } });
      if (app) {
        const { closeIfFull } = await import("@/lib/positions/schedule");
        await closeIfFull(db, app.positionId).catch((e) => console.error("[positions]", e));
      }
      // KI-Einordnung (Tags) – optional, blockiert nichts
      const { tagApplication } = await import("@/lib/ai/tagging");
      await tagApplication(res.applicationId).catch((e) => console.error("[ai-tags]", e));
      // KI-Punkte für den Bewertungsbogen (nur Einschätzung)
      const { scoreApplication } = await import("@/lib/ai/scoring");
      await scoreApplication(res.applicationId).catch((e) => console.error("[ai-score]", e));
    });
    revalidatePath("/dashboard");
    return { ok: true, data: { applicationId: res.applicationId, publicId: res.publicId } };
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    console.error("[submit]", err);
    return { ok: false, error: "Beim Absenden ist etwas schiefgelaufen. Dein Entwurf ist gespeichert." };
  }
}

/** Gesprächstermin selbst buchen oder umbuchen. */
export async function bookSlotAction(applicationId: string, slotId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(applicationId).success || !idSchema.safeParse(slotId).success) return { ok: false, error: "Ungültig." };
  const rl = await rateLimit(`slot:${user.id}`, 10, 3600);
  if (!rl.ok) return { ok: false, error: "Zu viele Versuche. Probier es später nochmal." };
  const { bookSlot, SlotError } = await import("@/lib/team/slots");
  try {
    await bookSlot(db, { userId: user.id, applicationId, slotId });
  } catch (e) {
    if (e instanceof SlotError) return { ok: false, error: e.message };
    console.error("[slot]", e);
    return { ok: false, error: "Buchen hat nicht geklappt. Versuch es nochmal." };
  }
  revalidatePath(`/dashboard/${applicationId}`);
  return { ok: true };
}

const feedbackSchema = z.object({ applicationId: idSchema, rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });

/** Freiwillige Rückmeldung zum Bewerbungsablauf (einmal pro Bewerbung, nach der Entscheidung). */
export async function submitFeedbackAction(input: z.input<typeof feedbackSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const p = feedbackSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Bitte 1 bis 5 Sterne wählen." };
  const app = await db.application.findFirst({ where: { id: p.data.applicationId, userId: user.id }, select: { id: true, status: true } });
  if (!app || !["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(app.status)) return { ok: false, error: "Feedback geht erst nach der Entscheidung." };
  try {
    await db.feedback.create({ data: { applicationId: app.id, rating: p.data.rating, comment: p.data.comment || null } });
  } catch {
    return { ok: false, error: "Du hast für diese Bewerbung schon Feedback gegeben. Danke!" };
  }
  await audit("application.feedback", { actorId: user.id, targetType: "application", targetId: app.id, meta: { rating: p.data.rating } });
  revalidatePath(`/dashboard/${app.id}`);
  return { ok: true };
}

/** Bei neuen Stellen per DM benachrichtigen (an/aus). */
export async function setNotifyPositionsAction(on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { notifyNewPositions: on === true } });
  await audit("user.notify", { actorId: user.id, targetType: "user", targetId: user.id, meta: { on: on === true } });
  revalidatePath("/konto");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteDraftAction(draftId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(draftId).success) return { ok: false, error: "Ungültig." };
  await db.application.deleteMany({ where: { id: draftId, userId: user.id, status: "DRAFT" } });
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Bewerbung zurückziehen. Vor der Bearbeitung sofort und ohne Grund; läuft die
 * Bearbeitung schon (in Prüfung, Gespräch oder geclaimt), mit kurzem Grund –
 * das Team sieht den Rückzug im Dashboard und kann noch nachfragen.
 */
export async function withdrawApplicationAction(applicationId: string, reason?: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  const app = await db.application.findFirst({
    where: { id: applicationId, userId: user.id, status: { in: ACTIVE_STATUSES } },
    include: { position: { select: { title: true } } },
  });
  if (!app) return { ok: false, error: "Diese Bewerbung kann nicht mehr zurückgezogen werden." };
  const inReview = isInProcessing(app);
  const why = (reason ?? "").trim().slice(0, 1000);
  if (inReview && why.length < 3) {
    return { ok: false, error: "Deine Bewerbung wird schon bearbeitet – sag dem Team bitte kurz, warum du zurückziehst.", fieldErrors: { reason: "Bitte kurz begründen." } };
  }
  await db.$transaction([
    db.application.update({
      where: { id: app.id },
      data: { status: "WITHDRAWN", decidedAt: new Date(), withdrawnInReview: inReview, withdrawReason: inReview ? why : null },
    }),
    db.statusChange.create({ data: { applicationId: app.id, from: app.status, to: "WITHDRAWN", actorId: user.id, note: inReview ? why : null } }),
  ]);
  const { releaseFutureSlot } = await import("@/lib/team/slots");
  await releaseFutureSlot(db, app.id);
  await audit("application.withdraw", { actorId: user.id, targetType: "application", targetId: app.id, meta: { inReview } });
  const job = await botLog(
    inReview
      ? `↩️ **${app.publicId}** (${app.position.title}) wurde **während der Bearbeitung** zurückgezogen: „${esc(why.slice(0, 300))}“`
      : `↩️ **${app.publicId}** (${app.position.title}) wurde vor der Bearbeitung zurückgezogen`,
    { applicationId: app.id, tone: inReview ? "warn" : "default", url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
  );
  if (job) after(() => runOutbox({ ids: [job] }).catch(() => {}));
  revalidatePath(`/dashboard/${app.id}`);
  return { ok: true };
}

const replySchema = z.object({ applicationId: idSchema, body: z.string().trim().min(2).max(2000) });

/** Antwort des Bewerbers ans Team (im Portal). */
export async function replyToTeamAction(input: z.input<typeof replySchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bitte schreib zwischen 2 und 2000 Zeichen." };
  const rl = await rateLimit(`reply:${user.id}`, 10, 3600);
  if (!rl.ok) return { ok: false, error: "Du hast gerade viele Nachrichten geschickt. Bitte warte etwas." };

  const found = await db.application.findFirst({
    where: { id: parsed.data.applicationId, userId: user.id, status: { in: [...ACTIVE_STATUSES, "WITHDRAWN"] } },
    include: { position: true },
  });
  // Nach einem Rückzug während der Bearbeitung bleibt der Chat für Rückfragen offen
  const app = found && (ACTIVE_STATUSES.includes(found.status) || canFollowUp(found)) ? found : null;
  if (!app) return { ok: false, error: "Auf diese Bewerbung kann nicht mehr geantwortet werden." };

  const message = await db.message.create({
    data: { applicationId: app.id, direction: "APPLICANT_TO_TEAM", authorId: user.id, body: parsed.data.body },
  });
  // Ist gerade niemand vom Team online, antwortet (falls aktiviert) die KI – mit Schutzfiltern
  after(async () => {
    const { maybeAutoReply } = await import("@/lib/ai/autoreply");
    await maybeAutoReply(message.id).catch((e) => console.error("[autoreply]", e));
  });

  const job = await botLog(
    `💬 Neue Antwort von ${esc(user.globalName || user.username)} zu **${app.publicId}** (${app.position.title})`,
    { applicationId: app.id, url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
  );
  if (job) after(() => runOutbox({ ids: [job] }).catch(() => {}));
  revalidatePath(`/dashboard/${app.id}`);
  return { ok: true };
}

export async function markMessagesReadAction(applicationId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  await db.message.updateMany({
    where: { applicationId, application: { userId: user.id }, direction: "TEAM_TO_APPLICANT", readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
