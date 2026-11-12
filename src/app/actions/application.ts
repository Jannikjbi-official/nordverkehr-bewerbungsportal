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
import { deliverNow, runOutbox } from "@/lib/discord/outbox-db";
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

const NOT_IN_GUILD = "Du bist nicht auf unserem Discord-Server. Tritt erst bei – dann kannst du deine Bewerbung absenden. Dein Entwurf bleibt gespeichert.";

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

  // Nur wer auf dem Nordverkehr-Discord ist, darf absenden (frisch geprüft).
  // Ist Discord gerade nicht erreichbar, blockieren wir nicht.
  const { getAccess } = await import("@/lib/auth/user-access");
  const access = await getAccess(user, { force: true });
  if (!access.inGuild && access.source !== "error" && access.source !== "unconfigured") {
    return { ok: false, error: NOT_IN_GUILD, fieldErrors: { discord: "not_in_guild" } };
  }

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
      // Faire Verteilung: automatisch zuteilen (falls eingeschaltet)
      const { autoAssign } = await import("@/lib/team/assign");
      const assigned = await autoAssign(db, res.applicationId).catch((e) => (console.error("[assign]", e), null));
      if (assigned?.jobId) await runOutbox({ ids: [assigned.jobId] }).catch(() => {});
      // KI-Punkte gleich reservieren – sonst hält die Team-Seite die Bewerbung während
      // des Taggings für „unbewertet“ und startet eine zweite, parallele Bewertung
      const { claimForScoring, scoreClaimed } = await import("@/lib/ai/scoring");
      const claimedAt = await claimForScoring(res.applicationId).catch(() => null);
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
      if (claimedAt) await scoreClaimed(res.applicationId, claimedAt);
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

/** Persönliche Morgen-DM (nur Team) an/aus. */
export async function setDigestOptOutAction(optOut: boolean): Promise<ActionResult> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { digestOptOut: optOut === true } });
  await audit("user.digest", { actorId: user.id, targetType: "user", targetId: user.id, meta: { optOut: optOut === true } });
  revalidatePath("/konto");
  return { ok: true };
}

