/**
 * Changelog auf Discord: Jeder veröffentlichte Tag (siehe lib/changelog.ts)
 * wird genau einmal gepostet – von den stündlichen Zustellläufen, sobald die
 * eingestellte Uhrzeit erreicht ist, oder sofort per Admin-Knopf.
 *
 * Markierung (`Setting changelog:<id>`, eindeutiger Key) und Versandauftrag
 * entstehen in einer Transaktion: Nur eine Instanz gewinnt, und bricht etwas
 * ab, wird der Eintrag beim nächsten Lauf erneut versucht.
 */
import type { PrismaClient } from "@prisma/client";
import { CHANGELOG, publishedEntries, todayBerlin, type PublishRule } from "@/lib/changelog";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { buildChangelogMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";

/** Veröffentlichungsregel aus den Einstellungen. */
export async function changelogRule(): Promise<PublishRule> {
  const s = await getSettings();
  return { time: s["changelog.publishTime"], through: s["changelog.publishedThrough"] };
}

/** Admin-Knopf: alles bis heute sofort veröffentlichen (Website) und posten – auch in der Nachtruhe. */
export async function publishChangelogNow(db: PrismaClient, actorId: string, now = new Date()) {
  const { saveSettings } = await import("@/lib/settings");
  await saveSettings({ "changelog.publishedThrough": todayBerlin(now) }, actorId);
  return postNewChangelogEntries(db, now, { force: true });
}

/** Veröffentlichte, noch nicht gepostete Tage posten (älteste zuerst). */
export async function postNewChangelogEntries(db: PrismaClient, now = new Date(), opts: { force?: boolean } = {}) {
  const s = await getSettings();
  const rule: PublishRule = { time: s["changelog.publishTime"], through: s["changelog.publishedThrough"] };
  const channelId = s["discord.changelogChannelId"];
  if (!s["discord.changelogEnabled"] || !channelId) return [];

  const posted: string[] = [];
  for (const entry of [...publishedEntries(now, rule)].reverse()) {
    const key = `changelog:${entry.id}`;
    if (await db.setting.findUnique({ where: { key }, select: { key: true } })) continue;

    const job = await db
      .$transaction(async (tx) => {
        await tx.setting.create({ data: { key, value: { at: new Date().toISOString() } } });
        return enqueue(
          { type: "CHANNEL_MESSAGE", kind: "changelog", channelId, message: buildChangelogMessage(entry, `${publicEnv.appUrl}/team/changelog`), ...(opts.force ? { ignoreNight: true } : {}) },
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
 * nächste Tageslauf die veröffentlichten Versionen neu.
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
