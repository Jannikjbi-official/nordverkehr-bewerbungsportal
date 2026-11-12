"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { saveSettings, settingsSchema, type Settings } from "@/lib/settings";
import type { ActionResult } from "@/app/actions/application";
import { KEY_PATTERN, findSimilarQuestions, suggestKey } from "@/lib/applications/similarity";
import { normalizeLabel } from "@/lib/setup/questions";

const id = z.string().min(10).max(40);

/** Stellenaufruf in Discord nach der Antwort aktualisieren (falls schon gepostet). */
function refreshJobsAfter() {
  after(async () => {
    const { refreshJobsPostQuietly } = await import("@/lib/discord/jobs-post");
    await refreshJobsPostQuietly(db);
  });
}
const QTYPE = z.enum(["SHORT_TEXT", "LONG_TEXT", "NUMBER", "SELECT", "MULTI_SELECT", "CHECKBOX", "URL", "FILE", "SCENARIO"]);
const snowflake = z.string().regex(/^\d{15,25}$/, "Ungültige Rollen-ID").nullable();

// ─── Einstellungen ────────────────────────────────────────────

export async function saveSettingsAction(patch: Record<string, unknown>): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const parsed = settingsSchema.partial().safeParse(patch);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Ungültiger Wert bei „${String(first.path[0])}“: ${first.message}` };
  }
  // Nur explizit übergebene Schlüssel speichern (partial() füllt keine Defaults ein)
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in patch)) as Partial<Settings>;
  await saveSettings(data, user.id);
  await audit("settings.update", { actorId: user.id, meta: { keys: Object.keys(data) } });
  revalidatePath("/team/einstellungen");
  return { ok: true };
}

// ─── Positionen ───────────────────────────────────────────────

const positionSchema = z.object({
  id: id.optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "Slug: nur a–z, 0–9 und Bindestriche"),
  title: z.string().trim().min(2).max(60),
  tagline: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(2000),
  tasks: z.array(z.string().trim().min(1).max(200)).max(15),
  requirements: z.array(z.string().trim().min(1).max(200)).max(15),
  icon: z.string().max(20),
  status: z.enum(["OPEN", "CLOSED", "HIDDEN"]),
  minAge: z.number().int().min(12).max(99).nullable(),
  cooldownDays: z.number().int().min(0).max(365).nullable(),
  acceptRoleId: snowflake,
});

export async function savePositionAction(input: z.input<typeof positionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = positionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id: pid, ...data } = p.data;
  const clash = await db.position.findFirst({ where: { slug: data.slug, NOT: pid ? { id: pid } : undefined } });
  if (clash) return { ok: false, error: "Dieser Slug ist schon vergeben." };
  let saved;
  if (pid) {
    saved = await db.position.update({ where: { id: pid }, data });
    await audit("position.update", { actorId: user.id, targetType: "position", targetId: pid });
  } else {
    const type = await db.applicationType.findUniqueOrThrow({ where: { key: "team" } });
    const max = await db.position.aggregate({ _max: { sortOrder: true } });
    saved = await db.position.create({ data: { ...data, typeId: type.id, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    await audit("position.create", { actorId: user.id, targetType: "position", targetId: saved.id });
  }
  revalidatePath("/team/positionen");
  revalidatePath("/");
  refreshJobsAfter();
  return { ok: true, data: { id: saved.id } };
}

export async function setPositionStatusAction(positionId: string, status: "OPEN" | "CLOSED" | "HIDDEN"): Promise<ActionResult> {
  const { user } = await requireAdmin();
  if (!["OPEN", "CLOSED", "HIDDEN"].includes(status)) return { ok: false, error: "Ungültig." };
  await db.position.update({ where: { id: positionId }, data: { status } });
  await audit("position.status", { actorId: user.id, targetType: "position", targetId: positionId, meta: { status } });
  revalidatePath("/team/positionen");
  revalidatePath("/");
  refreshJobsAfter();
  return { ok: true };
}

export async function deletePositionAction(positionId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const count = await db.application.count({ where: { positionId } });
  if (count > 0) return { ok: false, error: "Es gibt Bewerbungen auf diese Position. Setz sie stattdessen auf „Versteckt“." };
  await db.position.delete({ where: { id: positionId } });
  await audit("position.delete", { actorId: user.id, targetType: "position", targetId: positionId });
  revalidatePath("/team/positionen");
  refreshJobsAfter();
  return { ok: true };
}

export async function reorderPositionsAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const p = z.array(id).max(100).safeParse(ids);
  if (!p.success) return { ok: false, error: "Ungültig." };
  await db.$transaction(p.data.map((pid, i) => db.position.update({ where: { id: pid }, data: { sortOrder: i } })));
  revalidatePath("/team/positionen");
  revalidatePath("/");
  return { ok: true };
}

// ─── Formular-Schritte & Fragen ───────────────────────────────

const sectionSchema = z.object({
  id: id.optional(),
  positionId: id.nullable(),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).nullable(),
});

/** Hängt _2, _3 … an, bis der Key frei ist. */
async function uniqueKey(base: string, taken: (k: string) => Promise<boolean>) {
  let key = base;
  for (let i = 2; await taken(key); i++) key = `${base}_${i}`;
  return key;
}

export async function saveSectionAction(input: z.input<typeof sectionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = sectionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const type = await db.applicationType.findUniqueOrThrow({ where: { key: "team" } });
  let saved;
  if (p.data.id) {
    saved = await db.formSection.update({ where: { id: p.data.id }, data: { title: p.data.title, description: p.data.description } });
  } else {
    const max = await db.formSection.aggregate({ _max: { sortOrder: true }, where: { positionId: p.data.positionId } });
    const pos = p.data.positionId ? await db.position.findUnique({ where: { id: p.data.positionId }, select: { slug: true } }) : null;
    const base = normalizeLabel(p.data.title).replace(/ /g, "_").slice(0, 40) || "abschnitt";
    const key = await uniqueKey(pos ? `${pos.slug}.${base}` : base, async (k) => !!(await db.formSection.findFirst({ where: { key: k }, select: { id: true } })));
    saved = await db.formSection.create({
      data: { key, typeId: type.id, positionId: p.data.positionId, title: p.data.title, description: p.data.description, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  }
  await audit("form.update", { actorId: user.id, targetType: "section", targetId: saved.id });
  revalidatePath("/team/positionen", "layout");
  return { ok: true, data: { id: saved.id } };
}

export async function deleteSectionAction(sectionId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  // Antworten bleiben erhalten (Snapshot); Fragen werden mit gelöscht
  await db.formSection.delete({ where: { id: sectionId } }).catch(() => null);
  await audit("form.update", { actorId: user.id, targetType: "section", targetId: sectionId, meta: { deleted: true } });
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}

export async function reorderSectionsAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const p = z.array(id).max(100).safeParse(ids);
  if (!p.success) return { ok: false, error: "Ungültig." };
  await db.$transaction(p.data.map((sid, i) => db.formSection.update({ where: { id: sid }, data: { sortOrder: i } })));
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}

const questionSchema = z
  .object({
    id: id.optional(),
    sectionId: id,
    /** Eindeutiger Key; leer = automatisch aus dem Fragetext */
    key: z
      .string()
      .trim()
      .max(60)
      .refine((k) => k === "" || KEY_PATTERN.test(k), "Key: nur a–z, 0–9, _ und höchstens ein Punkt (z. B. support.tickets).")
      .nullish(),
    /** Admin hat die Ähnlichkeitswarnung bestätigt */
    confirmSimilar: z.boolean().optional(),
    label: z.string().trim().min(3).max(300),
    helpText: z.string().trim().max(400).nullable(),
    placeholder: z.string().trim().max(120).nullable(),
    type: QTYPE,
    required: z.boolean(),
    minLength: z.number().int().min(0).max(10000).nullable(),
    maxLength: z.number().int().min(1).max(10000).nullable(),
    minValue: z.number().int().nullable(),
    maxValue: z.number().int().nullable(),
    options: z.array(z.string().trim().min(1).max(120)).max(30),
  })
  .refine((q) => !["SELECT", "MULTI_SELECT"].includes(q.type) || q.options.length >= 2, "Auswahlfragen brauchen mindestens 2 Optionen.")
  .refine((q) => q.minLength === null || q.maxLength === null || q.minLength <= q.maxLength, "Mindestlänge ist größer als Maximallänge.");

export async function saveQuestionAction(input: z.input<typeof questionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = questionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id: qid, key: rawKey, confirmSimilar, ...data } = p.data;
  const section = await db.formSection.findUnique({ where: { id: data.sectionId }, select: { position: { select: { slug: true } } } });
  if (!section) return { ok: false, error: "Schritt nicht gefunden." };
  const keyTaken = async (k: string) => !!(await db.question.findFirst({ where: { key: k, ...(qid ? { NOT: { id: qid } } : {}) }, select: { id: true } }));

  let key = rawKey || null;
  if (key && (await keyTaken(key))) return { ok: false, error: `Der Key „${key}“ ist schon vergeben.`, fieldErrors: { key: "vergeben" } };
  if (!key) {
    const current = qid ? await db.question.findUnique({ where: { id: qid }, select: { key: true } }) : null;
    key = current?.key ?? (await uniqueKey(suggestKey(data.label, section.position?.slug), keyTaken));
  }

  // Doppelte Fragen vermeiden: gleicher/ähnlicher Text an anderer Stelle → erst nach Bestätigung speichern
  if (!confirmSimilar) {
    const existing = await db.question.findMany({
      where: { archived: false, section: { NOT: { archived: true } } },
      select: { id: true, key: true, label: true, section: { select: { title: true, position: { select: { title: true } } } } },
    });
    const hits = findSimilarQuestions(
      { id: qid, key, label: data.label },
      existing.map((q) => ({ id: q.id, key: q.key, label: q.label, where: `${q.section.position?.title ?? "Allgemein"} › ${q.section.title}` })),
    );
    if (hits.length) {
      const h = hits[0];
      return { ok: false, error: `Ähnliche Frage gibt es schon (${h.where}): „${h.label}“`, fieldErrors: { similar: h.id } };
    }
  }

  let saved;
  if (qid) saved = await db.question.update({ where: { id: qid }, data: { ...data, key } });
  else {
    const max = await db.question.aggregate({ _max: { sortOrder: true }, where: { sectionId: data.sectionId } });
    saved = await db.question.create({ data: { ...data, key, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }
  await audit("form.update", { actorId: user.id, targetType: "question", targetId: saved.id });
  revalidatePath("/team/positionen", "layout");
  return { ok: true, data: { id: saved.id } };
}

/** Fragen werden archiviert statt gelöscht – Entwürfe & Auswertungen bleiben konsistent. */
export async function archiveQuestionAction(questionId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  await db.question.update({ where: { id: questionId }, data: { archived: true } }).catch(() => null);
  await audit("form.update", { actorId: user.id, targetType: "question", targetId: questionId, meta: { archived: true } });
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}

export async function reorderQuestionsAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const p = z.array(id).max(200).safeParse(ids);
  if (!p.success) return { ok: false, error: "Ungültig." };
  await db.$transaction(p.data.map((qid, i) => db.question.update({ where: { id: qid }, data: { sortOrder: i } })));
  revalidatePath("/team/positionen", "layout");
  return { ok: true };
}

// ─── Discord-Diagnose ─────────────────────────────────────────

const CHANNEL_KIND = z.enum(["applications", "botLog", "changelog", "summary", "lead"]);
const CHANNEL_LABEL = { applications: "Bewerbungs-Kanal", botLog: "Bot-Log-Kanal", changelog: "Changelog-Kanal", summary: "Teamchat", lead: "Leitungs-Chat" } as const;

/** Testnachricht direkt (ohne Warteschlange) senden – zeigt den genauen Discord-Fehler. */
export async function discordTestAction(kind: z.input<typeof CHANNEL_KIND>): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  const k = CHANNEL_KIND.safeParse(kind);
  if (!k.success) return { ok: false, error: "Ungültig." };
  const { getSettings } = await import("@/lib/settings");
  const s = await getSettings();
  const channelId = {
    applications: s["discord.applicationsChannelId"],
    botLog: s["discord.botLogChannelId"] || process.env.DISCORD_LOG_CHANNEL_ID,
    changelog: s["discord.changelogChannelId"],
    summary: s["discord.summaryChannelId"],
    lead: s["discord.leadChannelId"],
  }[k.data];
  if (!channelId) return { ok: false, error: `Für den ${CHANNEL_LABEL[k.data]} ist keine Kanal-ID eingetragen.` };
  try {
    const { getDiscordApi } = await import("@/lib/discord/client");
    const { buildBotLogMessage } = await import("@/lib/messages/embed");
    await getDiscordApi().postMessage(
      channelId,
      buildBotLogMessage(`🧪 Testnachricht für den **${CHANNEL_LABEL[k.data]}** – ausgelöst von ${user.globalName || user.username} im Bewerbungsportal.`),
    );
    return { ok: true, data: { message: `Gesendet an ${channelId}.` } };
  } catch (err) {
    return { ok: false, error: `Discord: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Alle Changelog-Posts des Bots im Kanal löschen; der nächste Cron postet die veröffentlichten Versionen neu. */
