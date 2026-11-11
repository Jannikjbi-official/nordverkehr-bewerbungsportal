/**
 * Neue Changelog-Einträge genau einmal in den Changelog-Kanal posten.
 * Markierung (`Setting changelog:<id>`, eindeutiger Key) und Versandauftrag
 * entstehen in einer Transaktion: Nur eine Instanz gewinnt, und bricht etwas
 * ab, wird der Eintrag beim nächsten Start bzw. Cron erneut versucht.
 */
import type { PrismaClient } from "@prisma/client";
import { CHANGELOG } from "@/lib/changelog";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { buildChangelogMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";

/**
 * Alle Einträge chronologisch neu posten. Vorher werden die noch vorhandenen
 * Changelog-Posts des Bots in diesem Kanal entfernt (nur die über die Outbox
 * gesendeten, also eigene Posts) – sonst gäbe es Doppelte und die Reihenfolge
 * stimmte nicht. Andere Nachrichten im Kanal bleiben unberührt.
 */
export async function repostAllChangelog(db: PrismaClient) {
  const s = await getSettings();
  const channelId = s["discord.changelogChannelId"];
  if (channelId) {
    const { getDiscordApi } = await import("@/lib/discord/client");
    const api = getDiscordApi();
    const previous = await db.outboxJob.findMany({ where: { type: "CHANNEL_MESSAGE", status: "DONE" }, select: { id: true, payload: true, result: true } });
    for (const job of previous) {
      const messageId = (job.result as { messageId?: string } | null)?.messageId;
      if ((job.payload as { channelId?: string }).channelId !== channelId || !messageId) continue;
      await api.deleteMessage(channelId, messageId).catch((e) => console.warn("[changelog] alter Post nicht gelöscht", e));
      // Ergebnis leeren, damit ein späterer Neuaufbau ihn nicht erneut anfasst
      await db.outboxJob.update({ where: { id: job.id }, data: { result: { deleted: true } } });
    }
  }
  await db.setting.deleteMany({ where: { key: { in: CHANGELOG.map((e) => `changelog:${e.id}`) } } });
  const ids = await postNewChangelogEntries(db);
  const jobs = await db.outboxJob.findMany({ where: { id: { in: ids } }, select: { status: true, lastError: true } });
  return { sent: jobs.filter((j) => j.status === "DONE").length, total: ids.length, errors: jobs.map((j) => j.lastError).filter(Boolean) as string[] };
}

/** Einen Eintrag (erneut) posten – für den Button in den Einstellungen. Gibt die Job-ID zurück. */
export async function repostChangelogEntry(db: PrismaClient, id: string) {
  await db.setting.deleteMany({ where: { key: `changelog:${id}` } });
  const posted = await postNewChangelogEntries(db, { only: id });
  return posted[0] ?? null;
}

export async function postNewChangelogEntries(db: PrismaClient, opts: { only?: string } = {}) {
  const s = await getSettings();
  const channelId = s["discord.changelogChannelId"];
  if (!s["discord.changelogEnabled"] || !channelId) return [];

  const posted: string[] = [];
  // Älteste zuerst, damit die Reihenfolge im Kanal stimmt
  for (const entry of [...CHANGELOG].reverse()) {
    if (opts.only && entry.id !== opts.only) continue;
    const key = `changelog:${entry.id}`;
    if (await db.setting.findUnique({ where: { key }, select: { key: true } })) continue;

    const job = await db
      .$transaction(async (tx) => {
        await tx.setting.create({ data: { key, value: { at: new Date().toISOString() } } });
        return enqueue(
          {
            type: "CHANNEL_MESSAGE",
            channelId,
            message: buildChangelogMessage(entry, `${publicEnv.appUrl}/team/changelog`),
          },
          { tx },
        );
      })
      .catch(() => null); // andere Instanz war schneller (Key existiert schon)
    if (job) posted.push(job.id);
  }
  if (posted.length) {
    console.log(`[changelog] ${posted.length} Eintrag/Einträge an Kanal ${channelId} geschickt`);
    await runOutbox({ ids: posted }).catch((e) => console.error("[changelog]", e));
  }
  return posted;
}
