"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { publicEnv, env } from "@/lib/env";
import { requireUser } from "@/lib/auth/session";
import { draftDataSchema, type AnswerMap } from "@/lib/applications/form";
import { getEligibility, submitApplication, UserFacingError } from "@/lib/applications/service";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { runOutbox, enqueue } from "@/lib/discord/outbox-db";
import { getSettings } from "@/lib/settings";
import { ACTIVE_STATUSES } from "@/lib/applications/status";
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
      // KI-Einordnung (Tags) – optional, blockiert nichts
      const { tagApplication } = await import("@/lib/ai/tagging");
      await tagApplication(res.applicationId).catch((e) => console.error("[ai-tags]", e));
    });
    revalidatePath("/dashboard");
    return { ok: true, data: { applicationId: res.applicationId, publicId: res.publicId } };
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    console.error("[submit]", err);
    return { ok: false, error: "Beim Absenden ist etwas schiefgelaufen. Dein Entwurf ist gespeichert." };
  }
}

export async function deleteDraftAction(draftId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(draftId).success) return { ok: false, error: "Ungültig." };
  await db.application.deleteMany({ where: { id: draftId, userId: user.id, status: "DRAFT" } });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function withdrawApplicationAction(applicationId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(applicationId).success) return { ok: false, error: "Ungültig." };
  const app = await db.application.findFirst({ where: { id: applicationId, userId: user.id, status: { in: ACTIVE_STATUSES } } });
  if (!app) return { ok: false, error: "Diese Bewerbung kann nicht mehr zurückgezogen werden." };
  await db.$transaction([
    db.application.update({ where: { id: app.id }, data: { status: "WITHDRAWN", decidedAt: new Date() } }),
    db.statusChange.create({ data: { applicationId: app.id, from: app.status, to: "WITHDRAWN", actorId: user.id } }),
  ]);
  await audit("application.withdraw", { actorId: user.id, targetType: "application", targetId: app.id });
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

  const app = await db.application.findFirst({
    where: { id: parsed.data.applicationId, userId: user.id, status: { in: ACTIVE_STATUSES } },
    include: { position: true },
  });
  if (!app) return { ok: false, error: "Auf diese Bewerbung kann nicht mehr geantwortet werden." };

  const message = await db.message.create({
    data: { applicationId: app.id, direction: "APPLICANT_TO_TEAM", authorId: user.id, body: parsed.data.body },
  });
  // Ist gerade niemand vom Team online, antwortet (falls aktiviert) die KI – mit Schutzfiltern
  after(async () => {
    const { maybeAutoReply } = await import("@/lib/ai/autoreply");
    await maybeAutoReply(message.id).catch((e) => console.error("[autoreply]", e));
  });

  const settings = await getSettings();
  const channelId = env().DISCORD_LOG_CHANNEL_ID;
  if (settings["discord.logChannelEnabled"] && channelId) {
    const job = await enqueue(
      {
        type: "CHANNEL_MESSAGE",
        channelId,
        message: {
          content: `💬 Neue Antwort zu **${app.publicId}** (${app.position.title}) – ${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
          allowed_mentions: { parse: [] },
        },
      },
      { applicationId: app.id },
    );
    after(() => runOutbox({ ids: [job.id] }).catch(() => {}));
  }
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
