/**
 * Tägliche Team-Übersicht: Jeden Morgen (Cron /api/cron/summary) postet der Bot
 * in den Teamchat, was liegt – Gespräche heute, unbeantwortete Nachrichten,
 * liegengebliebene Bewerbungen, offene Rückzüge. Bewerbungen, auf die seit
 * `team.escalateDays` niemand reagiert hat, gehen zusätzlich an die Leitung.
 *
 * Pro Tag genau ein Post (Setting `summary:<YYYY-MM-DD>`, eindeutiger Key).
 * Ist nichts zu tun, wird nichts gepostet.
 */
import type { PrismaClient } from "@prisma/client";
import { ACTIVE_STATUSES, FOLLOW_UP_DAYS } from "@/lib/applications/status";
import { todayBerlin } from "@/lib/changelog";
import { enqueue, runOutbox, runOutboxAll } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { buildDailySummaryMessage, buildEscalationMessage, buildPersonalDigestMessage, groupByClaimer, isQuiet, type DailySummary, type SummaryItem } from "@/lib/messages/summary";
import { getSettings } from "@/lib/settings";

const DAY = 86_400_000;
const nameOf = (u: { globalName: string | null; username: string } | null | undefined) => (u ? u.globalName || u.username : null);

/** Ende des heutigen Tages (deutsche Zeit). */
export function endOfBerlinDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = get("hour") * 3600 + get("minute") * 60 + get("second");
  return new Date(now.getTime() + (86_400 - elapsed) * 1000);
}