export async function deleteChangelogPostsAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { deleteChangelogPosts } = await import("@/lib/discord/changelog-post");
  const r = await deleteChangelogPosts(db);
  return { ok: true, data: { message: `${r.deleted} Changelog-Post(s) gelöscht. Der nächste Post kommt um 0 Uhr.` } };
}

/** Veröffentlichte, noch nicht gepostete Versionen sofort posten (sonst übernimmt das der Cron um 0 Uhr). */
export async function postChangelogNowAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { postNewChangelogEntries } = await import("@/lib/discord/changelog-post");
  const ids = await postNewChangelogEntries(db);
  if (!ids.length) return { ok: true, data: { message: "Nichts zu posten – der laufende Tag wird erst um 0 Uhr veröffentlicht." } };
  const jobs = await db.outboxJob.findMany({ where: { id: { in: ids } }, select: { status: true, lastError: true } });
  const errors = jobs.map((j) => j.lastError).filter(Boolean);
  if (errors.length) return { ok: false, error: `Fehler: ${errors.join(" · ")}` };
  return { ok: true, data: { message: `${ids.length} Version(en) gepostet.` } };
}

/** Team-Übersicht sofort posten (auch wenn heute schon gepostet wurde oder nichts ansteht). */
export async function postSummaryNowAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { postDailySummary } = await import("@/lib/team/daily-summary");
  const r = await postDailySummary(db, { force: true });
  if (!r.posted) return { ok: false, error: r.reason };
  const jobs = await db.outboxJob.findMany({ where: { id: { in: r.jobIds } }, select: { lastError: true } });
  const errors = jobs.map((j) => j.lastError).filter(Boolean);
  if (errors.length) return { ok: false, error: `Fehler: ${errors.join(" · ")}` };
  return {
    ok: true,
    data: { message: `Übersicht gepostet${r.escalated ? " – plus Hinweis an die Leitung" : ""}.` },
  };
}

