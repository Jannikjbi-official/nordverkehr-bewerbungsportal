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
import { createHash } from "node:crypto";
import { buildChangelogMessages } from "@/lib/messages/embed";
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

/** Stand einer Version in Discord. */
export type DeliveryState = "delivered" | "pending" | "missing";

/** Markierung pro Version: welche Zustellung(en) sie gepostet haben, mit welchen Versionen zusammen und mit welchem Inhalt. */
export interface ChangelogMarker {
  at?: string;
  /** alt: eine Zustellung */
  jobId?: string;
  jobIds?: string[];
  /** Versionen (ids), die zusammen in diesem Post stehen */
  group?: string[];
  /** Fingerabdruck des geposteten Inhalts – ändert er sich, wird der Post bearbeitet */
  hash?: string;
}

type Entry = (typeof CHANGELOG)[number];

/** Fingerabdruck des Inhalts (Version, Titel, Punkte). Rein, für Tests. */
export function contentHash(entries: Pick<Entry, "id" | "version" | "title" | "items">[]) {
  const data = JSON.stringify([...entries].sort((a, b) => a.id.localeCompare(b.id)).map((e) => [e.version, e.title ?? "", e.items.map((i) => [i.kind, i.text])]));
  return createHash("sha1").update(data).digest("hex").slice(0, 16);
}

/** Erkennt eine Version in einem alten Post (Überschrift „## Version 1.2“). Rein, für Tests. */
export function postIsVersion(payload: unknown, version: string) {
  return JSON.stringify(payload ?? "").includes(`## Version ${version}\\n`);
}

const jobIdsOf = (m: ChangelogMarker | null) => m?.jobIds ?? (m?.jobId ? [m.jobId] : null);

/**
 * Ist die Version wirklich in Discord angekommen? Neue Markierungen kennen ihre Zustellungen,
 * ältere werden über die gespeicherten Posts im Kanal geprüft. Gelöschte Posts zählen als fehlend.
 */
export async function deliveryState(
  db: PrismaClient,
  version: string,
  marker: ChangelogMarker | null,
  channelId: string,
  /** Admin-Knopf: bei Discord nachfragen, ob die Posts wirklich noch da sind (z. B. von Hand gelöscht) */
  verify = false,
): Promise<{ state: DeliveryState; pendingIds: string[] }> {
  const ids = jobIdsOf(marker);
  const jobs = ids
    ? await db.outboxJob.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, payload: true, result: true } })
    : (await db.outboxJob.findMany({ where: { type: "CHANNEL_MESSAGE", payload: { path: ["kind"], equals: "changelog" } }, select: { id: true, status: true, payload: true, result: true }, orderBy: { createdAt: "desc" }, take: 200 })).filter(
        (j) => (j.payload as { channelId?: string }).channelId === channelId && postIsVersion(j.payload, version),
      );
  const ok = (j: (typeof jobs)[number]) => j.status === "DONE" && !(j.result as { deleted?: boolean } | null)?.deleted;
  const pendingIds = jobs.filter((j) => j.status === "PENDING" || j.status === "PROCESSING").map((j) => j.id);
  // Mit bekannten Zustellungen müssen alle Teile angekommen sein, bei alten reicht einer
  if (ids ? jobs.length === ids.length && jobs.every(ok) : jobs.some(ok)) {
    if (!verify) return { state: "delivered", pendingIds: [] };
    const check = ids ? jobs : jobs.filter(ok);
    const { getDiscordApi } = await import("@/lib/discord/client");
    const api = getDiscordApi();
    let gone = false;
    for (const j of check) {
      const messageId = (j.result as { messageId?: string } | null)?.messageId;
      if (!messageId || !api.messageExists) continue;
      const exists = await api.messageExists(channelId, messageId).catch(() => true); // unklar → lieber nicht doppelt posten
      if (!exists) {
        gone = true;
        await db.outboxJob.update({ where: { id: j.id }, data: { result: { ...(j.result as object), deleted: true } } });
      }
    }
    if (!gone) return { state: "delivered", pendingIds: [] };
    console.warn(`[changelog] Post von Version ${version} ist in Discord nicht mehr da`);
    return { state: "missing", pendingIds: [] };
  }
  if (pendingIds.length) return { state: "pending", pendingIds };
  return { state: "missing", pendingIds: [] };
}

