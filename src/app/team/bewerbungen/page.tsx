import type { Metadata } from "next";
import { LiveRefresh } from "@/components/LiveRefresh";
import Link from "next/link";
import { Suspense } from "react";
import { ChatCircleDots, DownloadSimple, Kanban, Table, WarningCircle } from "@phosphor-icons/react/ssr";
import { Avatar, EmptyState, StatusBadge, cn, formatDay, formatRelative } from "@/components/ui";
import { ApplicationFiltersBar } from "@/components/team/ApplicationFiltersBar";
import { KanbanBoard } from "@/components/team/KanbanBoard";
import { TagPills } from "@/components/team/TagPills";
import { QuizPill } from "@/components/team/QuizPill";
import { TestPill } from "@/components/team/TestPill";
import { testScenarioLabel } from "@/lib/setup/test-applications";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PAGE_SIZE, filtersToQuery, listApplications, parseFilters, voteSummary } from "@/lib/team/queries";
import type { ApplicationFlag } from "@/lib/applications/flags";

export const metadata: Metadata = { title: "Bewerbungen" };

export default function ApplicationsPage({ searchParams }: PageProps<"/team/bewerbungen">) {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[36rem]" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/team/bewerbungen">, "searchParams">) {
  await requireTeam();
  const f = parseFilters(await searchParams);
  const [positions, { rows, total, hits }] = await Promise.all([
    db.position.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, title: true } }),
    listApplications(f, { all: f.view === "board" }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <LiveRefresh scope="team-list" intervalMs={8000} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nv-label">Team // Bewerbungen</p>
          <h1 className="nv-headline text-4xl mt-2">
            Alle <em>Bewerbungen.</em>
          </h1>
          <p className="text-sm text-muted mt-1">
            {total} Treffer{f.text ? <> mit „{f.text}“ in den Antworten</> : null}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Ansicht">
            <Link
              href={`?${filtersToQuery(f, { view: "tabelle", page: 1 })}`}
              aria-current={f.view === "tabelle" ? "page" : undefined}
              className={cn("nv-btn nv-btn-sm", f.view === "tabelle" ? "bg-red-soft text-fg" : "nv-btn-quiet")}
            >
              <Table size={15} aria-hidden /> Tabelle
            </Link>
            <Link
              href={`?${filtersToQuery(f, { view: "board", page: 1 })}`}
              aria-current={f.view === "board" ? "page" : undefined}
              className={cn("nv-btn nv-btn-sm", f.view === "board" ? "bg-red-soft text-fg" : "nv-btn-quiet")}
            >
              <Kanban size={15} aria-hidden /> Board
            </Link>
          </div>
          <a href={`/api/team/export?${filtersToQuery(f, { page: 1 })}`} className="nv-btn nv-btn-ghost nv-btn-sm">
            <DownloadSimple size={15} aria-hidden /> CSV
          </a>
        </div>
      </header>

      <ApplicationFiltersBar positions={positions} current={f} />

      {rows.length === 0 ? (
        <EmptyState title="Keine Bewerbungen gefunden">Passe die Filter an oder setze sie zurück.</EmptyState>
      ) : f.view === "board" ? (
        <KanbanBoard
          key={rows.map((r) => r.id + r.status).join(",")}
          items={rows.map((r) => ({
            id: r.id,
            publicId: r.publicId ?? "",
            status: r.status,
            name: r.user.globalName || r.user.username,
            discordId: r.user.discordId,
            avatar: r.user.avatar,
            position: r.position.title,
            submittedAt: r.submittedAt?.toISOString() ?? null,
            votes: voteSummary(r.votes),
            flags: (r.flags as unknown as ApplicationFlag[]).length,
            unread: r._count.messages,
            tags: r.aiTags,
            isTest: r.isTest,
            testScenario: testScenarioLabel(r.testScenario),
            quiz: r.quizTotal ? { correct: r.quizCorrect, total: r.quizTotal, min: r.position.quizMinScore } : null,
          }))}
        />
      ) : (
        <>
          <div className="nv-card overflow-hidden">
            <div className="nv-scroll-x">
              <table className="nv-table w-full text-sm min-w-[880px]">
                <thead>
                  <tr>
                    <th scope="col">Bewerber</th>
                    <th scope="col">Position</th>
                    <th scope="col">Status</th>
                    <th scope="col">Eingang</th>
                    <th scope="col">Stimmen</th>
                    <th scope="col">Betreut von</th>
                    <th scope="col">
                      <span className="sr-only">Hinweise</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const v = voteSummary(r.votes);
                    const flags = r.flags as unknown as ApplicationFlag[];
                    const dmIssue = r.confirmationDmStatus === "DM_CLOSED" || r.confirmationDmStatus === "FAILED";
                    return (
                      <tr key={r.id} className="relative">
                        <td>
                          <Link href={`/team/bewerbungen/${r.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                            <Avatar discordId={r.user.discordId} avatar={r.user.avatar} size={34} />
                            <span className="min-w-0">
                              <span className="block font-medium truncate">{r.user.globalName || r.user.username}</span>
                              <span className="block text-xs text-muted font-mono">{r.publicId}</span>
                              {r.aiTags.length > 0 && (
                                <span className="mt-1 block">
                                  <TagPills tags={r.aiTags} />
                                </span>
                              )}
                              {hits?.get(r.id)?.map((h, i) => (
                                <span key={i} className="mt-1 block text-xs text-fg-2 max-w-[28rem] whitespace-normal">
                                  <span className="text-muted">{h.label}: </span>
                                  {h.before}
                                  <mark className="bg-red-soft text-fg rounded-sm">{h.match}</mark>
                                  {h.after}
                                </span>
                              ))}
                            </span>
                          </Link>
                        </td>
                        <td className="text-fg-2">{r.position.title}</td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="text-fg-2 whitespace-nowrap" title={formatDay(r.submittedAt)}>
                          {r.submittedAt ? formatRelative(r.submittedAt) : "–"}
                        </td>
                        <td className="whitespace-nowrap tabular-nums">
                          <span className="text-[var(--tone-success)]">{v.pro}</span>
                          <span className="text-faint"> / </span>
                          <span className="text-[var(--tone-danger)]">{v.contra}</span>
                          <span className="text-faint"> / </span>
                          <span className="text-muted">{v.abstain}</span>
                        </td>
                        <td>
                          {r.claimedBy ? (
                            <span className="flex items-center gap-2 text-fg-2" title="Betreut von">
                              <Avatar discordId={r.claimedBy.discordId} avatar={r.claimedBy.avatar} size={22} />
                              <span className="truncate max-w-[9rem]">{r.claimedBy.globalName || r.claimedBy.username}</span>
                            </span>
                          ) : (
                            <span className="text-faint">–</span>
                          )}
                        </td>
                        <td>
                          <span className="flex items-center gap-2 justify-end">
                            {r._count.messages > 0 && (
                              <span className="nv-pill nv-pill-red !py-0.5 !px-2" title="Neue Antwort vom Bewerber">
                                <ChatCircleDots size={13} aria-hidden /> {r._count.messages}
                              </span>
                            )}
                            {dmIssue && (
                              <span className="nv-pill nv-tone-danger !py-0.5 !px-2" title="Bestätigungs-DM fehlgeschlagen">
                                DM
                              </span>
                            )}
                            {r.isTest && <TestPill scenario={testScenarioLabel(r.testScenario)} />}
                            <QuizPill correct={r.quizCorrect} total={r.quizTotal} min={r.position.quizMinScore} />
                            {flags.length > 0 && (
                              <span className="nv-pill nv-tone-warn !py-0.5 !px-2" title={flags.map((x) => x.message).join("\n")}>
                                <WarningCircle size={13} aria-hidden /> {flags.length}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {pages > 1 && (
            <nav className="flex items-center justify-between text-sm" aria-label="Seiten">
              <span className="text-muted">
                Seite {f.page} von {pages}
              </span>
              <div className="flex gap-2">
                {f.page > 1 && (
                  <Link className="nv-btn nv-btn-ghost nv-btn-sm" href={`?${filtersToQuery(f, { page: f.page - 1 })}`}>
                    Zurück
                  </Link>
                )}
                {f.page < pages && (
                  <Link className="nv-btn nv-btn-ghost nv-btn-sm" href={`?${filtersToQuery(f, { page: f.page + 1 })}`}>
                    Weiter
                  </Link>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
