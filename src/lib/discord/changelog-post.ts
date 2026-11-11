/**
 * Changelog auf Discord: Jeder veröffentlichte Tag (siehe lib/changelog.ts)
 * wird genau einmal gepostet – vom täglichen Cron um 0 Uhr.
 *
 * Markierung (`Setting changelog:<id>`, eindeutiger Key) und Versandauftrag
 * entstehen in einer Transaktion: Nur eine Instanz gewinnt, und bricht etwas
 * ab, wird der Eintrag beim nächsten Lauf erneut versucht.
 */
import type { PrismaClient } from "@prisma/client";
import { CHANGELOG, publishedEntries } from "@/lib/changelog";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { buildChangelogMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";

/** Veröffentlichte, noch nicht gepostete Tage posten (älteste zuerst). */
export async function postNewChangelogEntries(db: PrismaClient, now = new Date()) {
  const s = await getSettings();
  const channelId = s["discord.changelogChannelId"];
  if (!s["discord.changelogEnabled"] || !channelId) return [];

  const posted: string[] = [];
  for (const entry of [...publishedEntries(now)].reverse()) {
    const key = `changelog:${entry.id}`;
    if (await db.setting.findUnique({ where: { key }, select: { key: true } })) continue;

    const job = await db
      .$transaction(async (tx) => {
        await tx.setting.create({ data: { key, value: { at: new Date().toISOString() } } });
        return enqueue(
          { type: "CHANNEL_MESSAGE", channelId, message: buildChangelogMessage(entry, `${publicEnv.appUrl}/team/changelog`) },
          { tx },
        );
      })
      .catch(() => null); // andere Instanz war schneller (Key existiert schon)
    if (job) posted.push(job.id);
  }
  if (posted.length) {
    console.log(`[changelog] ${posted.length} Version(en) an Kanal ${channelId} geschickt`);
    await runOutbox({ ids: posted }).catch((e) => console.error("[changelog]", e));
  }
  return posted;
}

/**
 * Alle Changelog-Posts des Bots aus dem Kanal löschen (nur eigene, über die
 * Outbox gesendete) und die Markierungen zurücksetzen – danach postet der
 * nächste Cron-Lauf die veröffentlichten Versionen neu.
 */
export async function deleteChangelogPosts(db: PrismaClient) {
  const s = await getSettings();
  const channelId = s["discord.changelogChannelId"];
  let deleted = 0;
  if (channelId) {
    const { getDiscordApi } = await import("@/lib/discord/client");
    const api = getDiscordApi();
    const previous = await db.outboxJob.findMany({ where: { type: "CHANNEL_MESSAGE", status: "DONE" }, select: { id: true, payload: true, result: true } });
    for (const job of previous) {
      const messageId = (job.result as { messageId?: string } | null)?.messageId;
      if ((job.payload as { channelId?: string }).channelId !== channelId || !messageId) continue;
      await api.deleteMessage(channelId, messageId).catch((e) => console.warn("[changelog] Post nicht gelöscht", e));
      await db.outboxJob.update({ where: { id: job.id }, data: { result: { deleted: true } } });
      deleted++;
    }
  }
  // Markierungen aller (auch früherer) Einträge entfernen
  await db.setting.deleteMany({ where: { key: { startsWith: "changelog:" } } });
  return { deleted, versions: CHANGELOG.length };
}