export interface ChangelogRun {
  /** neu angelegte bzw. erneut angestoßene Zustellungen */
  posted: string[];
  /** wie viele Versionen neu gepostet bzw. nachgeholt wurden */
  versions: number;
  /** bearbeitete Discord-Posts (weil Punkte dazukamen) */
  edited: number;
}

/**
 * Veröffentlichte Tage posten (älteste zuerst):
 *  - Fehlende Versionen (nie angekommen, fehlgeschlagen, gelöscht) werden nachgeholt – mehrere zusammen
 *    in einer Nachricht, bei zu viel Text in Fortsetzungs-Nachrichten.
 *  - Kamen zu einer schon geposteten Version Punkte dazu, wird der vorhandene Post bearbeitet (nur dann).
 *  - `force` (Admin-Knopf): wartende Posts sofort senden, auch nachts.
 */
export async function postNewChangelogEntries(db: PrismaClient, now = new Date(), opts: { force?: boolean } = {}): Promise<ChangelogRun> {
  const s = await getSettings();
  const rule: PublishRule = { time: s["changelog.publishTime"], through: s["changelog.publishedThrough"] };
  const channelId = s["discord.changelogChannelId"];
  const run: ChangelogRun = { posted: [], versions: 0, edited: 0 };
  if (!s["discord.changelogEnabled"] || !channelId) return run;
  const url = `${publicEnv.appUrl}/team/changelog`;
  const byId = new Map(CHANGELOG.map((e) => [e.id, e]));

  const toPost: Entry[] = [];
  const toEdit = new Map<string, { entries: Entry[]; marker: ChangelogMarker }>(); // Schlüssel: erste Zustellung
  for (const entry of [...publishedEntries(now, rule)].reverse()) {
    const key = `changelog:${entry.id}`;
    const row = await db.setting.findUnique({ where: { key } });
    if (row) {
      const marker = row.value as ChangelogMarker | null;
      // Gerade erst angelegt: der Versand läuft vermutlich noch (nicht doppelt posten)
      if (!opts.force && marker?.at && now.getTime() - new Date(marker.at).getTime() < 15 * 60_000) continue;
      const d = await deliveryState(db, entry.version, marker, channelId, !!opts.force);
      if (d.state === "delivered") {
        // Punkte dazugekommen? Dann den Post bearbeiten (nur mit bekanntem Inhalt und bekannter Zustellung)
        const ids = jobIdsOf(marker);
        if (marker?.hash && ids?.length && marker.group?.length) {
          const entries = marker.group.map((id) => byId.get(id)).filter((e): e is Entry => !!e);
          if (contentHash(entries) !== marker.hash && !toEdit.has(ids[0])) toEdit.set(ids[0], { entries, marker });
        }
        continue;
      }
      if (d.state === "pending") {
        if (opts.force) {
          // Hängt z. B. in der Nachtruhe: jetzt senden
          for (const id of d.pendingIds.filter((x) => !run.posted.includes(x))) {
            const job = await db.outboxJob.findUnique({ where: { id }, select: { payload: true } });
            await db.outboxJob.update({ where: { id }, data: { runAt: now, payload: { ...(job?.payload as object), ignoreNight: true } } });
            run.posted.push(id);
          }
        }
        continue;
      }
      // Fehlt in Discord → Markierung entfernen und neu posten (bedingt: nur wenn sie noch so aussieht)
      const removed = await db.setting.deleteMany({ where: { key, updatedAt: row.updatedAt } });
      if (!removed.count) continue;
      console.warn(`[changelog] Version ${entry.version} fehlt in Discord – wird nachgeholt`);
    }
    toPost.push(entry);
  }

  // Neu/nachgeholt: eine Nachricht für alles (bei viel Text mit Fortsetzung)
  if (toPost.length) {
    const messages = buildChangelogMessages(toPost, url);
    const group = toPost.map((e) => e.id);
    const jobs = await db
      .$transaction(async (tx) => {
        const created = [];
        for (const message of messages) created.push(await enqueue({ type: "CHANNEL_MESSAGE", kind: "changelog", channelId, message, ...(opts.force ? { ignoreNight: true } : {}) }, { tx }));
        const value: ChangelogMarker = { at: now.toISOString(), jobIds: created.map((j) => j.id), group, hash: contentHash(toPost) };
        for (const e of toPost) await tx.setting.create({ data: { key: `changelog:${e.id}`, value: value as object } });
        return created;
      })
      .catch(() => null); // andere Instanz war schneller (Key existiert schon)
    if (jobs) {
      run.posted.push(...jobs.map((j) => j.id));
      run.versions += toPost.length;
    }
  }

  // Bearbeiten: vorhandene Posts mit dem neuen Inhalt überschreiben, fehlende Teile anhängen, überzählige löschen
  for (const { entries, marker } of toEdit.values()) {
    try {
      run.edited += await editPosted(db, channelId, entries, marker, url, now);
    } catch (e) {
      console.error("[changelog] Bearbeiten fehlgeschlagen – nächster Lauf versucht es erneut", e);
    }
  }

  if (run.posted.length) {
    console.log(`[changelog] ${run.versions} Version(en), ${run.posted.length} Nachricht(en) an Kanal ${channelId}`);
    // Nacheinander statt parallel, damit Teil 1, 2, … in der richtigen Reihenfolge in Discord stehen
    for (const id of run.posted) await runOutbox({ ids: [id] }).catch((e) => console.error("[changelog]", e));
  }
  return run;
}

