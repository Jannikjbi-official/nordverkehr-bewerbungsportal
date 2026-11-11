/**
 * Stellenaufruf im Discord-Kanal: einmal posten, danach bei jeder Änderung an
 * den Positionen dieselbe Nachricht bearbeiten (keine neuen Posts, kein Spam).
 * Message-ID steht im Setting `discord:jobsPost`.
 */
import type { PrismaClient } from "@prisma/client";
import { buildJobsMessage, type JobPosition } from "@/lib/messages/jobs";
import { getSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";

const KEY = "discord:jobsPost";

interface Stored {
  channelId: string;
  messageId: string;
  at: string;
}

async function render(db: PrismaClient) {
  const s = await getSettings();
  const positions = await db.position.findMany({
    where: { type: { key: "team", active: true } },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, title: true, tagline: true, description: true, icon: true, status: true, tasks: true, requirements: true, minAge: true, acceptRoleId: true },
  });
  return {
    settings: s,
    message: buildJobsMessage(positions as JobPosition[], { appUrl: publicEnv.appUrl, defaultMinAge: s["applications.minAge"] }),
  };
}

export async function getJobsPost(db: PrismaClient) {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return (row?.value as Stored | undefined) ?? null;
}

/**
 * mode "update": vorhandenen Post bearbeiten (gibt es keinen, nichts tun – außer `createIfMissing`)
 * mode "new": alten Post löschen (falls vorhanden) und neu posten (landet unten im Kanal)
 */
export async function publishJobsPost(db: PrismaClient, opts: { mode: "update" | "new"; createIfMissing?: boolean }) {
  const { settings, message } = await render(db);
  const channelId = settings["discord.jobsChannelId"];
  if (!channelId) return { ok: false as const, error: "Kein Kanal für den Stellenaufruf eingetragen." };
  const { getDiscordApi } = await import("@/lib/discord/client");
  const api = getDiscordApi();
  const stored = await getJobsPost(db);

  if (opts.mode === "update" && stored && stored.channelId === channelId) {
    try {
      await api.editMessage(channelId, stored.messageId, message);
      await db.setting.update({ where: { key: KEY }, data: { value: { ...stored, at: new Date().toISOString() } } });
      return { ok: true as const, action: "updated" as const };
    } catch (e) {
      const kind = (e as { kind?: string }).kind;
      if (kind !== "not_found") return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      // Post wurde von Hand gelöscht → neu posten
    }
  } else if (opts.mode === "update" && !opts.createIfMissing) {
    return { ok: true as const, action: "none" as const };
  }

  if (stored) await api.deleteMessage(stored.channelId, stored.messageId).catch(() => {});
  const messageId = await api.postMessage(channelId, message);
  const value: Stored = { channelId, messageId, at: new Date().toISOString() };
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: { ...value } }, update: { value: { ...value } } });
  return { ok: true as const, action: "posted" as const };
}

/** Nach Änderungen an Positionen: vorhandenen Post still im Hintergrund aktualisieren. */
export async function refreshJobsPostQuietly(db: PrismaClient) {
  const s = await getSettings();
  if (!s["discord.jobsAutoUpdate"]) return;
  const r = await publishJobsPost(db, { mode: "update" }).catch((e) => ({ ok: false as const, error: String(e) }));
  if (!r.ok) console.warn("[jobs] Stellenaufruf nicht aktualisiert:", r.error);
}
