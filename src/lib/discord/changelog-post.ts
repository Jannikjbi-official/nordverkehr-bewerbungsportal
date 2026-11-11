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

export async function postNewChangelogEntries(db: PrismaClient) {
  const s = await getSettings();
  const channelId = s["discord.changelogChannelId"];
  if (!s["discord.changelogEnabled"] || !channelId) return [];

  const posted: string[] = [];
  // Älteste zuerst, damit die Reihenfolge im Kanal stimmt
  for (const entry of [...CHANGELOG].reverse()) {
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
  if (posted.length) await runOutbox({ ids: posted }).catch((e) => console.error("[changelog]", e));
  return posted;
}
