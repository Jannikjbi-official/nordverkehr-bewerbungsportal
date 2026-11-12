import type { Metadata } from "next";
import Link from "next/link";
import { HelpLink } from "@/components/team/HelpLink";
import { Suspense } from "react";
import { Stat, cn } from "@/components/ui";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatUsd, monthStart } from "@/lib/ai/config";
import { daysAgo } from "@/lib/time";
import { REJECTION_CATEGORIES, aggregateRejections } from "@/lib/applications/rejection";

export const metadata: Metadata = { title: "Statistiken" };

const RANGES = [
  { key: "30", label: "30 Tage", days: 30 },
  { key: "90", label: "90 Tage", days: 90 },
  { key: "365", label: "12 Monate", days: 365 },
  { key: "alle", label: "Gesamt", days: null },
] as const;

export default function StatsPage({ searchParams }: PageProps<"/team/statistiken">) {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Statistiken</p>
        <h1 className="nv-headline text-4xl mt-2">
          Zahlen, <em>ehrlich.</em>
        </h1>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-[36rem]" />}>
        <Stats searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const days = (ms: number) => ms / 86_400_000;
const fmtDays = (d: number | null) => (d === null ? "–" : `${d.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tage`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function Stats({ searchParams }: Pick<PageProps<"/team/statistiken">, "searchParams">) {
  await requireTeam();
  const { zeitraum } = await searchParams;
  const range = RANGES.find((r) => r.key === zeitraum) ?? RANGES[1];
  const since = range.days ? daysAgo(range.days) : null;

  const [apps, positions, aiMonth, feedback] = await Promise.all([
    db.application.findMany({
      where: { status: { not: "DRAFT" }, ...(since ? { submittedAt: { gte: since } } : {}) },
      select: { id: true, status: true, positionId: true, submittedAt: true, decidedAt: true, firstReviewedAt: true, rejectionCategory: true },
    }),
    db.position.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, title: true } }),
    db.aiUsage.aggregate({ _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true }, _count: true, where: { createdAt: { gte: monthStart() } } }),
    db.feedback.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      include: { application: { select: { id: true, publicId: true, status: true, position: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  // Absagegründe: feste Kategorien + meistgenutzte Absage-Bausteine (gleicher Zeitraum)
  const rejections = aggregateRejections(apps);
  const rejectedIds = apps.filter((a) => a.status === "REJECTED").map((a) => a.id);
  const [rejectionTemplates, rejectionMsgs] = rejectedIds.length
    ? await Promise.all([
        db.messageTemplate.findMany({ where: { category: "ABLEHNUNG" }, select: { id: true, title: true } }),
        db.message.findMany({ where: { applicationId: { in: rejectedIds }, direction: "TEAM_TO_APPLICANT", NOT: { templateIds: { isEmpty: true } } }, select: { applicationId: true, templateIds: true } }),
      ])
    : [[], []];
  const tplTitle = new Map(rejectionTemplates.map((t) => [t.id, t.title]));
  // Pro Bewerbung jeden Baustein nur einmal zählen
  const tplUse = new Map<string, Set<string>>();
  for (const m of rejectionMsgs) for (const t of m.templateIds) if (tplTitle.has(t)) tplUse.set(t, (tplUse.get(t) ?? new Set()).add(m.applicationId));
  const topTemplates = [...tplUse.entries()].map(([id, set]) => ({ title: tplTitle.get(id)!, count: set.size })).sort((a, b) => b.count - a.count).slice(0, 8);
  const posTitle = new Map(positions.map((p) => [p.id, p.title]));
  const usedCats = REJECTION_CATEGORIES.filter((c) => rejections.byCategory.some((x) => x.key === c.key));
  const maxCat = Math.max(1, ...rejections.byCategory.map((c) => c.count));

  const fbAvg = feedback.length ? Math.round((feedback.reduce((n, f) => n + f.rating, 0) / feedback.length) * 10) / 10 : null;
  const fbDist = [5, 4, 3, 2, 1].map((n) => ({ n, count: feedback.filter((f) => f.rating === n).length }));

  const decided = apps.filter((a) => a.status === "ACCEPTED" || a.status === "REJECTED");
  const accepted = apps.filter((a) => a.status === "ACCEPTED").length;
  const rate = decided.length ? Math.round((accepted / decided.length) * 100) : null;
  const processing = avg(decided.filter((a) => a.submittedAt && a.decidedAt).map((a) => days(a.decidedAt!.getTime() - a.submittedAt!.getTime())));
  const firstReview = avg(apps.filter((a) => a.submittedAt && a.firstReviewedAt).map((a) => days(a.firstReviewedAt!.getTime() - a.submittedAt!.getTime())));

  const perPosition = positions
    .map((p) => {
      const list = apps.filter((a) => a.positionId === p.id);
      const dec = list.filter((a) => a.status === "ACCEPTED" || a.status === "REJECTED");
      const acc = list.filter((a) => a.status === "ACCEPTED").length;
      return {
        title: p.title,
        total: list.length,
        accepted: acc,
        rejected: dec.length - acc,
        rate: dec.length ? Math.round((acc / dec.length) * 100) : null,
        processing: avg(dec.filter((a) => a.submittedAt && a.decidedAt).map((a) => days(a.decidedAt!.getTime() - a.submittedAt!.getTime()))),
      };
    })
    .filter((p) => p.total > 0 || range.days === null);
  const maxPos = Math.max(1, ...perPosition.map((p) => p.total));

  // Eingänge pro Woche (letzte 12 Wochen bzw. Zeitraum)
  const weeks = Math.min(range.days ? Math.ceil(range.days / 7) : 26, 26);
  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
  };
  const thisWeek = startOfWeek(new Date());
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const from = new Date(thisWeek.getTime() - (weeks - 1 - i) * 7 * 86_400_000);
    const to = new Date(from.getTime() + 7 * 86_400_000);
    return { from, count: apps.filter((a) => a.submittedAt && a.submittedAt >= from && a.submittedAt < to).length };
  });
  const maxWeek = Math.max(1, ...buckets.map((b) => b.count));
  const fmtWeek = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(d);

  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap gap-1.5" aria-label="Zeitraum">
        {RANGES.map((r) => (
          <Link key={r.key} href={`?zeitraum=${r.key}`} aria-current={r === range ? "page" : undefined} className={cn("nv-pill transition-colors", r === range ? "nv-pill-red" : "hover:text-fg")}>
            {r.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Bewerbungen" value={apps.length} hint={range.label} />
        <Stat label="Annahmequote" value={rate === null ? "–" : `${rate} %`} hint={`${accepted} von ${decided.length} entschieden`} />
        <Stat label="Ø Bearbeitung" value={fmtDays(processing)} hint="Eingang → Entscheidung" />
        <Stat label="Ø erste Sichtung" value={fmtDays(firstReview)} hint="Eingang → In Prüfung" />
      </div>

      <section className="nv-card p-5" aria-labelledby="weekly">
        <h2 id="weekly" className="font-semibold">Eingänge pro Woche</h2>
        <div className="mt-6 flex items-end gap-[2px] h-44" role="img" aria-label="Balkendiagramm: Eingänge pro Woche – Details in der Tabelle darunter">
          {buckets.map((b) => (
            <div key={b.from.toISOString()} className="group relative flex-1 h-full flex items-end">
              <div
                className="w-full rounded-t-[4px] bg-red/80 group-hover:bg-red transition-colors"
                style={{ height: `${Math.max(b.count ? 4 : 1, (b.count / maxWeek) * 100)}%`, opacity: b.count ? 1 : 0.25 }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-[var(--nv-shadow)] z-10">
                KW ab {fmtWeek(b.from)}: <strong>{b.count}</strong>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted border-t border-line pt-2">
          <span>ab {fmtWeek(buckets[0].from)}</span>
          <span>diese Woche</span>
        </div>
        <details className="mt-3">
          <summary className="text-xs text-muted cursor-pointer">Als Tabelle</summary>
          <table className="nv-table text-sm mt-2">
            <thead>
              <tr>
                <th scope="col">Woche ab</th>
                <th scope="col">Eingänge</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.from.toISOString()}>
                  <td>{fmtWeek(b.from)}</td>
                  <td className="tabular-nums">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="nv-card p-5" aria-labelledby="perpos">
        <h2 id="perpos" className="font-semibold">Nach Position</h2>
        <ul className="mt-5 space-y-3">
          {perPosition.map((p) => (
            <li key={p.title} className="grid grid-cols-[120px_1fr_40px] sm:grid-cols-[160px_1fr_40px] items-center gap-3 text-sm">
              <span className="truncate text-fg-2">{p.title}</span>
              <span className="h-3 rounded-r-[4px] bg-red/80" style={{ width: `${(p.total / maxPos) * 100}%`, minWidth: p.total ? 4 : 0 }} title={`${p.total} Bewerbungen`} />
              <span className="tabular-nums text-right">{p.total}</span>
            </li>
          ))}
        </ul>
        <div className="nv-scroll-x mt-6">
          <table className="nv-table w-full text-sm min-w-[520px]">
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Gesamt</th>
                <th scope="col">Angenommen</th>
                <th scope="col">Abgelehnt</th>
                <th scope="col">Quote</th>
                <th scope="col">Ø Bearbeitung</th>
              </tr>
            </thead>
            <tbody>
              {perPosition.map((p) => (
                <tr key={p.title}>
                  <td>{p.title}</td>
                  <td className="tabular-nums">{p.total}</td>
                  <td className="tabular-nums">{p.accepted}</td>
                  <td className="tabular-nums">{p.rejected}</td>
                  <td className="tabular-nums">{p.rate === null ? "–" : `${p.rate} %`}</td>
                  <td>{fmtDays(p.processing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="nv-card p-5" aria-labelledby="rej">
        <h2 id="rej" className="font-semibold">Häufigste Absagegründe</h2>
        <p className="text-sm text-muted mt-1">
          Woran Bewerbungen scheitern – hilft, Stellenbeschreibungen und Anforderungen nachzuschärfen. Die Kategorie wählt ihr beim Ablehnen.
        </p>
        {rejections.total === 0 ? (
          <p className="mt-3 text-sm text-muted">Im gewählten Zeitraum gibt es keine Absagen.</p>
        ) : (
          <>
            {rejections.byCategory.length ? (
              <ul className="mt-5 space-y-3">
                {rejections.byCategory.map((c) => (
                  <li key={c.key} className="grid grid-cols-[150px_1fr_40px] sm:grid-cols-[220px_1fr_40px] items-center gap-3 text-sm">
                    <span className="truncate text-fg-2">{c.label}</span>
                    <span className="h-3 rounded-r-[4px] bg-red/80" style={{ width: `${(c.count / maxCat) * 100}%`, minWidth: 4 }} title={`${c.count} Absagen`} />
                    <span className="tabular-nums text-right">{c.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Für die Absagen in diesem Zeitraum wurde noch keine Kategorie gewählt.</p>
            )}
            {rejections.uncategorized > 0 && <p className="mt-3 text-xs text-muted">{rejections.uncategorized} von {rejections.total} Absagen ohne Kategorie.</p>}
            {usedCats.length > 0 && (
              <div className="nv-scroll-x mt-6">
                <table className="nv-table w-full text-sm min-w-[520px]">
                  <caption className="sr-only">Absagegründe pro Stelle</caption>
                  <thead>
                    <tr>
                      <th scope="col">Stelle</th>
                      <th scope="col">Absagen</th>
                      {usedCats.map((c) => (
                        <th key={c.key} scope="col" className="whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rejections.byPosition.map((p) => (
                      <tr key={p.positionId}>
                        <td>{posTitle.get(p.positionId) ?? "–"}</td>
                        <td className="tabular-nums">{p.total}</td>
                        {usedCats.map((c) => (
                          <td key={c.key} className="tabular-nums">
                            {p.counts[c.key] ?? "–"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {topTemplates.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium">Meistgenutzte Absage-Bausteine</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {topTemplates.map((t) => (
                    <li key={t.title} className="flex justify-between gap-3 border-b border-line pb-1">
                      <span className="text-fg-2 truncate">{t.title}</span>
                      <span className="tabular-nums">{t.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="nv-card p-5" aria-labelledby="fb">
        <h2 id="fb" className="font-semibold">
          Feedback der Bewerber <HelpLink id="feedback" className="ml-1" />
        </h2>
        {feedback.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Im gewählten Zeitraum hat noch niemand Feedback gegeben.</p>
        ) : (
          <div className="mt-3 grid gap-6 md:grid-cols-[220px_1fr]">
            <div>
              <p className="text-4xl font-display tabular-nums">
                {fbAvg?.toLocaleString("de-DE")}
                <span className="text-base text-muted"> / 5</span>
              </p>
              <p className="text-sm text-muted">aus {feedback.length} Rückmeldung(en)</p>
              <ul className="mt-3 space-y-1">
                {fbDist.map((d) => (
                  <li key={d.n} className="flex items-center gap-2 text-xs">
                    <span className="w-6 tabular-nums text-muted">{d.n} ★</span>
                    <span className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
                      <span className="block h-full bg-[var(--tone-warn)]" style={{ width: `${(d.count / feedback.length) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="space-y-3 text-sm max-h-80 overflow-y-auto pr-1">
              {feedback
                .filter((f) => f.comment)
                .slice(0, 30)
                .map((f) => (
                  <li key={f.id} className="border-b border-line pb-2">
                    <p className="text-xs text-muted">
                      <span className="text-[var(--tone-warn)]">{"★".repeat(f.rating)}</span> · {f.application.position.title} ·{" "}
                      <Link href={`/team/bewerbungen/${f.application.id}`} className="nv-link">
                        {f.application.publicId}
                      </Link>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-fg-2">{f.comment}</p>
                  </li>
                ))}
              {!feedback.some((f) => f.comment) && <li className="text-muted">Bisher nur Sterne, keine Kommentare.</li>}
            </ul>
          </div>
        )}
      </section>

      <section className="nv-card p-5">
        <h2 className="font-semibold">KI-Nutzung (dieser Monat)</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-muted">Anfragen</dt>
            <dd className="text-2xl font-display">{aiMonth._count}</dd>
          </div>
          <div>
            <dt className="text-muted">Tokens (ein/aus)</dt>
            <dd className="text-2xl font-display tabular-nums">
              {(aiMonth._sum.inputTokens ?? 0).toLocaleString("de-DE")} / {(aiMonth._sum.outputTokens ?? 0).toLocaleString("de-DE")}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Kosten</dt>
            <dd className="text-2xl font-display">{formatUsd(aiMonth._sum.costMicroUsd ?? 0)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
