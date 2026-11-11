/**
 * Stellenaufrufe im Discord: einmal posten, danach bei Änderungen an den
 * Positionen dieselbe Nachricht bearbeiten (keine neuen Posts, kein Spam).
 *  - Gesamtaufruf:  Setting `discord:jobsPost`          → Kanal discord.jobsChannelId
 *  - Einzelaufruf:  Setting `discord:spotlight:<slug>`  → Kanal discord.spotlightChannelId
 */
import type { PrismaClient } from "@prisma/client";
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { buildJobsMessage, buildSpotlightMessage, type JobPosition } from "@/lib/messages/jobs";
import { getSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";

const JOBS_KEY = "discord:jobsPost";
const SPOT_PREFIX = "discord:spotlight:";

export interface StoredPost {
  channelId: string;
  messageId: string;
  at: string;
}

type Result = { ok: true; action: "updated" | "posted" | "none" } | { ok: false; error: string };

const POSITION_SELECT = { slug: true, title: true, tagline: true, description: true, icon: true, status: true, tasks: true, requirements: true, minAge: true, acceptRoleId: true } as const;

async function loadPositions(db: PrismaClient) {
  return (await db.position.findMany({ where: { type: { key: "team", active: true } }, orderBy: { sortOrder: "asc" }, select: POSITION_SELECT })) as JobPosition[];
}

async function stored(db: PrismaClient, key: string) {
  const row = await db.setting.findUnique({ where: { key } });
  return (row?.value as StoredPost | undefined) ?? null;
}

/** Gemeinsamer Ablauf: bearbeiten, sonst (neu) posten und Message-ID merken. */
async function publish(
  db: PrismaClient,
  key: string,
  channelId: string,
  message: RESTPostAPIChannelMessageJSONBody,
  opts: { mode: "update" | "new"; createIfMissing?: boolean },
): Promise<Result> {
  const { getDiscordApi } = await import("@/lib/discord/client");
  const api = getDiscordApi();
  const prev = await stored(db, key);

  if (opts.mode === "update" && prev && prev.channelId === channelId) {
    try {
      await api.editMessage(channelId, prev.messageId, message);
      await db.setting.update({ where: { key }, data: { value: { ...prev, at: new Date().toISOString() } } });
      return { ok: true, action: "updated" };
    } catch (e) {
      if ((e as { kind?: string }).kind !== "not_found") return { ok: false, error: e instanceof Error ? e.message : String(e) };
      // Post wurde von Hand gelöscht → neu posten
    }
  } else if (opts.mode === "update" && !opts.createIfMissing) {
    return { ok: true, action: "none" };
  }

  if (prev) await api.deleteMessage(prev.channelId, prev.messageId).catch(() => {});
  const messageId = await api.postMessage(channelId, message);
  const value: StoredPost = { channelId, messageId, at: new Date().toISOString() };
  await db.setting.upsert({ where: { key }, create: { key, value: { ...value } }, update: { value: { ...value } } });
  return { ok: true, action: "posted" };
}

export async function getJobsPost(db: PrismaClient) {
  return stored(db, JOBS_KEY);
}

/** Alle Einzelaufrufe, die schon gepostet wurden (slug → Post). */
export async function getSpotlights(db: PrismaClient) {
  const rows = await db.setting.findMany({ where: { key: { startsWith: SPOT_PREFIX } } });
  return Object.fromEntries(rows.map((r) => [r.key.slice(SPOT_PREFIX.length), r.value as unknown as StoredPost]));
}

export async function publishJobsPost(db: PrismaClient, opts: { mode: "update" | "new"; createIfMissing?: boolean }): Promise<Result> {
  const s = await getSettings();
  const channelId = s["discord.jobsChannelId"];
  if (!channelId) return { ok: false, error: "Kein Kanal für den Stellenaufruf eingetragen." };
  const message = buildJobsMessage(await loadPositions(db), { appUrl: publicEnv.appUrl, defaultMinAge: s["applications.minAge"] });
  return publish(db, JOBS_KEY, channelId, message, opts);
}

export async function publishSpotlight(db: PrismaClient, slug: string, opts: { mode: "update" | "new"; createIfMissing?: boolean }): Promise<Result> {
  const s = await getSettings();
  const channelId = s["discord.spotlightChannelId"];
  if (!channelId) return { ok: false, error: "Kein Kanal für Einzelaufrufe eingetragen." };
  const position = (await loadPositions(db)).find((p) => p.slug === slug);
  if (!position) return { ok: false, error: "Position nicht gefunden." };
  if (position.status === "HIDDEN") return { ok: false, error: "Versteckte Positionen werden nicht beworben." };
  const message = buildSpotlightMessage(position, { appUrl: publicEnv.appUrl, defaultMinAge: s["applications.minAge"] });
  return publish(db, SPOT_PREFIX + slug, channelId, message, opts);
}

/** Nach Änderungen an Positionen: vorhandene Posts still im Hintergrund aktualisieren. */
export async function refreshJobsPostQuietly(db: PrismaClient) {
  const s = await getSettings();
  if (!s["discord.jobsAutoUpdate"]) return;
  const results: Result[] = [await publishJobsPost(db, { mode: "update" }).catch((e) => ({ ok: false as const, error: String(e) }))];
  for (const slug of Object.keys(await getSpotlights(db))) {
    results.push(await publishSpotlight(db, slug, { mode: "update" }).catch((e) => ({ ok: false as const, error: String(e) })));
  }
  for (const r of results) if (!r.ok) console.warn("[jobs] Stellenaufruf nicht aktualisiert:", r.error);
}
