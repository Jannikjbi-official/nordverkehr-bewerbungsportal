import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarCheck, ChatCircleDots, DiscordLogo, HandPointing, ShieldWarning } from "@phosphor-icons/react/ssr";
import { Avatar, Notice, Stat, StatusBadge, formatDayTime, formatRelative } from "@/components/ui";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES } from "@/lib/applications/status";
import { daysAgo } from "@/lib/time";

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

  const [open, newWeek, interviews, unreadReplies, dmFailed, needsMyVote, recent] = await Promise.all([
    db.application.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    db.application.count({ where: { submittedAt: { gte: weekAgo } } }),
    db.application.findMany({
      where: { status: "INTERVIEW", interviewAt: { gte: daysAgo(1 / 24) } },
      include: { user: true, position: true },
      orderBy: { interviewAt: "asc" },
      take: 5,
    }),
    db.application.findMany({
      where: { messages: { some: { direction: "APPLICANT_TO_TEAM", readAt: null } } },
      include: { user: true, position: true },
      take: 5,
    }),
    db.application.count({ where: { status: { in: ACTIVE_STATUSES }, confirmationDmStatus: { in: ["DM_CLOSED", "FAILED"] } } }),
    db.application.findMany({
      where: { status: { in: ACTIVE_STATUSES }, votes: { none: { userId: user.id } } },
      include: { user: true, position: true },
      orderBy: { submittedAt: "asc" },
      take: 6,
    }),
    db.application.findMany({
      where: { status: { not: "DRAFT" } },
      include: { user: true, position: true },
      orderBy: { submittedAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <div className="space-y-8">
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