/** Discord-Mitgliedschaft neu prüfen (Knopf „Ich bin beigetreten“ im Formular). */
export async function checkGuildAction(): Promise<ActionResult<{ inGuild: boolean }>> {
  const user = await requireUser();
  const rl = await rateLimit(`guildcheck:${user.id}`, 20, 600);
  if (!rl.ok) return { ok: false, error: "Zu viele Versuche. Warte kurz." };
  const { getAccess } = await import("@/lib/auth/user-access");
  const access = await getAccess(user, { force: true });
  return { ok: true, data: { inGuild: access.inGuild || access.source === "error" || access.source === "unconfigured" } };
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
  const { syncInterviewLater } = await import("@/lib/team/interview-sync");
  await syncInterviewLater(app.id);
  const { postToThread } = await import("@/lib/discord/threads");
  const threadJob = await postToThread(app, "↩️ **Zurückgezogen** vom Bewerber. Thread wird archiviert.", { archive: true, kind: "final" });
  if (threadJob) await deliverNow([threadJob]);
  await audit("application.withdraw", { actorId: user.id, targetType: "application", targetId: app.id, meta: { inReview } });
  const job = await botLog(
    inReview
      ? `↩️ **${app.publicId}** (${app.position.title}) wurde **während der Bearbeitung** zurückgezogen: „${esc(why.slice(0, 300))}“`
      : `↩️ **${app.publicId}** (${app.position.title}) wurde vor der Bearbeitung zurückgezogen`,
    { applicationId: app.id, tone: inReview ? "warn" : "default", url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
  );
  if (job) await deliverNow([job]);
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
  // Offene Rückfrage ist beantwortet → Frist endet
  if (app.awaitingReplySince) await db.application.update({ where: { id: app.id }, data: { awaitingReplySince: null, awaitingRemindedAt: null } });
  // Ist gerade niemand vom Team online, antwortet (falls aktiviert) die KI – mit Schutzfiltern
  after(async () => {
    const { maybeAutoReply } = await import("@/lib/ai/autoreply");
    await maybeAutoReply(message.id).catch((e) => console.error("[autoreply]", e));
  });

  const job = await botLog(
    `💬 Neue Antwort von ${esc(user.globalName || user.username)} zu **${app.publicId}** (${app.position.title})`,
    { applicationId: app.id, url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}` },
  );
  if (job) await deliverNow([job]);
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

const amendSchema = z.object({
  applicationId: idSchema,
  answers: z.record(idSchema, z.string().max(4000)).refine((r) => Object.keys(r).length <= 60),
});

/**
 * Antworten nachreichen: nur solange niemand die Bewerbung angesehen oder übernommen hat.
 * Ändert nur Textantworten, prüft die Längen der Frage, setzt KI-Einordnung/-Punkte zurück
 * (werden neu berechnet) und berechnet die automatischen Hinweise neu.
 */
export async function amendAnswersAction(input: z.input<typeof amendSchema>): Promise<ActionResult<{ changed: number }>> {
  const user = await requireUser();
  const p = amendSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Ungültige Eingabe." };
  const rl = await rateLimit(`amend:${user.id}`, 20, 3600);
  if (!rl.ok) return { ok: false, error: "Zu viele Änderungen in kurzer Zeit." };
  const { getSettings } = await import("@/lib/settings");
  const settings = await getSettings();
  if (!settings["applications.amendEnabled"]) return { ok: false, error: "Nachreichen ist gerade ausgeschaltet." };
  const app = await db.application.findFirst({
    where: { id: p.data.applicationId, userId: user.id },
    include: { answers: true, position: { select: { title: true } } },
  });
  const { AMENDABLE_TYPES, canAmend } = await import("@/lib/applications/queue");
  if (!app || !canAmend(app)) return { ok: false, error: "Das Team bearbeitet deine Bewerbung schon – ergänzen kannst du jetzt nur noch per Nachricht." };

  const editable = app.answers.filter((a) => (AMENDABLE_TYPES as readonly string[]).includes(a.type));
  const questions = await db.question.findMany({ where: { id: { in: editable.map((a) => a.questionId).filter((x): x is string => !!x) } } });
  const { validateAnswer, DEFAULT_MAX_LENGTH } = await import("@/lib/applications/form");
  const changes: { id: string; value: string }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const a of editable) {
    const next = p.data.answers[a.id];
    if (next === undefined) continue;
    const value = next.trim();
    if (value === String(a.value ?? "").trim()) continue;
    const q = questions.find((x) => x.id === a.questionId);
    const err = validateAnswer(
      {
        id: a.id,
        key: null,
        label: a.label,
        helpText: null,
        placeholder: null,
        type: a.type,
        required: q?.required ?? true,
        minLength: q?.minLength ?? null,
        maxLength: q?.maxLength ?? DEFAULT_MAX_LENGTH[a.type] ?? null,
        minValue: null,
        maxValue: null,
        options: [],
      },
      value,
    );
    if (err) fieldErrors[a.id] = err;
    else changes.push({ id: a.id, value });
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Bitte prüf die markierten Antworten.", fieldErrors };
  if (!changes.length) return { ok: true, data: { changed: 0 } };

  // Hinweise neu berechnen (Texte haben sich geändert)
  const { computeFlags } = await import("@/lib/applications/flags");
  const texts = app.answers
    .filter((a) => a.type === "LONG_TEXT" || a.type === "SCENARIO")
    .map((a) => ({ label: a.label, value: changes.find((c) => c.id === a.id)?.value ?? String(a.value ?? ""), minExpected: questions.find((q) => q.id === a.questionId)?.minLength ?? 0 }));
  const others = await db.application.findMany({
    where: { positionId: app.positionId, submittedAt: { not: null }, NOT: { userId: user.id } },
    orderBy: { submittedAt: "desc" },
    take: 150,
    select: { publicId: true, answers: { where: { type: { in: ["LONG_TEXT", "SCENARIO"] } }, select: { value: true } } },
  });
  const flags = computeFlags({
    textAnswers: texts,
    discordCreatedAt: user.discordCreatedAt,
    now: new Date(),
    minAccountDays: settings["applications.minDiscordAccountDays"],
    names: [user.globalName, user.username],
    otherApplications: others.map((o) => ({ publicId: o.publicId ?? "?", text: o.answers.map((x) => (typeof x.value === "string" ? x.value : "")).join(" \n ") })),
  });

  // Bedingt: wurde die Bewerbung gerade geöffnet/übernommen, gilt die Änderung nicht mehr
  const ok = await db.$transaction(async (tx) => {
    const res = await tx.application.updateMany({
      where: { id: app.id, status: "SUBMITTED", OR: [{ claimedById: null }, { claimedById: { isSet: false } }], AND: [{ OR: [{ firstReviewedAt: null }, { firstReviewedAt: { isSet: false } }] }] },
      data: { amendedAt: new Date(), flags: flags as unknown as Prisma.InputJsonValue, aiTags: [], aiTaggedAt: null, aiRating: null, aiRatedAt: null, aiSummary: null, aiSummaryAt: null },
    });
    if (!res.count) return false;
    for (const c of changes) await tx.answer.update({ where: { id: c.id }, data: { value: c.value } });
    return true;
  });
  if (!ok) return { ok: false, error: "Das Team hat deine Bewerbung gerade übernommen – ergänzen kannst du jetzt nur noch per Nachricht." };

  await audit("application.amend", { actorId: user.id, targetType: "application", targetId: app.id, meta: { changed: changes.length } });
  const job = await botLog(`✏️ ${esc(user.globalName || user.username)} hat bei **${app.publicId}** (${app.position.title}) ${changes.length} Antwort(en) nachgereicht`, {
    applicationId: app.id,
    url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
  });
  if (job) await deliverNow([job]);
  // KI-Einordnung neu anstoßen (Punkte berechnet die Team-Ansicht beim Öffnen)
  after(async () => {
    const { tagApplication } = await import("@/lib/ai/tagging");
    await tagApplication(app.id).catch((e) => console.error("[ai-tags]", e));
  });
  revalidatePath(`/dashboard/${app.id}`);
  return { ok: true, data: { changed: changes.length } };
}

/** Teammitglieder: geheimen Kalender-Link erzeugen (alter Link wird ungültig). */
export async function createCalendarTokenAction(): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  const me = await db.user.findUnique({ where: { id: user.id }, select: { isTeam: true } });
  if (!me?.isTeam) return { ok: false, error: "Nur für das Team." };
  const { newCalendarToken } = await import("@/lib/team/calendar");
  const token = newCalendarToken();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: token } });
  await audit("user.calendar", { actorId: user.id, targetType: "user", targetId: user.id });
  revalidatePath("/konto");
  return { ok: true, data: { url: `${publicEnv.appUrl}/api/calendar/${token}.ics` } };
}