async function editPosted(db: PrismaClient, channelId: string, entries: Entry[], marker: ChangelogMarker, url: string, now: Date) {
  const { getDiscordApi } = await import("@/lib/discord/client");
  const api = getDiscordApi();
  const ids = jobIdsOf(marker) ?? [];
  const jobs = await db.outboxJob.findMany({ where: { id: { in: ids } }, select: { id: true, result: true } });
  const messageIds = ids.map((id) => (jobs.find((j) => j.id === id)?.result as { messageId?: string } | null)?.messageId ?? null);
  if (messageIds.some((m) => !m)) return 0;
  const messages = buildChangelogMessages(entries, url);
  let edited = 0;
  for (let i = 0; i < Math.min(messages.length, messageIds.length); i++) {
    await api.editMessage(channelId, messageIds[i]!, messages[i]);
    edited++;
  }
  const jobIds = ids.slice(0, messages.length);
  // Mehr Teile als vorher: anhängen
  for (const message of messages.slice(messageIds.length)) {
    const messageId = await api.postMessage(channelId, message);
    const job = await db.outboxJob.create({ data: { type: "CHANNEL_MESSAGE", status: "DONE", payload: { type: "CHANNEL_MESSAGE", kind: "changelog", channelId, message } as object, result: { channelId, messageId } } });
    jobIds.push(job.id);
  }
  // Weniger Teile: überzählige löschen
  for (const m of messageIds.slice(messages.length)) await api.deleteMessage(channelId, m!).catch(() => {});
  const value: ChangelogMarker = { ...marker, at: now.toISOString(), jobIds, hash: contentHash(entries) };
  delete value.jobId;
  await db.setting.updateMany({ where: { key: { in: entries.map((e) => `changelog:${e.id}`) } }, data: { value: value as object } });
  console.log(`[changelog] Post mit Version(en) ${entries.map((e) => e.version).join(", ")} bearbeitet (Punkte dazugekommen)`);
  return edited;
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
