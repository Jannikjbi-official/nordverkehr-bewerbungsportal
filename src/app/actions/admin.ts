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
const QTYPE = z.enum(["SHORT_TEXT", "LONG_TEXT", "NUMBER", "SELECT", "MULTI_SELECT", "CHECKBOX", "URL", "FILE", "SCENARIO", "QUIZ"]);
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
  revalidatePath("/team/admin", "layout");
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
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  maxApplications: z.number().int().min(1).max(10000).nullable().optional(),
  quizMinScore: z.number().int().min(0).max(100).nullable().optional(),
  interviewQuestions: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  minProVotes: z.number().int().min(1).max(20).nullable().optional(),
  requireAdminApproval: z.boolean().optional(),
  teamRoleIds: z.array(z.string().regex(/^\d{15,25}$/, "Ungültige Rollen-ID")).max(10).optional(),
  ratingCriteria: z.array(z.string().trim().min(1).max(200)).max(10, "Höchstens 10 Kriterien.").optional(),
  seats: z.number().int().min(0).max(1000).nullable().optional(),
  nickPrefix: z.string().trim().max(12, "Präfix höchstens 12 Zeichen.").nullable().optional(),
});

/** Stelle wurde (wieder) geöffnet → Vorgemerkte per DM informieren (nach der Antwort). */
function notifyOpenedAfter(position: { id: string; title: string; slug: string }) {
  after(async () => {
    const { notifyPositionOpened } = await import("@/lib/positions/schedule");
    await notifyPositionOpened(db, position).catch((e) => console.error("[positions] Benachrichtigung", e));
  });
}

export async function savePositionAction(input: z.input<typeof positionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = positionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id: pid, ...rest } = p.data;
  const data = { ...rest, opensAt: rest.opensAt ?? null, closesAt: rest.closesAt ?? null, maxApplications: rest.maxApplications ?? null, quizMinScore: rest.quizMinScore ?? null, interviewQuestions: rest.interviewQuestions ?? [], minProVotes: rest.minProVotes ?? null, requireAdminApproval: rest.requireAdminApproval ?? false, teamRoleIds: rest.teamRoleIds ?? [], ratingCriteria: rest.ratingCriteria ?? [], seats: rest.seats ?? null, nickPrefix: rest.nickPrefix || null };
  if (data.opensAt && data.closesAt && data.opensAt >= data.closesAt) return { ok: false, error: "Das Enddatum muss nach dem Startdatum liegen." };
  if (data.status === "OPEN" && data.closesAt && data.closesAt <= new Date()) {
    return { ok: false, error: "Das Enddatum liegt in der Vergangenheit – die Stelle würde sofort wieder geschlossen. Datum leeren oder anpassen." };
  }
  if (data.status === "OPEN" && data.seats === 0) return { ok: false, error: "Keine freien Plätze mehr – erst „Freie Plätze“ erhöhen oder leeren." };
  // Offen + Startdatum ergibt keinen Sinn (würde nach einem späteren Schließen ungewollt wieder öffnen)
  if (data.status === "OPEN") data.opensAt = null;
  const before = pid ? await db.position.findUnique({ where: { id: pid }, select: { status: true } }) : null;
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
  if (saved.status === "OPEN" && before && before.status !== "OPEN") notifyOpenedAfter(saved);
  return { ok: true, data: { id: saved.id } };
}

export async function setPositionStatusAction(positionId: string, status: "OPEN" | "CLOSED" | "HIDDEN"): Promise<ActionResult> {
  const { user } = await requireAdmin();
  if (!["OPEN", "CLOSED", "HIDDEN"].includes(status)) return { ok: false, error: "Ungültig." };
  const before = await db.position.findUnique({ where: { id: positionId }, select: { status: true, opensAt: true, closesAt: true, seats: true } });
  if (!before) return { ok: false, error: "Stelle nicht gefunden." };
  if (status === "OPEN" && before.seats === 0) return { ok: false, error: "Keine freien Plätze mehr – erst in der Stelle „Freie Plätze“ erhöhen." };
  const { clearStaleSchedule } = await import("@/lib/positions/schedule");
  const saved = await db.position.update({ where: { id: positionId }, data: { status, ...clearStaleSchedule(status, before, new Date()) } });
  if (status === "OPEN" && before.status !== "OPEN") notifyOpenedAfter(saved);
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
    /** Nur QUIZ: richtige Option */
    correctOption: z.string().trim().max(120).nullish(),
  })
  .refine((q) => !["SELECT", "MULTI_SELECT", "QUIZ"].includes(q.type) || q.options.length >= 2, "Auswahlfragen brauchen mindestens 2 Optionen.")
  .refine((q) => q.type !== "QUIZ" || (!!q.correctOption && q.options.includes(q.correctOption)), "Quizfrage: bitte die richtige Antwort auswählen.")
  .refine((q) => q.minLength === null || q.maxLength === null || q.minLength <= q.maxLength, "Mindestlänge ist größer als Maximallänge.");