/** Ausstehende Zustellungen jetzt senden. */
export async function flushOutboxAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { runOutbox, releaseStuckJobs } = await import("@/lib/discord/outbox-db");
  await releaseStuckJobs(2);
  const n = await runOutbox({ limit: 25 });
  revalidatePath("/team/einstellungen");
  return { ok: true, data: { message: n ? `${n} Zustellung(en) verarbeitet.` : "Nichts fällig." } };
}

// ─── Daten zurücksetzen ───────────────────────────────────────

const resetSchema = z.object({ confirm: z.string(), resetNumbering: z.boolean() });

/** Löscht ALLE Bewerbungen (siehe lib/team/reset.ts). Nur Admins, mit Bestätigungssatz. */
export async function resetApplicationsAction(input: z.input<typeof resetSchema>): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  const p = resetSchema.safeParse(input);
  const { RESET_CONFIRM_PHRASE, resetAllApplications } = await import("@/lib/team/reset");
  if (!p.success || p.data.confirm.trim() !== RESET_CONFIRM_PHRASE) {
    return { ok: false, error: `Bitte genau „${RESET_CONFIRM_PHRASE}“ eintippen.` };
  }
  const { rateLimit } = await import("@/lib/rate-limit");
  const rl = await rateLimit(`reset:${user.id}`, 3, 3600);
  if (!rl.ok) return { ok: false, error: "Zu viele Versuche. Bitte später erneut." };

  try {
    const counts = await resetAllApplications(db, { resetNumbering: p.data.resetNumbering });
    await audit("data.reset", { actorId: user.id, meta: { ...counts, resetNumbering: p.data.resetNumbering } });
    const { botLog, esc } = await import("@/lib/discord/botlog");
    const job = await botLog(
      `🧹 ${esc(user.globalName || user.username)} hat **alle Bewerbungen gelöscht** (${counts.applications} Bewerbungen, ${counts.messages} Nachrichten)` +
        (p.data.resetNumbering ? " – Nummerierung beginnt wieder bei 1." : "."),
      { tone: "warn" },
    );
    if (job) {
      const { runOutbox } = await import("@/lib/discord/outbox-db");
      await runOutbox({ ids: [job] }).catch(() => {});
    }
    revalidatePath("/team", "layout");
    return { ok: true, data: { message: `${counts.applications} Bewerbungen gelöscht (dazu ${counts.answers} Antworten, ${counts.messages} Nachrichten, ${counts.uploads} Bilder).` } };
  } catch (err) {
    console.error("[reset]", err);
    return { ok: false, error: "Zurücksetzen fehlgeschlagen – es wurde nichts gelöscht." };
  }
}

