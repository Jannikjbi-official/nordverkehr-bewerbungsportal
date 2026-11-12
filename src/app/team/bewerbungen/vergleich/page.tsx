import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { Notice, StatusBadge, formatDay } from "@/components/ui";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { canAccessApplication, viewerOf } from "@/lib/team/visibility";
import { criteriaFor, formatScore, summarizeRatings } from "@/lib/team/ratings";
import { formatAnswerForDisplay, type AnswerValue } from "@/lib/applications/form";

export const metadata: Metadata = { title: "Bewerbungen vergleichen", robots: { index: false } };

const MAX = 3;

export default function ComparePage({ searchParams }: PageProps<"/team/bewerbungen/vergleich">) {
  return (
    <div className="space-y-6">
      <Link href="/team/bewerbungen" className="nv-link text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} aria-hidden /> Alle Bewerbungen
      </Link>
      <header>
        <p className="nv-label">Team // Vergleich</p>
        <h1 className="nv-headline text-4xl mt-2">
          Nebeneinander, <em>Antwort für Antwort.</em>
        </h1>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-[30rem]" />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Compare({ searchParams }: Pick<PageProps<"/team/bewerbungen/vergleich">, "searchParams">) {
  const { user, access } = await requireTeam();
  const sp = await searchParams;
  const raw = typeof sp.ids === "string" ? sp.ids : "";
  const ids = [...new Set(raw.split(",").filter((x) => /^[a-z0-9]{10,40}$/i.test(x)))].slice(0, MAX);
  const viewer = viewerOf(user, access);
  const allowed = (await Promise.all(ids.map(async (id) => ((await canAccessApplication(viewer, id)) ? id : null)))).filter((x): x is string => !!x);

  const apps = allowed.length
    ? await db.application.findMany({
        where: { id: { in: allowed }, status: { not: "DRAFT" } },
        include: {
          user: { select: { globalName: true, username: true } },
          position: { select: { id: true, title: true, ratingCriteria: true } },
          answers: { orderBy: { sortOrder: "asc" } },
          ratings: { select: { scores: true } },
          votes: { select: { value: true } },
        },
      })
    : [];
  // Reihenfolge wie in der URL
  apps.sort((a, b) => allowed.indexOf(a.id) - allowed.indexOf(b.id));

  if (apps.length < 2) {
    return (
      <Notice tone="info" title="Wähle mindestens zwei Bewerbungen">
        Öffne eine Bewerbung und klicke dort auf „Vergleichen“ – oder hänge bis zu {MAX} IDs an: <code>?ids=…,…</code>.
      </Notice>
    );
  }

  const samePosition = apps.every((a) => a.positionId === apps[0].positionId);
  // Zeilen: Fragen in der Reihenfolge der ersten Bewerbung, dann was nur andere haben
  const rows: { key: string; label: string; section: string }[] = [];
  const seen = new Set<string>();
  for (const a of apps)
    for (const ans of a.answers) {
      const key = ans.questionId ?? `${ans.sectionTitle}::${ans.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ key, label: ans.label, section: ans.sectionTitle });
    }
  const answerOf = (a: (typeof apps)[number], key: string) => a.answers.find((x) => (x.questionId ?? `${x.sectionTitle}::${x.label}`) === key);
  const cols = `minmax(9rem,14rem) repeat(${apps.length}, minmax(16rem,1fr))`;

  return (
    <div className="space-y-4">
      {!samePosition && <Notice tone="warn" title="Unterschiedliche Stellen">Die Bewerbungen sind für verschiedene Stellen – Fragen können sich unterscheiden.</Notice>}
      <div className="nv-card overflow-x-auto">
        <div className="grid min-w-max" style={{ gridTemplateColumns: cols }}>
          {/* Kopf */}
          <div className="sticky left-0 z-10 bg-card p-4 border-b border-line" />
          {apps.map((a) => {
            const rating = summarizeRatings(a.ratings, criteriaFor(a.position));
            const flags = Array.isArray(a.flags) ? a.flags : [];
            return (
              <div key={a.id} className="p-4 border-b border-l border-line space-y-1.5">
                <Link href={`/team/bewerbungen/${a.id}`} className="font-semibold nv-link">
                  {a.user.globalName || a.user.username}
                </Link>
                <p className="text-xs text-muted">
                  {a.publicId} · {a.position.title}
                  {a.submittedAt && ` · ${formatDay(a.submittedAt)}`}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <StatusBadge status={a.status} />
                  <span className="nv-pill tabular-nums" title="Team-Schnitt im Bewertungsbogen">
                    ★ {formatScore(rating.overall)}
                  </span>
                  <span className="nv-pill tabular-nums" title="Abstimmung">
                    👍 {a.votes.filter((v) => v.value === "PRO").length} · 👎 {a.votes.filter((v) => v.value === "CONTRA").length}
                  </span>
                  {a.quizTotal ? (
                    <span className="nv-pill tabular-nums" title="Regel-Quiz">
                      Quiz {a.quizCorrect}/{a.quizTotal}
                    </span>
                  ) : null}
                  {a.age !== null && <span className="nv-pill">{a.age} J.</span>}
                </div>
                {flags.length > 0 && <p className="text-xs text-[var(--tone-warn)]">⚠ {flags.length} Hinweis{flags.length === 1 ? "" : "e"}</p>}
              </div>
            );
          })}
          {/* Antworten */}
          {rows.map((r, i) => (
            <div key={r.key} className="contents">
              <div className={`sticky left-0 z-10 bg-card p-4 text-xs text-muted ${i ? "border-t border-line" : ""}`}>
                <span className="block nv-mono !text-[0.65rem] mb-1">{r.section}</span>
                {r.label}
              </div>
              {apps.map((a) => {
                const ans = answerOf(a, r.key);
                return (
                  <div key={a.id} className={`p-4 border-l border-line text-sm whitespace-pre-wrap break-words ${i ? "border-t" : ""}`}>
                    {!ans ? (
                      <span className="text-faint">–</span>
                    ) : ans.type === "FILE" ? (
                      <span className="text-muted">{Array.isArray(ans.value) ? `${(ans.value as unknown[]).length} Bild(er)` : "–"} · in der Bewerbung ansehen</span>
                    ) : (
                      <>
                        {formatAnswerForDisplay(ans.type, ans.value as AnswerValue)}
                        {ans.type === "QUIZ" && ans.correct === true && <span className="ml-2 text-[var(--tone-success)] text-xs">✓</span>}
                        {ans.type === "QUIZ" && ans.correct === false && <span className="ml-2 text-[var(--tone-danger)] text-xs">✗</span>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