export async function saveQuestionAction(input: z.input<typeof questionSchema>): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireAdmin();
  const p = questionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id: qid, key: rawKey, confirmSimilar, correctOption, ...rest } = p.data;
  // Lösung nur bei Quizfragen speichern (sonst leeren)
  const data = { ...rest, correctOption: rest.type === "QUIZ" ? (correctOption ?? null) : null };
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

/** Tagesaufgaben sofort ausführen (sonst beim ersten Team-Aufruf ab 8 Uhr, siehe lib/due-tasks.ts). */
export async function runDailyTasksAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { runDailyTasksNow } = await import("@/lib/due-tasks");
  const r = await runDailyTasksNow();
  revalidatePath("/team", "layout");
  const failed = r.steps.filter((s) => !s.ok).map((s) => s.name);
  const text = `${r.steps.length - failed.length}/${r.steps.length} Aufgaben erledigt, ${r.delivered} Nachricht(en) zugestellt.`;
  return failed.length ? { ok: false, error: `${text} Nicht geklappt: ${failed.join(", ")} (Details im Server-Log).` } : { ok: true, data: { message: text } };
}

/** Alle Changelog-Posts des Bots im Kanal löschen; beim nächsten Tageslauf werden die veröffentlichten Versionen neu gepostet. */
export async function deleteChangelogPostsAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { deleteChangelogPosts } = await import("@/lib/discord/changelog-post");
  const r = await deleteChangelogPosts(db);
  return { ok: true, data: { message: `${r.deleted} Changelog-Post(s) gelöscht. Neu gepostet wird mit „Fertige Changelog-Tage jetzt posten“ oder beim nächsten Tageslauf.` } };
}

/** Veröffentlichte, noch nicht gepostete Versionen sofort posten (sonst übernimmt das der nächste Tageslauf). */
export async function postChangelogNowAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { postNewChangelogEntries } = await import("@/lib/discord/changelog-post");
  const ids = await postNewChangelogEntries(db, new Date(), { force: true });
  if (!ids.length) return { ok: true, data: { message: "Nichts zu posten – alle veröffentlichten Versionen sind schon gepostet. Den laufenden Tag veröffentlichst du mit „Jetzt veröffentlichen“." } };
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

/**
 * Knöpfe in Discord einrichten: trägt die Interaktions-URL des Portals bei der
 * Discord-App ein (Discord prüft die URL dabei sofort mit einem Test-Ping) und
 * schaltet den Knopf „Übernehmen“ an neuen Bewerbungen ein.
 */
export async function setupInteractionsAction(): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN fehlt." };
  const { publicEnv } = await import("@/lib/env");
  if (!/^https:\/\//.test(publicEnv.appUrl)) return { ok: false, error: "Geht nur auf der Live-Seite (https)." };
  const url = `${publicEnv.appUrl}/api/discord/interactions`;
  const res = await fetch("https://discord.com/api/v10/applications/@me", {
    method: "PATCH",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ interactions_endpoint_url: url }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string; errors?: unknown } | null;
    return { ok: false, error: `Discord hat die URL abgelehnt (${res.status}): ${err?.message ?? "unbekannt"}. ${JSON.stringify(err?.errors ?? "").slice(0, 200)}` };
  }
  await saveSettings({ "discord.claimButton": true }, user.id);
  await audit("settings.update", { actorId: user.id, meta: { interactionsEndpoint: url } });
  revalidatePath("/team/admin", "layout");
  // Slash-Befehl /bewerbung gleich mit registrieren (läuft über dieselbe URL)
  const cmd = await registerStatusCommand(token);
  return {
    ok: true,
    data: { message: `Eingerichtet: ${url}. Neue Bewerbungen bekommen jetzt den Knopf „Übernehmen“. ${cmd.ok ? "Befehl /bewerbung ist registriert." : `Befehl /bewerbung: ${cmd.error}`}` },
  };
}

