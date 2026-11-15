/**
 * Team-Jubiläen: Am Jahrestag der Annahme ein kurzer Gruß im Teamchat
 * (Kanal des Willkommensgrußes). Einmal pro Person und Jahr.
 */
import type { PrismaClient } from "@prisma/client";

function berlinParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Heute Jahrestag? Dann Anzahl Jahre (≥ 1), sonst 0. 29.2. feiert in Nicht-Schaltjahren am 28.2. Rein, für Tests. */
export function anniversaryYears(since: Date, now = new Date()) {
  const a = berlinParts(since);
  const b = berlinParts(now);
  const day = a.m === 2 && a.d === 29 && !isLeap(b.y) ? 28 : a.d;
  if (a.m !== b.m || day !== b.d) return 0;
  return Math.max(0, b.y - a.y);
}

export function anniversaryText(template: string, years: number) {
  return template.replaceAll("{jahre}", years === 1 ? "einem Jahr" : `${years} Jahren`);
}

export async function postAnniversaries(db: PrismaClient, now = new Date()) {
  const { getSettings } = await import("@/lib/settings");
  const s = await getSettings();
  const channelId = s["discord.welcomeChannelId"];
  if (!s["team.anniversaryEnabled"] || !channelId) return 0;
  const apps = await db.application.findMany({
    where: {
      status: "ACCEPTED",
      isTest: { not: true },
      decidedAt: { not: null, lte: new Date(now.getTime() - 360 * 86_400_000) },
      position: { type: { key: "team" } },
      user: { isTeam: true },
    },
    select: { id: true, decidedAt: true, user: { select: { discordId: true, avatar: true, globalName: true, username: true } }, position: { select: { title: true } } },
    take: 1000,
  });
  const { enqueue, runOutboxAll } = await import("@/lib/discord/outbox-db");
  const { welcomeText } = await import("@/lib/discord/roles");
  const { buildWelcomeMessage } = await import("@/lib/messages/embed");
  const { avatarUrl } = await import("@/lib/discord/snowflake");
  const ids: string[] = [];
  for (const a of apps) {
    const years = a.decidedAt ? anniversaryYears(a.decidedAt, now) : 0;
    if (!years) continue;
    // Einmal pro Bewerbung und Jahr (eindeutiger Schlüssel)
    const won = await db.setting
      .create({ data: { key: `anniversary:${a.id}:${berlinParts(now).y}`, value: { years } } })
      .then(() => true)
      .catch(() => false);
    if (!won) continue;
    const text = welcomeText(anniversaryText(s["team.anniversaryMessage"], years), {
      discordId: a.user.discordId,
      name: a.user.globalName || a.user.username,
      position: a.position.title,
    });
    const job = await enqueue({ type: "CHANNEL_MESSAGE", kind: "summary", channelId, message: buildWelcomeMessage(text, a.user.discordId, avatarUrl(a.user.discordId, a.user.avatar, 128)) }, { applicationId: a.id });
    ids.push(job.id);
  }
  if (ids.length) await runOutboxAll(ids).catch(() => {});
  return ids.length;
}
