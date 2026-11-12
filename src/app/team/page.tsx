import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Suspense } from "react";
import { ArrowRight, ArrowUUpLeft, CalendarCheck, Megaphone, ChatCircleDots, DiscordLogo, HandPointing, ShieldWarning, UsersThree } from "@phosphor-icons/react/ssr";
import { Avatar, Notice, Stat, StatusBadge, formatDay, formatDayTime, formatRelative } from "@/components/ui";
import { publishedEntries, versionLabel } from "@/lib/changelog";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { AckWithdrawalButton } from "@/components/team/AckWithdrawalButton";
import { requireTeam } from "@/lib/auth/session";
import { viewerOf, visiblePositionFilter } from "@/lib/team/visibility";
import { teamWorkload } from "@/lib/team/assign";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, FOLLOW_UP_DAYS } from "@/lib/applications/status";
import { daysAgo } from "@/lib/time";
import { after } from "next/server";

export default function TeamHome({ searchParams }: PageProps<"/team">) {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[32rem]" />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: Pick<PageProps<"/team">, "searchParams">) {
  const { user, access } = await requireTeam();
  const sp = await searchParams;
  const weekAgo = daysAgo(7);
  // Zuständigkeit pro Stelle: nur eigene Stellen zählen/zeigen
  const vis = await visiblePositionFilter(viewerOf(user, access));

  const [open, newWeek, interviews, unreadReplies, dmFailed, needsMyVote, recent, withdrawn] = await Promise.all([
    db.application.count({ where: { ...vis, status: { in: ACTIVE_STATUSES } } }),
    db.application.count({ where: { ...vis, submittedAt: { gte: weekAgo } } }),
    db.application.findMany({
      where: { ...vis, status: "INTERVIEW", interviewAt: { gte: daysAgo(1 / 24) } },
      include: { user: true, position: true },
      orderBy: { interviewAt: "asc" },
      take: 5,
    }),
    db.application.findMany({
      where: { ...vis, messages: { some: { direction: "APPLICANT_TO_TEAM", readAt: null } } },
      include: { user: true, position: true },
      take: 5,
    }),
    db.application.count({ where: { ...vis, status: { in: ACTIVE_STATUSES }, confirmationDmStatus: { in: ["DM_CLOSED", "FAILED"] } } }),
    db.application.findMany({
      where: { ...vis, status: { in: ACTIVE_STATUSES }, votes: { none: { userId: user.id } } },
      include: { user: true, position: true },
      orderBy: { submittedAt: "asc" },
      take: 6,
    }),
    db.application.findMany({
      where: { ...vis, status: { not: "DRAFT" } },
      include: { user: true, position: true },
      orderBy: { submittedAt: "desc" },
      take: 6,
    }),
    db.application.findMany({
      where: {
        status: "WITHDRAWN",
        withdrawnInReview: true,
        decidedAt: { gte: daysAgo(FOLLOW_UP_DAYS) },
        // noch nicht bestätigt (Feld null oder bei älteren Einträgen gar nicht gesetzt)
        OR: [{ withdrawAckAt: null }, { withdrawAckAt: { isSet: false } }],
      },
      include: { user: true, position: true },
      orderBy: { decidedAt: "desc" },
      take: 6,
    }),
  ]);

  const workload = await teamWorkload(db);
  const maxLoad = Math.max(1, ...workload.map((w) => w.open));
  const latest = publishedEntries()[0];
  // Bewerber noch auf dem Discord? Höchstens alle 15 Minuten, nach der Antwort
  after(async () => {
    const { scanIfDue } = await import("@/lib/applications/guild-watch");
    await scanIfDue().catch((e) => console.error("[guild-watch]", e));
  });

  return (
    <div className="space-y-8">
      <LiveRefresh scope="team-list" intervalMs={8000} />
      <header>
        <p className="nv-label">NORDVERKEHR // TEAM</p>
        <h1 className="nv-headline text-4xl sm:text-5xl mt-2 break-words">
          Moin, {user.globalName || user.username}. <em>Was liegt an?</em>
        </h1>
      </header>

      {sp.hinweis === "admin" && (
        <Notice tone="warn" icon={ShieldWarning} title="Nur für Admins">
          Dieser Bereich braucht die Admin-Rolle auf dem Discord-Server.
        </Notice>
      )}
      {!process.env.ADMIN_ROLE_ID && access.isTeam && (
        <Notice tone="info" icon={ShieldWarning} title="ADMIN_ROLE_ID ist nicht gesetzt">
          Ohne Admin-Rolle kann niemand Einstellungen, Positionen oder das KI-Budget ändern.
        </Notice>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Offen" value={open} hint="eingereicht, in Prüfung, Gespräch" />
        <Stat label="Neu (7 Tage)" value={newWeek} />
        <Stat label="Gespräche" value={interviews.length} hint="anstehend" />
        <Stat label="DM-Probleme" value={dmFailed} hint="Bestätigung nicht zugestellt" />
      </div>

      {latest && (
        <section className="nv-card p-5 flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-soft text-red-text">
            <Megaphone size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="nv-mono">Neu im Portal · {formatDay(new Date(`${latest.date}T12:00:00`))}</p>
            <h2 className="font-semibold mt-0.5">
              {versionLabel(latest)}
              {latest.title && <span className="font-normal text-muted"> · {latest.title}</span>}
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-fg-2 list-disc pl-5 marker:text-red-text">
              {latest.items.slice(0, 3).map((it, k) => (
                <li key={k} className="line-clamp-2">
                  <DiscordMarkdown text={it.text} className="inline [&_strong]:text-fg" />
                </li>
              ))}
            </ul>
          </div>
          <Link href="/team/changelog" className="nv-btn nv-btn-ghost nv-btn-sm self-start">
            Changelog <ArrowRight size={13} aria-hidden />
          </Link>
        </section>
      )}

      {withdrawn.length > 0 && (
        <section className="nv-card p-5 border-[color-mix(in_srgb,var(--tone-warn)_40%,transparent)]">
          <header className="mb-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <ArrowUUpLeft size={18} className="text-[var(--tone-warn)]" aria-hidden /> Während der Bearbeitung zurückgezogen
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Der Bewerber kann {FOLLOW_UP_DAYS} Tage lang noch auf Rückfragen antworten. Ist alles geklärt, bestätige den Rückzug.
            </p>
          </header>
          <ul className="space-y-1">
            {withdrawn.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Link href={`/team/bewerbungen/${a.id}`} className="flex flex-1 min-w-0 items-start gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-card-hover">
                  <Avatar discordId={a.user.discordId} avatar={a.user.avatar} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">
                      {a.user.globalName || a.user.username} <span className="text-xs font-normal text-muted">· {a.position.title} · {a.publicId}</span>
                    </span>
                    <span className="block text-xs text-fg-2 line-clamp-2">„{a.withdrawReason ?? "–"}“</span>
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">{a.decidedAt ? formatRelative(a.decidedAt) : ""}</span>
                </Link>
                <AckWithdrawalButton applicationId={a.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Wartet auf deine Stimme" icon={<HandPointing size={18} aria-hidden />} href="/team/bewerbungen?status=SUBMITTED&status=IN_REVIEW">
          {needsMyVote.length === 0 ? (
            <p className="text-sm text-muted">Alles abgestimmt. Stark.</p>
          ) : (
            needsMyVote.map((a) => <AppRow key={a.id} a={a} meta={a.submittedAt ? formatRelative(a.submittedAt) : ""} />)
          )}
        </Panel>
        <Panel title="Anstehende Gespräche" icon={<CalendarCheck size={18} aria-hidden />} href="/team/bewerbungen?status=INTERVIEW">
          {interviews.length === 0 ? (
            <p className="text-sm text-muted">Keine Gespräche geplant.</p>
          ) : (
            interviews.map((a) => <AppRow key={a.id} a={a} meta={formatDayTime(a.interviewAt)} />)
          )}
        </Panel>
        <Panel title="Neue Antworten von Bewerbern" icon={<ChatCircleDots size={18} aria-hidden />} href="/team/bewerbungen?flag=antwort">
          {unreadReplies.length === 0 ? (
            <p className="text-sm text-muted">Keine ungelesenen Antworten.</p>
          ) : (
            unreadReplies.map((a) => <AppRow key={a.id} a={a} meta="neue Nachricht" />)
          )}
        </Panel>
        <Panel title="Zuletzt eingegangen" icon={<DiscordLogo size={18} aria-hidden />} href="/team/bewerbungen">
          {recent.map((a) => (
            <AppRow key={a.id} a={a} meta={a.submittedAt ? formatRelative(a.submittedAt) : ""} status />
          ))}
        </Panel>
        <Panel title="Auslastung im Team" icon={<UsersThree size={18} aria-hidden />} href="/team/bewerbungen?status=SUBMITTED&status=IN_REVIEW&status=INTERVIEW">
          {workload.length === 0 ? (
            <p className="text-sm text-muted">Noch niemand aktiv.</p>
          ) : (
            <ul className="space-y-2" data-testid="workload">
              {workload.map((w) => (
                <li key={w.userId} className="grid grid-cols-[minmax(0,140px)_1fr_28px] items-center gap-3 text-sm">
                  <span className={`truncate ${w.userId === user.id ? "font-semibold" : "text-fg-2"}`}>{w.name}</span>
                  <span className="h-2 rounded-r-[4px] bg-red/70" style={{ width: `${(w.open / maxLoad) * 100}%`, minWidth: w.open ? 4 : 0 }} aria-hidden />
                  <span className="tabular-nums text-right">{w.open}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted mt-3">Offene Bewerbungen pro Betreuer (aktiv in den letzten 30 Tagen).</p>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, icon, href, children }: { title: string; icon: React.ReactNode; href: string; children: React.ReactNode }) {
  return (
    <section className="nv-card p-5">
      <header className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="text-red-text">{icon}</span> {title}
        </h2>
        <Link href={href} className="nv-btn nv-btn-quiet nv-btn-sm">
          Alle <ArrowRight size={13} aria-hidden />
        </Link>
      </header>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function AppRow({
  a,
  meta,
  status,
}: {
  a: { id: string; publicId: string | null; status: import("@prisma/client").ApplicationStatus; user: { discordId: string; avatar: string | null; globalName: string | null; username: string }; position: { title: string } };
  meta: string;
  status?: boolean;
}) {
  return (
    <li>
      <Link href={`/team/bewerbungen/${a.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-card-hover">
        <Avatar discordId={a.user.discordId} avatar={a.user.avatar} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate">{a.user.globalName || a.user.username}</span>
          <span className="block text-xs text-muted truncate">
            {a.position.title} · {a.publicId}
          </span>
        </span>
        {status ? <StatusBadge status={a.status} className="!text-[0.65rem]" /> : <span className="text-xs text-muted whitespace-nowrap">{meta}</span>}
      </Link>
    </li>
  );
}