/** /bewerbung, /offen und /claim als Guild-Befehle registrieren (sofort verfügbar, nur auf dem Nordverkehr-Server). */
async function registerStatusCommand(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return { ok: false, error: "DISCORD_GUILD_ID fehlt." };
  const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const me = await fetch("https://discord.com/api/v10/applications/@me", { headers, cache: "no-store" });
  if (!me.ok) return { ok: false, error: `Discord-App nicht lesbar (${me.status}).` };
  const { id: appId } = (await me.json()) as { id: string };
  const { ALL_COMMANDS } = await import("@/lib/discord/interactions");
  // POST legt an bzw. überschreibt den Befehl mit gleichem Namen – andere Befehle bleiben
  for (const command of ALL_COMMANDS) {
    const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, { method: "POST", headers, body: JSON.stringify(command) });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, error: `Discord hat /${command.name} abgelehnt (${res.status}): ${err?.message ?? "unbekannt"}. Hat der Bot den Scope „applications.commands“?` };
    }
  }
  return { ok: true };
}

/** Nur die Befehle (neu) registrieren – die Interaktions-URL muss schon eingerichtet sein. */
export async function registerCommandsAction(): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN fehlt." };
  const r = await registerStatusCommand(token);
  if (!r.ok) return { ok: false, error: r.error };
  await audit("settings.update", { actorId: user.id, meta: { command: "bewerbung,offen,claim" } });
  return {
    ok: true,
    data: { message: "Befehle registriert: /bewerbung (Bewerber sehen ihren Stand), /offen und /claim (Team). Vorher einmal „Knopf ‚Übernehmen‘ einrichten“." },
  };
}

/** Alle laufenden Bewerbungen sofort prüfen: noch auf dem Discord? (Bot-Nachricht bei Austritt) */
export async function scanGuildNowAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { scanApplicantsInGuild } = await import("@/lib/applications/guild-watch");
  const r = await scanApplicantsInGuild({ fresh: true });
  const parts = [`${r.checked} geprüft`, `${r.notInGuild} nicht auf dem Discord`, `${r.notified} neue Bot-Nachricht(en)`];
  if (r.back) parts.push(`${r.back} wieder da`);
  if (r.unknown) parts.push(`${r.unknown} nicht prüfbar (Discord-Fehler)`);
  return { ok: true, data: { message: parts.join(" · ") + "." } };
}

/** Ausstehende Zustellungen jetzt senden. */
export async function flushOutboxAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { runOutbox, releaseStuckJobs } = await import("@/lib/discord/outbox-db");
  await releaseStuckJobs(2);
  const n = await runOutbox({ limit: 25 });
  revalidatePath("/team/admin", "layout");
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

// ─── Testbewerbungen ──────────────────────────────────────────

const testSchema = z.object({
  positionIds: z.array(id).min(1, "Bitte mindestens eine Stelle wählen.").max(30),
  scenarios: z.array(z.string().max(30)).min(1, "Bitte mindestens ein Szenario wählen.").max(20),
  postToDiscord: z.boolean().default(false),
  runAi: z.boolean().default(false),
});

/**
 * Testbewerbungen pro Stelle und Szenario anlegen (nur Admins). Testbewerber sind
 * keine echten Discord-Accounts: DMs/Rollen werden nie verschickt.
 */
