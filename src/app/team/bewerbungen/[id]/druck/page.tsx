import type { Metadata } from "next";
import { buildProtocol, protocolQuestions } from "@/lib/team/interview";
import { getSettings } from "@/lib/settings";
import { canSeePosition, viewerOf } from "@/lib/team/visibility";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { formatDay, formatDayTime } from "@/components/ui";
import { PrintButton } from "@/components/team/PrintButton";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { STATUS_LABEL } from "@/lib/applications/status";
import { formatAnswerForDisplay, type AnswerValue } from "@/lib/applications/form";
import { STANDARD_CRITERIA, cleanScores, criteriaFor, formatScore, summarizeRatings, withLegacy } from "@/lib/team/ratings";
import { readAiRating } from "@/lib/ai/scoring";

export const metadata: Metadata = { title: "Bewerbung drucken" };

/** Druckansicht einer Bewerbung – „Drucken“ → „Als PDF speichern“ ergibt das PDF. */
export default function PrintPage(props: PageProps<"/team/bewerbungen/[id]/druck">) {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[40rem]" />}>
      <PrintView {...props} />
    </Suspense>
  );
}

async function PrintView({ params, searchParams }: PageProps<"/team/bewerbungen/[id]/druck">) {
  const { user, access } = await requireTeam();
  const { id } = await params;
  const sp = await searchParams;
  const internal = sp.intern !== "0";
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();

  const app = await db.application.findUnique({
    where: { id },
    include: {
      user: true,
      position: true,
      claimedBy: { select: { globalName: true, username: true } },
      answers: { orderBy: { sortOrder: "asc" } },
      votes: { include: { user: { select: { globalName: true, username: true } } } },
      ratings: { include: { user: { select: { globalName: true, username: true } } } },
      comments: { include: { author: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "asc" } },
      statusChanges: { include: { actor: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "asc" } },
      interviewNotes: { include: { author: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "asc" } },
      interviewChecks: { include: { checkedBy: { select: { globalName: true, username: true } } } },
    },
  });
  if (!app || app.status === "DRAFT") notFound();
  if (!canSeePosition(viewerOf(user, access), app.position)) notFound();
  const protocol = buildProtocol(
    protocolQuestions(app.position.interviewQuestions, (await getSettings())["interview.defaultQuestions"], app.interviewExtraQuestions),
    app.interviewExtraQuestions,
    app.interviewChecks,
    app.interviewNotes,
  );
  await audit("application.print", { actorId: user.id, targetType: "application", targetId: app.id, meta: { internal } });

  const sections = new Map<string, typeof app.answers>();
  for (const a of app.answers) sections.set(a.sectionTitle, [...(sections.get(a.sectionTitle) ?? []), a]);
  const name = app.user.globalName || app.user.username;
  const criteria = criteriaFor(app.position);
  const rating = summarizeRatings(app.ratings, withLegacy(criteria));
  const standardCriteria = criteria === STANDARD_CRITERIA;
  const aiStored = readAiRating(app.aiRating);
  const ai = aiStored && !("blocked" in aiStored) ? aiStored : null;
  const aiScores = ai ? cleanScores(ai.scores) : null;
  const who = (u: { globalName: string | null; username: string } | null) => (u ? u.globalName || u.username : "–");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/team/bewerbungen/${app.id}`} className="nv-btn nv-btn-quiet nv-btn-sm -ml-3">
          <ArrowLeft size={14} aria-hidden /> Zurück zur Bewerbung
        </Link>
        <span className="flex-1" />
        <Link href={`?intern=${internal ? "0" : "1"}`} className="nv-btn nv-btn-ghost nv-btn-sm" replace>
          {internal ? "Ohne interne Infos" : "Mit internen Infos"}
        </Link>
        <PrintButton />
      </div>
      <p className="text-sm text-muted print:hidden">Tipp: Im Druckfenster „Als PDF speichern“ wählen.</p>

      <article className="nv-print nv-card p-6 sm:p-8 space-y-6 text-sm">
        <header className="border-b border-line pb-4">
          <p className="nv-mono">NORDVERKEHR // BEWERBUNG {app.publicId}</p>
          <h1 className="text-2xl font-semibold mt-1">
            {name} – {app.position.title}
          </h1>
          <p className="text-muted mt-1">
            @{app.user.username} · Discord-ID {app.user.discordId} · Alter {app.age ?? "–"} · eingereicht {formatDayTime(app.submittedAt)}
          </p>
          <p className="text-muted">
            Status: <strong className="text-fg">{STATUS_LABEL[app.status]}</strong>
            {app.claimedBy && <> · betreut von {who(app.claimedBy)}</>}
            {app.interviewAt && <> · Gespräch {formatDayTime(app.interviewAt)} Uhr</>}
            {app.quizTotal ? <> · Regel-Quiz {app.quizCorrect} von {app.quizTotal} richtig</> : null}
          </p>
        </header>

        {[...sections.entries()].map(([title, answers]) => (
          <section key={title} className="nv-print-avoid">
            <h2 className="font-semibold text-base mb-2">{title}</h2>
            <dl className="space-y-3">
              {answers.map((a) => (
                <div key={a.id} className="nv-print-avoid">
                  <dt className="text-xs text-muted">{a.label}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {a.type === "FILE" && Array.isArray(a.value) ? `${(a.value as string[]).length} Bild(er) – im Portal ansehen` : formatAnswerForDisplay(a.type, a.value as AnswerValue)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        {internal && (
          <>
            <section className="nv-print-avoid border-t border-line pt-4">
              <h2 className="font-semibold text-base mb-2">Bewertung des Teams (intern)</h2>
              <p>
                Schnitt: <strong>{formatScore(rating.overall)} / 5</strong> aus {rating.raters} Bewertung(en) · Abstimmung: {app.votes.filter((v) => v.value === "PRO").length} Pro,{" "}
                {app.votes.filter((v) => v.value === "CONTRA").length} Contra, {app.votes.filter((v) => v.value === "ABSTAIN").length} Enthaltung
              </p>
              <table className="mt-2 w-full text-left">
                <tbody>
                  {criteria.map((c) => (
                    <tr key={c.key} className="border-b border-line">
                      <td className="py-1">{c.label}</td>
                      <td className="py-1 text-right tabular-nums">{formatScore(rating.perCriterion[c.key]?.avg ?? null)}</td>
                      {aiScores && standardCriteria && <td className="py-1 text-right tabular-nums text-muted">KI {aiScores[c.key] ?? "–"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {app.ratings.some((r) => r.note) && (
                <ul className="mt-2 space-y-1">
                  {app.ratings
                    .filter((r) => r.note)
                    .map((r) => (
                      <li key={r.id}>
                        <span className="text-muted">{who(r.user)}:</span> {r.note}
                      </li>
                    ))}
                </ul>
              )}
            </section>

            {protocol.started && (
              <section className="border-t border-line pt-4">
                <h2 className="font-semibold text-base mb-2">Gesprächsprotokoll (intern)</h2>
                <ol className="space-y-2 list-decimal pl-5">
                  {protocol.items
                    .filter((it) => it.checked || it.notes.length)
                    .map((it) => (
                      <li key={it.question} className="nv-print-avoid">
                        <p className="font-medium">
                          {it.question} {it.checked ? <span className="text-muted font-normal">✓ ({it.checked.by})</span> : null}
                        </p>
                        {it.notes.map((n) => (
                          <p key={n.id} className="whitespace-pre-wrap">
                            <span className="text-muted">
                              {n.by} · {formatDay(new Date(n.at))}:
                            </span>{" "}
                            {n.body}
                          </p>
                        ))}
                      </li>
                    ))}
                </ol>
                {(protocol.orphans.length > 0 || protocol.orphanChecks.length > 0) && (
                  <div className="mt-3 nv-print-avoid">
                    <p className="font-medium">Weitere Notizen</p>
                    {protocol.orphanChecks.map((c) => (
                      <p key={`c-${c.question}`}>
                        „{c.question}“ ✓ <span className="text-muted">({c.by})</span>
                      </p>
                    ))}
                    {protocol.orphans.map((n) => (
                      <p key={n.id} className="whitespace-pre-wrap">
                        <span className="text-muted">
                          „{n.question}“ – {n.by} · {formatDay(new Date(n.at))}:
                        </span>{" "}
                        {n.body}
                      </p>
                    ))}
                  </div>
                )}
                {protocol.conclusion.length > 0 && (
                  <div className="mt-3 nv-print-avoid">
                    <p className="font-medium">Gesamtfazit</p>
                    {protocol.conclusion.map((n) => (
                      <p key={n.id} className="whitespace-pre-wrap">
                        <span className="text-muted">
                          {n.by} · {formatDay(new Date(n.at))}:
                        </span>{" "}
                        {n.body}
                      </p>
                    ))}
                  </div>
                )}
              </section>
            )}

            {app.comments.length > 0 && (
              <section className="nv-print-avoid border-t border-line pt-4">
                <h2 className="font-semibold text-base mb-2">Interne Kommentare</h2>
                <ul className="space-y-2">
                  {app.comments.map((c) => (
                    <li key={c.id}>
                      <span className="text-muted">
                        {who(c.author)} · {formatDay(c.createdAt)}:
                      </span>{" "}
                      <span className="whitespace-pre-wrap">{c.body}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="nv-print-avoid border-t border-line pt-4">
          <h2 className="font-semibold text-base mb-2">Verlauf</h2>
          <ul className="space-y-1">
            {app.statusChanges.map((s) => (
              <li key={s.id}>
                {formatDay(s.createdAt)} – {s.from ? `${STATUS_LABEL[s.from]} → ` : ""}
                {STATUS_LABEL[s.to]}
                {s.actor && <span className="text-muted"> ({who(s.actor)})</span>}
              </li>
            ))}
          </ul>
        </section>

        <footer className="border-t border-line pt-3 text-xs text-muted">
          Erstellt am {formatDayTime(new Date())} von {user.globalName || user.username} · Vertraulich – nur für das Nordverkehr-Team.
        </footer>
      </article>
    </div>
  );
}
