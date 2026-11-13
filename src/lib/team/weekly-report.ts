/**
 * Wochenbericht an die Leitung (Einstellung report.weeklyEnabled): montags im
 * Morgenlauf eine kurze Statistik der letzten 7 Tage in den Leitungs-Chat
 * (sonst Teamchat). Ohne Testbewerbungen. Pro Woche genau einmal.
 */
import type { PrismaClient } from "@prisma/client";
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { aggregateRejections } from "@/lib/applications/rejection";
import { ACTIVE_STATUSES } from "@/lib/applications/status";
import { todayBerlin } from "@/lib/changelog";
import { enqueue, runOutbox } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { BRAND_COLOR, linkButtons, separator, text, v2Message } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

const DAY = 86_400_000;

export interface WeeklyStats {
  from: Date;
  to: Date;
  submitted: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  avgDecisionDays: number | null;
  open: number;
  unclaimed: number;
  topRejections: { label: string; count: number }[];
  feedbackAvg: number | null;
  feedbackCount: number;
}

export const isMondayBerlin = (now: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(now) === "Mon";

export async function collectWeeklyStats(db: PrismaClient, now = new Date()): Promise<WeeklyStats> {
  const from = new Date(now.getTime() - 7 * DAY);
  const real = { isTest: { not: true } };
  const [submitted, decided, withdrawn, open, unclaimed, feedback] = await Promise.all([
    db.application.count({ where: { ...real, submittedAt: { gte: from, lt: now } } }),
    db.application.findMany({ where: { ...real, status: { in: ["ACCEPTED", "REJECTED"] }, decidedAt: { gte: from, lt: now } }, select: { status: true, positionId: true, rejectionCategory: true, submittedAt: true, decidedAt: true } }),
    db.application.count({ where: { ...real, status: "WITHDRAWN", decidedAt: { gte: from, lt: now } } }),
    db.application.count({ where: { ...real, status: { in: ACTIVE_STATUSES } } }),
    db.application.count({ where: { ...real, status: { in: ACTIVE_STATUSES }, OR: [{ claimedById: null }] } }),
    db.feedback.findMany({ where: { createdAt: { gte: from, lt: now } }, select: { rating: true } }),
  ]);
  const days = decided.filter((d) => d.submittedAt && d.decidedAt).map((d) => (d.decidedAt!.getTime() - d.submittedAt!.getTime()) / DAY);
  return {
    from,
    to: now,
    submitted,
    accepted: decided.filter((d) => d.status === "ACCEPTED").length,
    rejected: decided.filter((d) => d.status === "REJECTED").length,
    withdrawn,
    avgDecisionDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
    open,
    unclaimed,
    topRejections: aggregateRejections(decided).byCategory.slice(0, 3).map((c) => ({ label: c.label, count: c.count })),
    feedbackAvg: feedback.length ? feedback.reduce((a, f) => a + f.rating, 0) / feedback.length : null,
    feedbackCount: feedback.length,
  };
}

const fmtDay = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", timeZone: "Europe/Berlin" }).format(d);
const fmt1 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function buildWeeklyMessage(w: WeeklyStats, appUrl: string): RESTPostAPIChannelMessageJSONBody {
  const decided = w.accepted + w.rejected;
  const lines = [
    `📥 **${w.submitted}** neue Bewerbung${w.submitted === 1 ? "" : "en"}`,
    `✅ **${w.accepted}** angenommen · ❌ **${w.rejected}** abgelehnt${w.withdrawn ? ` · ↩️ ${w.withdrawn} zurückgezogen` : ""}`,
    decided ? `📈 Annahmequote **${Math.round((w.accepted / decided) * 100)} %**` : null,
    w.avgDecisionDays !== null ? `⏱️ Ø **${fmt1(w.avgDecisionDays)} Tage** bis zur Entscheidung` : null,
    `📂 Gerade offen: **${w.open}**${w.unclaimed ? ` (davon ${w.unclaimed} ohne Betreuer)` : ""}`,
    w.feedbackCount ? `⭐ Feedback der Bewerber: **${fmt1(w.feedbackAvg!)} / 5** (${w.feedbackCount})` : null,
  ].filter(Boolean) as string[];
  const rej = w.topRejections.length ? `### Häufigste Absagegründe\n${w.topRejections.map((r) => `- ${r.label}: ${r.count}`).join("\n")}` : null;
  return v2Message(BRAND_COLOR, [
    text(`-# 📊 WOCHENBERICHT · ${fmtDay(w.from).toUpperCase()} – ${fmtDay(w.to).toUpperCase()}\n## Die Woche in Zahlen\n${lines.join("\n")}`),
    rej ? separator(false, 1) : null,
    rej ? text(rej) : null,
    linkButtons([{ label: "Statistiken", url: /^https:\/\//.test(appUrl) ? `${appUrl}/team/statistiken?zeitraum=30` : null }]),
  ]);
}

/** Montags einmal posten. */
export async function postWeeklyReport(db: PrismaClient, opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const s = await getSettings();
  if (!opts.force && (!s["report.weeklyEnabled"] || !isMondayBerlin(now))) return null;
  const channelId = s["discord.leadChannelId"] || s["discord.summaryChannelId"];
  if (!channelId) return null;
  const key = `weekly:${todayBerlin(now)}`;
  if (!opts.force) {
    const fresh = await db.setting.create({ data: { key, value: { at: now.toISOString() } } }).then(() => true, () => false);
    if (!fresh) return null;
  }
  const stats = await collectWeeklyStats(db, now);
  const job = await enqueue({ type: "CHANNEL_MESSAGE", kind: "summary", channelId, message: buildWeeklyMessage(stats, publicEnv.appUrl) });
  await runOutbox({ ids: [job.id] }).catch(() => {});
  return job.id;
}