export async function createTestApplicationsAction(input: z.input<typeof testSchema>): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  const p = testSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { createTestApplications, TEST_SCENARIO_KEYS } = await import("@/lib/setup/test-applications");
  const scenarios = p.data.scenarios.filter((s) => TEST_SCENARIO_KEYS.includes(s));
  if (!scenarios.length) return { ok: false, error: "Unbekannte Szenarien." };
  if (p.data.positionIds.length * scenarios.length > 120) return { ok: false, error: "Zu viele auf einmal – höchstens 120 Testbewerbungen pro Durchgang." };
  const { getFormDefinition } = await import("@/lib/data/positions");
  const created = await createTestApplications(db, getFormDefinition, { positionIds: p.data.positionIds, scenarios, actorId: user.id });
  await audit("data.test", { actorId: user.id, meta: { created: created.length, positions: p.data.positionIds.length, scenarios } });

  if (p.data.postToDiscord || p.data.runAi) {
    const ids = created.map((c) => c.id);
    const postToDiscord = p.data.postToDiscord;
    const runAi = p.data.runAi;
    after(async () => {
      if (postToDiscord) await postTestApplications(ids).catch((e) => console.error("[test-apps] Discord", e));
      if (runAi) {
        const { tagApplication } = await import("@/lib/ai/tagging");
        const { claimAndScore } = await import("@/lib/ai/scoring");
        for (const appId of ids) {
          await tagApplication(appId).catch((e) => console.error("[test-apps] KI-Tags", e));
          await claimAndScore(appId);
        }
      }
    });
  }
  revalidatePath("/team/admin", "layout");
  revalidatePath("/team/bewerbungen");
  const extra = [p.data.postToDiscord && "Discord-Posts", p.data.runAi && "KI-Einordnung"].filter(Boolean).join(" und ");
  return {
    ok: true,
    data: { message: `${created.length} Testbewerbung${created.length === 1 ? "" : "en"} angelegt (${created[0]?.publicId ?? "–"} …).${extra ? ` ${extra} laufen im Hintergrund.` : ""}` },
  };
}

/** Testbewerbungen wie echte im Bewerbungs-Kanal posten (inkl. Thread, falls eingeschaltet). */
async function postTestApplications(ids: string[]) {
  const { channelIds } = await import("@/lib/discord/botlog");
  const { applications } = await channelIds();
  if (!applications) return;
  const { getSettings } = await import("@/lib/settings");
  const { enqueue, runOutboxAll } = await import("@/lib/discord/outbox-db");
  const { buildLogMessage } = await import("@/lib/messages/embed");
  const { claimCustomId } = await import("@/lib/discord/interactions");
  const { threadName } = await import("@/lib/discord/threads");
  const { publicEnv } = await import("@/lib/env");
  const s = await getSettings();
  const apps = await db.application.findMany({ where: { id: { in: ids }, isTest: true }, include: { user: true, position: { select: { title: true } } } });
  const jobs: string[] = [];
  for (const a of apps) {
    const flags = (a.flags as unknown as { message: string }[]) ?? [];
    const job = await enqueue(
      {
        type: "CHANNEL_MESSAGE",
        kind: "applications",
        channelId: applications,
        message: buildLogMessage({
          positionTitle: `${a.position.title} (TEST)`,
          applicantDiscordId: a.user.discordId,
          applicantName: a.user.globalName || a.user.username,
          applicantAvatarUrl: null,
          publicId: a.publicId ?? "TEST",
          age: a.age,
          teamUrl: `${publicEnv.appUrl}/team/bewerbungen/${a.id}`,
          flags: flags.map((f) => f.message),
          claimCustomId: s["discord.claimButton"] ? claimCustomId(a.id) : null,
        }),
        ...(s["discord.threadPerApplication"] ? { startThread: threadName(a.publicId ?? "TEST", `${a.position.title} (TEST)`) } : {}),
      },
      { applicationId: a.id },
    );
    jobs.push(job.id);
  }
  await runOutboxAll(jobs, { deadline: Date.now() + 25_000 });
}

/** Alle Testbewerbungen samt Testbewerbern löschen. */
export async function deleteTestApplicationsAction(): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  const { deleteTestApplications } = await import("@/lib/setup/test-applications");
  const r = await deleteTestApplications(db);
  await audit("data.test", { actorId: user.id, meta: { deleted: r.applications, users: r.users } });
  revalidatePath("/team/admin", "layout");
  revalidatePath("/team/bewerbungen");
  return { ok: true, data: { message: `${r.applications} Testbewerbung${r.applications === 1 ? "" : "en"} und ${r.users} Testbewerber gelöscht.` } };
}

// ─── Einstellungen sichern & wiederherstellen ─────────────────

