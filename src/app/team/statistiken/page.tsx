import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Stat, cn } from "@/components/ui";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatUsd, monthStart } from "@/lib/ai/config";
import { daysAgo } from "@/lib/time";

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

  const [apps, positions, aiMonth] = await Promise.all([
    db.application.findMany({
      where: { status: { not: "DRAFT" }, ...(since ? { submittedAt: { gte: since } } : {}) },
      select: { status: true, positionId: true, submittedAt: true, decidedAt: true, firstReviewedAt: true },
    }),
    db.position.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, title: true } }),
    db.aiUsage.aggregate({ _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true }, _count: true, where: { createdAt: { gte: monthStart() } } }),
  ]);

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
