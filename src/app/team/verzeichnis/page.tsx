import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar, formatDay } from "@/components/ui";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/time";
import { readMentorFeedback } from "@/lib/team/probation";
import { visiblePositionFilter, viewerOf } from "@/lib/team/visibility";

export const metadata: Metadata = { title: "Team-Verzeichnis" };

export default function DirectoryPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Verzeichnis</p>
        <h1 className="nv-headline text-4xl mt-2">
          Wer ist <em>dabei?</em>
        </h1>
        <p className="text-sm text-muted mt-2">Alle über das Portal aufgenommenen Teammitglieder – mit Stelle, Probezeit und Pate. Nur fürs Team sichtbar.</p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <Directory />
      </Suspense>
    </div>
  );
}

async function Directory() {
  const { user, access } = await requireTeam();
  const now = nowMs();
  const members = await db.application.findMany({
    // Nur das Team – angenommene Whitelist-/Beta-Bewerbungen sind keine Teammitglieder
    where: { status: "ACCEPTED", isTest: { not: true }, position: { type: { key: "team" } }, ...(await visiblePositionFilter(viewerOf(user, access))) },
    orderBy: { decidedAt: "desc" },
    take: 500,
    select: {
      id: true,
      decidedAt: true,
      probationUntil: true,
      probationResult: true,
      mentorId: true,
      mentorFeedback: true,
      user: { select: { discordId: true, avatar: true, globalName: true, username: true } },
      position: { select: { id: true, title: true, sortOrder: true } },
    },
  });
  const mentorIds = [...new Set(members.map((m) => m.mentorId).filter((x): x is string => !!x))];
  const mentors = new Map((await db.user.findMany({ where: { id: { in: mentorIds } }, select: { id: true, globalName: true, username: true } })).map((u) => [u.id, u.globalName || u.username]));

  const active = members.filter((m) => m.probationResult !== "ENDED");
  const ended = members.filter((m) => m.probationResult === "ENDED");
  const groups = new Map<string, { title: string; sort: number; list: typeof active }>();
  for (const m of active) {
    const g = groups.get(m.position.id) ?? { title: m.position.title, sort: m.position.sortOrder, list: [] };
    g.list.push(m);
    groups.set(m.position.id, g);
  }

  if (!members.length) return <p className="text-sm text-muted">Noch niemand über das Portal aufgenommen.</p>;

  const status = (m: (typeof members)[number]) => {
    if (m.probationResult === "PASSED") return <span className="nv-pill nv-tone-success !text-[0.7rem]">Fest im Team</span>;
    if (m.probationUntil && m.probationUntil.getTime() < now) return <span className="nv-pill nv-tone-warn !text-[0.7rem]">Probezeit abgelaufen – entscheiden</span>;
    if (m.probationUntil) return <span className="nv-pill !text-[0.7rem]">Probezeit bis {formatDay(m.probationUntil)}</span>;
    return <span className="nv-pill !text-[0.7rem]">Im Team</span>;
  };

  return (
    <div className="space-y-6">
      {[...groups.values()]
        .sort((a, b) => a.sort - b.sort)
        .map((g) => (
          <section key={g.title} className="nv-card overflow-hidden">
            <h2 className="px-5 py-3 border-b border-line font-semibold flex items-center justify-between">
              {g.title} <span className="text-xs text-muted font-normal">{g.list.length}</span>
            </h2>
            <ul className="divide-y divide-[var(--nv-border)]">
              {g.list.map((m) => {
                const fb = readMentorFeedback(m.mentorFeedback);
                return (
                  <li key={m.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                    <Avatar discordId={m.user.discordId} avatar={m.user.avatar} size={32} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/team/bewerbungen/${m.id}`} className="font-medium nv-link">
                        {m.user.globalName || m.user.username}
                      </Link>
                      <p className="text-xs text-muted">
                        dabei seit {m.decidedAt ? formatDay(m.decidedAt) : "–"}
                        {m.mentorId && ` · Pate: ${mentors.get(m.mentorId) ?? "?"}`}
                        {fb && (fb.rating === "good" ? " · 👍 läuft gut" : " · 🆘 braucht Hilfe")}
                      </p>
                    </div>
                    {status(m)}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      {ended.length > 0 && (
        <details className="nv-card px-5 py-3">
          <summary className="cursor-pointer text-sm text-muted">Nicht mehr im Team ({ended.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {ended.map((m) => (
              <li key={m.id}>
                <Link href={`/team/bewerbungen/${m.id}`} className="nv-link">
                  {m.user.globalName || m.user.username}
                </Link>{" "}
                <span className="text-xs text-muted">· {m.position.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