/** Sicherung einlesen: erst Vorschau (dryRun), dann übernehmen. Führt zusammen, löscht nie. */
export async function importConfigAction(json: string, dryRun: boolean): Promise<ActionResult<{ report: import("@/lib/admin/config-backup").ImportReport }>> {
  const { user } = await requireAdmin();
  if (typeof json !== "string" || json.length > 3_000_000) return { ok: false, error: "Datei zu groß (max. 3 MB)." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "Das ist keine gültige JSON-Datei." };
  }
  const { backupSchema, importConfig } = await import("@/lib/admin/config-backup");
  const p = backupSchema.safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0];
    return { ok: false, error: `Datei passt nicht (${i.path.join(".") || "Aufbau"}: ${i.message}). Nur Sicherungen aus diesem Portal.` };
  }
  try {
    const report = await importConfig(db, p.data, { dryRun, actorId: user.id });
    if (!dryRun) {
      await audit("settings.import", { actorId: user.id, meta: { ...report, skipped: report.skipped.length } });
      revalidatePath("/team/admin", "layout");
      revalidatePath("/team/positionen");
      revalidatePath("/team/bausteine");
      refreshJobsAfter();
    }
    return { ok: true, data: { report } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import fehlgeschlagen." };
  }
}

/** Wochenbericht sofort an die Leitung schicken (Test). */
export async function postWeeklyNowAction(): Promise<ActionResult<{ message: string }>> {
  await requireAdmin();
  const { postWeeklyReport } = await import("@/lib/team/weekly-report");
  const id = await postWeeklyReport(db, { force: true });
  if (!id) return { ok: false, error: "Kein Kanal eingetragen (Leitungs-Chat oder Teamchat)." };
  const job = await db.outboxJob.findUnique({ where: { id }, select: { status: true, lastError: true } });
  return job?.lastError ? { ok: false, error: `Fehler: ${job.lastError}` } : { ok: true, data: { message: job?.status === "DONE" ? "Wochenbericht gepostet." : "Wochenbericht ist in der Warteschlange (Nachtruhe oder Discord nicht erreichbar)." } };
}

/** Changelog des laufenden Tages sofort veröffentlichen (Website) und in Discord posten – auch in der Nachtruhe. */
export async function publishChangelogNowAction(): Promise<ActionResult<{ message: string }>> {
  const { user } = await requireAdmin();
  const { publishChangelogNow } = await import("@/lib/discord/changelog-post");
  const ids = await publishChangelogNow(db, user.id);
  await audit("settings.update", { actorId: user.id, meta: { changelog: "published_now", posts: ids.length } });
  revalidatePath("/team/changelog");
  revalidatePath("/team/admin", "layout");
  revalidatePath("/team");
  if (!ids.length) return { ok: true, data: { message: "Veröffentlicht. In Discord gab es nichts Neues zu posten (schon gepostet oder Changelog-Posts aus)." } };
  const jobs = await db.outboxJob.findMany({ where: { id: { in: ids } }, select: { status: true, lastError: true } });
  const errors = jobs.map((j) => j.lastError).filter(Boolean);
  if (errors.length) return { ok: false, error: `Veröffentlicht, aber Discord meldet: ${errors.join(" · ")}` };
  return { ok: true, data: { message: `Veröffentlicht und ${ids.length} Version(en) in Discord gepostet.` } };
}

// ─── Bewerbungsrunden ─────────────────────────────────────────

const roundSchema = z.object({
  name: z.string().trim().min(2, "Name zu kurz.").max(80),
  positionId: z.string().regex(/^[a-z0-9]{10,40}$/i).nullable(),
  startsAt: z.iso.date(),
  endsAt: z.iso.date(),
  target: z.number().int().min(1).max(1000).nullable(),
});

/** Runde anlegen (nur Admins). Start/Ende als Tage (deutsche Zeit, ganztägig). */
export async function createRoundAction(input: z.input<typeof roundSchema>): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const p = roundSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { berlinDayBounds } = await import("@/lib/team/rounds");
  const startsAt = berlinDayBounds(p.data.startsAt).start;
  const endsAt = berlinDayBounds(p.data.endsAt).end;
  if (endsAt <= startsAt) return { ok: false, error: "Das Ende muss nach dem Start liegen." };
  const round = await db.applicationRound.create({ data: { name: p.data.name, positionId: p.data.positionId, startsAt, endsAt, target: p.data.target, createdById: user.id } });
  await audit("settings.update", { actorId: user.id, meta: { round: round.id, name: round.name } });
  revalidatePath("/team/runden");
  return { ok: true };
}

export async function deleteRoundAction(roundId: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  if (!/^[a-z0-9]{10,40}$/i.test(roundId)) return { ok: false, error: "Ungültig." };
  await db.applicationRound.deleteMany({ where: { id: roundId } });
  await audit("settings.update", { actorId: user.id, meta: { roundDeleted: roundId } });
  revalidatePath("/team/runden");
  return { ok: true };
}