/** Letzte Aktivität des Teams: Eingang, Statuswechsel, Team-Nachricht, interner Kommentar. */
export function lastTeamActivity(a: { submittedAt: Date | null; createdAt: Date; statusChanges: { createdAt: Date }[]; comments: { createdAt: Date }[]; teamMessages: { createdAt: Date }[] }) {
  const times = [a.submittedAt ?? a.createdAt, a.statusChanges[0]?.createdAt, a.comments[0]?.createdAt, a.teamMessages[0]?.createdAt].filter((d): d is Date => !!d);
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

export async function collectDailySummary(db: PrismaClient, opts: { now?: Date; staleDays: number; escalateDays: number; closeDays?: number }): Promise<DailySummary> {
  const now = opts.now ?? new Date();
  const user = { select: { globalName: true, username: true } } as const;
  const userAndPos = { user, position: { select: { title: true } }, claimedBy: user } as const;

  const [active, withdrawn, probation] = await Promise.all([
    db.application.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      include: {
        ...userAndPos,
        statusChanges: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        comments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        messages: {
          where: { direction: { in: ["TEAM_TO_APPLICANT", "APPLICANT_TO_TEAM"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { direction: true, createdAt: true },
        },
      },
      orderBy: { submittedAt: "asc" },
    }),
    db.application.findMany({
      where: {
        status: "WITHDRAWN",
        withdrawnInReview: true,
        decidedAt: { gte: new Date(now.getTime() - FOLLOW_UP_DAYS * DAY) },
        OR: [{ withdrawAckAt: null }, { withdrawAckAt: { isSet: false } }],
      },
      include: userAndPos,
      orderBy: { decidedAt: "asc" },
    }),
    db.application.findMany({
      where: { status: "ACCEPTED", probationUntil: { gte: now, lt: new Date(now.getTime() + 3 * DAY) } },
      include: userAndPos,
      orderBy: { probationUntil: "asc" },
    }),
  ]);

  // Letzte Team-Nachricht separat (die letzte Nachricht insgesamt kann vom Bewerber sein)
  const teamMsgs = active.length
    ? await db.message.findMany({
        where: { applicationId: { in: active.map((a) => a.id) }, direction: "TEAM_TO_APPLICANT" },
        orderBy: { createdAt: "desc" },
        select: { applicationId: true, createdAt: true },
      })
    : [];
  const lastTeamMsg = new Map<string, Date>();
  for (const m of teamMsgs) if (!lastTeamMsg.has(m.applicationId)) lastTeamMsg.set(m.applicationId, m.createdAt);

  const item = (a: (typeof active)[number] | (typeof withdrawn)[number] | (typeof probation)[number], at: Date): SummaryItem => ({
    id: a.id,
    publicId: a.publicId ?? a.id.slice(-6),
    name: nameOf(a.user) ?? "Unbekannt",
    position: a.position.title,
    claimer: nameOf(a.claimedBy),
    claimerId: a.claimedById,
    at,
  });

  const endOfDay = endOfBerlinDay(now);
  const interviews: SummaryItem[] = [];
  const waiting: SummaryItem[] = [];
  const stale: SummaryItem[] = [];
  const escalations: SummaryItem[] = [];
  const noReply: SummaryItem[] = [];
  const closeBefore = now.getTime() - (opts.closeDays ?? 7) * DAY;

  for (const a of active) {
    // Rückfrage mit Frist abgelaufen → Vorschlag „schließen“ (statt „liegengeblieben“)
    if (a.awaitingReplySince && a.awaitingReplySince.getTime() <= closeBefore) {
      noReply.push(item(a, a.awaitingReplySince));
      continue;
    }
    if (a.status === "INTERVIEW" && a.interviewAt && a.interviewAt >= new Date(now.getTime() - 3_600_000) && a.interviewAt < endOfDay) {
      interviews.push(item(a, a.interviewAt));
    }
    const last = a.messages[0];
    if (last?.direction === "APPLICANT_TO_TEAM") {
      waiting.push(item(a, last.createdAt));
      continue; // steht schon in „Wartet auf Antwort“
    }
    if (a.status === "INTERVIEW") continue; // hat einen eigenen Ablauf (Termin)
    const tm = lastTeamMsg.get(a.id);
    const activity = lastTeamActivity({ ...a, teamMessages: tm ? [{ createdAt: tm }] : [] });
    const idle = (now.getTime() - activity.getTime()) / DAY;
    if (idle >= opts.staleDays) stale.push(item(a, activity));
    if (idle >= opts.escalateDays) escalations.push(item(a, activity));
  }
  // Unbeantwortete Nachrichten, die schon zu lange warten, gehen ebenfalls an die Leitung
  for (const w of waiting) if ((now.getTime() - w.at.getTime()) / DAY >= opts.escalateDays) escalations.push(w);

  interviews.sort((x, y) => x.at.getTime() - y.at.getTime());
  waiting.sort((x, y) => x.at.getTime() - y.at.getTime());
  stale.sort((x, y) => x.at.getTime() - y.at.getTime());
  escalations.sort((x, y) => x.at.getTime() - y.at.getTime());

  return {
    date: todayBerlin(now),
    open: active.length,
    newSince: active.filter((a) => a.submittedAt && now.getTime() - a.submittedAt.getTime() < DAY).length,
    unclaimed: active.filter((a) => !a.claimedById).length,
    dmProblems: active.filter((a) => a.confirmationDmStatus === "DM_CLOSED" || a.confirmationDmStatus === "FAILED").length,
    interviews,
    waiting,
    stale,
    withdrawals: withdrawn.map((a) => item(a, a.decidedAt ?? a.updatedAt)),
    probation: probation.map((a) => item(a, a.probationUntil!)),
    leftGuild: active.filter((a) => a.guildLeftNotifiedAt).map((a) => item(a, a.guildLeftNotifiedAt!)),
    noReply,
    escalations,
    staleDays: opts.staleDays,
    escalateDays: opts.escalateDays,
  };
}

export type SummaryResult =
  | { posted: true; jobIds: string[]; summary: DailySummary; escalated: boolean }
  | { posted: false; reason: string; summary?: DailySummary };

/**
 * Übersicht posten. `force` (Admin-Knopf) postet auch, wenn heute schon gepostet
 * wurde oder nichts ansteht.
 */
export async function postDailySummary(db: PrismaClient, opts: { now?: Date; force?: boolean } = {}): Promise<SummaryResult> {
  const s = await getSettings();
  if (!s["discord.dailySummaryEnabled"] && !opts.force) return { posted: false, reason: "Die Team-Übersicht ist in den Einstellungen aus." };
  const channelId = s["discord.summaryChannelId"];
  if (!channelId) return { posted: false, reason: "Für die Team-Übersicht ist kein Kanal eingetragen." };

  const now = opts.now ?? new Date();
  const key = `summary:${todayBerlin(now)}`;
  if (!opts.force && (await db.setting.findUnique({ where: { key }, select: { key: true } }))) {
    return { posted: false, reason: "Heute wurde schon gepostet." };
  }

  const summary = await collectDailySummary(db, { now, staleDays: s["team.staleDays"], escalateDays: s["team.escalateDays"], closeDays: s["followup.closeDays"] });
  if (!opts.force && isQuiet(summary)) {
    await db.setting.create({ data: { key, value: { at: now.toISOString(), quiet: true } } }).catch(() => null);
    return { posted: false, reason: "Nichts zu tun – heute kein Post.", summary };
  }

  const lead = s["discord.leadChannelId"];
  const escalation = lead ? buildEscalationMessage(summary, publicEnv.appUrl) : null;
  const jobIds = await db
    .$transaction(async (tx) => {
      // Markierung zuerst: läuft der Cron doppelt, gewinnt nur eine Instanz
      if (opts.force) await tx.setting.upsert({ where: { key }, create: { key, value: { at: now.toISOString() } }, update: { value: { at: now.toISOString(), forced: true } } });
      else await tx.setting.create({ data: { key, value: { at: now.toISOString() } } });
      const ids = [(await enqueue({ type: "CHANNEL_MESSAGE", kind: "summary", channelId, message: buildDailySummaryMessage(summary, publicEnv.appUrl) }, { tx })).id];
      if (escalation && lead) ids.push((await enqueue({ type: "CHANNEL_MESSAGE", kind: "summary", channelId: lead, message: escalation }, { tx })).id);
      return ids;
    })
    .catch(() => null);
  if (!jobIds) return { posted: false, reason: "Heute wurde schon gepostet." };

  await runOutbox({ ids: jobIds }).catch((e) => console.error("[summary]", e));
  return { posted: true, jobIds, summary, escalated: !!escalation };
}

/**
 * Persönliche Morgen-DM an jeden Betreuer, bei dessen geclaimten Bewerbungen etwas
 * ansteht. Keine DM ohne offene Punkte; abschaltbar global (Einstellungen) und pro
 * Person (Konto). Pro Person und Tag höchstens eine DM (Setting `digest:<Tag>:<User>`).
 */
export async function sendPersonalDigests(db: PrismaClient, opts: { now?: Date; summary?: DailySummary; deadline?: number } = {}) {
  const s = await getSettings();
  if (!s["team.personalDigestEnabled"]) return 0;
  const now = opts.now ?? new Date();
  // Schon gesammelte Übersicht wiederverwenden (Morgen-Cron) – sonst selbst sammeln
  const summary = opts.summary ?? (await collectDailySummary(db, { now, staleDays: s["team.staleDays"], escalateDays: s["team.escalateDays"], closeDays: s["followup.closeDays"] }));
  const groups = groupByClaimer(summary);
  if (!groups.size) return 0;
  const users = await db.user.findMany({
    where: { id: { in: [...groups.keys()] }, isTeam: true, digestOptOut: false },
    select: { id: true, discordId: true, globalName: true, username: true },
  });
  const date = todayBerlin(now);
  const ids: string[] = [];
  for (const u of users) {
    const key = `digest:${date}:${u.id}`;
    // Eindeutiger Key: läuft der Cron doppelt, bekommt trotzdem jeder nur eine DM
    const created = await db.setting.create({ data: { key, value: { at: now.toISOString() } } }).then(() => true, () => false);
    if (!created) continue;
    const job = await enqueue({
      type: "DM",
      discordUserId: u.discordId,
      purpose: "digest",
      message: buildPersonalDigestMessage(u.globalName || u.username, groups.get(u.id)!, s["team.staleDays"], publicEnv.appUrl),
    });
    ids.push(job.id);
  }
  // Alte Markierungen aufräumen (älter als eine Woche)
  await db.setting.deleteMany({ where: { key: { startsWith: "digest:", lt: `digest:${todayBerlin(new Date(now.getTime() - 7 * DAY))}` } } }).catch(() => {});
  if (ids.length) await runOutboxAll(ids, { deadline: opts.deadline }).catch((e) => console.error("[digest]", e));
  return ids.length;
}