// ─── Stellenaufruf ────────────────────────────────────────────

/** Stellenaufruf posten ("new": neu unten im Kanal) oder vorhandenen aktualisieren ("update"). */
export async function publishJobsPostAction(mode: "new" | "update"): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  if (!["new", "update"].includes(mode)) return { ok: false, error: "Ungültig." };
  try {
    const { publishJobsPost } = await import("@/lib/discord/jobs-post");
    const r = await publishJobsPost(db, { mode, createIfMissing: true });
    if (!r.ok) return { ok: false, error: `Discord: ${r.error}` };
    await audit("settings.update", { actorId: user.id, meta: { jobsPost: r.action } });
    revalidatePath("/team/positionen");
    return { ok: true, data: { message: r.action === "updated" ? "Stellenaufruf aktualisiert." : "Stellenaufruf gepostet." } };
  } catch (err) {
    return { ok: false, error: `Discord: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Einzelaufruf „Wir suchen <Stelle>!“ posten oder aktualisieren. */
export async function publishSpotlightAction(slug: string, mode: "new" | "update"): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !["new", "update"].includes(mode)) return { ok: false, error: "Ungültig." };
  try {
    const { publishSpotlight } = await import("@/lib/discord/jobs-post");
    const r = await publishSpotlight(db, slug, { mode, createIfMissing: true });
    if (!r.ok) return { ok: false, error: r.error };
    await audit("settings.update", { actorId: user.id, meta: { spotlight: slug, action: r.action } });
    revalidatePath("/team/positionen");
    return { ok: true, data: { message: r.action === "updated" ? "Einzelaufruf aktualisiert." : "Einzelaufruf gepostet." } };
  } catch (err) {
    return { ok: false, error: `Discord: ${err instanceof Error ? err.message : String(err)}` };
  }
}
