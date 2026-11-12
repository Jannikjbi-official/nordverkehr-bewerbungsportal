"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Robot, Star } from "@phosphor-icons/react/ssr";
import { overrideAiConsentAction, rateAction, rescoreAction } from "@/app/actions/team";
import { confirmDialog } from "@/components/ConfirmDialog";
import { RATING_CRITERIA, formatScore, summarizeRatings, type CriterionKey, type RatingSummary, type Scores } from "@/lib/team/ratings";

export type AiRatingView =
  | { kind: "scores"; scores: Scores; reasons: Partial<Record<CriterionKey, string>>; fazit: string | null; at: string }
  | { kind: "blocked"; reason: "manipulation" | "unreadable"; at: string }
  | { kind: "none" }
  /** KI bewertet gerade (automatisch beim Öffnen) */
  | { kind: "pending" }
  /** Bewerbung vor Einführung der KI-Punkte eingereicht (Einwilligung deckt es nicht) */
  | { kind: "notAllowed" }
  /** Automatik gerade nicht möglich (z. B. Budget aufgebraucht) */
  | { kind: "unavailable"; reason: string }
  | { kind: "off" };

/** Bewertungsbogen: eigene Punkte pro Kriterium + Durchschnitt des Teams. */
export function RatingPanel({
  applicationId,
  mine,
  myNote,
  summary,
  raters,
  ai = { kind: "off" },
  bot,
  isAdmin = false,
}: {
  applicationId: string;
  mine: Scores;
  myNote: string | null;
  summary: RatingSummary;
  raters: { name: string; avg: number | null }[];
  ai?: AiRatingView;
  bot?: { name: string; avatarUrl: string };
  isAdmin?: boolean;
}) {
  const aiScores = ai.kind === "scores" ? ai.scores : null;
  const aiOverall = aiScores ? summarizeRatings([{ scores: aiScores }]).overall : null;
  const router = useRouter();
  const [scores, setScores] = useState<Scores>(mine);
  const [note, setNote] = useState(myNote ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(scores) !== JSON.stringify(mine) || note !== (myNote ?? "");

  function save() {
    setMsg(null);
    start(async () => {
      const r = await rateAction({ applicationId, scores, note });
      setMsg(r.ok ? { ok: true, text: "Gespeichert." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          Team-Schnitt{summary.raters ? ` (${summary.raters} ${summary.raters === 1 ? "Bewertung" : "Bewertungen"})` : ""}
        </p>
        <p className="font-display text-2xl tabular-nums" data-testid="rating-overall">
          {formatScore(summary.overall)}
          <span className="text-sm text-muted"> / 5</span>
        </p>
      </div>
      <ul className="space-y-1">
        {RATING_CRITERIA.map((c) => {
          const val = scores[c.key] ?? 0;
          const team = summary.perCriterion[c.key];
          return (
            <li key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2">
              <span className="text-xs text-fg-2 truncate" title={`${c.label} – ${c.hint}`}>
                {c.label}
              </span>
              <span className="flex" role="radiogroup" aria-label={c.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={val === n}
                    aria-label={`${c.label}: ${n} von 5`}
                    disabled={pending}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: s[c.key] === n ? undefined : n }))}
                    className={`p-[3px] rounded transition-colors ${n <= val ? "text-[var(--tone-warn)]" : "text-faint hover:text-muted"}`}
                  >
                    <Star size={15} weight={n <= val ? "fill" : "regular"} aria-hidden />
                  </button>
                ))}
              </span>
              <span className="flex items-center justify-end gap-1.5 text-[0.7rem] text-muted tabular-nums min-w-[4.5rem]">
                {aiScores && (
                  <span className="nv-pill nv-tone-info !py-0 !px-1.5 cursor-help" title={ai.kind === "scores" ? (ai.reasons[c.key] ?? "Ohne Begründung") : undefined}>
                    KI {aiScores[c.key] ?? "–"}
                  </span>
                )}
                <span title="Schnitt des Teams">Ø {formatScore(team.avg)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <AiBlock applicationId={applicationId} ai={ai} overall={aiOverall} bot={bot} isAdmin={isAdmin} />
      <textarea
        className="nv-input text-sm !min-h-12"
        rows={2}
        placeholder="Kurze Begründung (nur intern, optional)"
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || !dirty} onClick={save}>
          {pending ? "Speichere …" : "Bewertung speichern"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-muted" : "nv-error"}`}>{msg.text}</span>}
      </div>
      {raters.length > 0 && (
        <ul className="space-y-1 text-xs text-muted border-t border-line pt-2">
          {raters.map((r, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>{r.name}</span>
              <span className="tabular-nums text-fg-2">Ø {formatScore(r.avg)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** KI-Einschätzung: Schnitt, Begründungen, Neu-Berechnen. Zählt nicht zum Team-Schnitt. */
function AiBlock({
  applicationId,
  ai,
  overall,
  bot,
  isAdmin,
}: {
  applicationId: string;
  ai: AiRatingView;
  overall: number | null;
  bot?: { name: string; avatarUrl: string };
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Läuft die Bewertung gerade, nach kurzer Zeit neu laden
  useEffect(() => {
    if (ai.kind !== "pending") return;
    const t = setTimeout(() => router.refresh(), 15_000);
    return () => clearTimeout(t);
  }, [ai.kind, router]);
  if (ai.kind === "off") return null;
  if (ai.kind === "notAllowed") {
    const override = async () => {
      const ok = await confirmDialog({
        title: "KI-Punkte trotzdem berechnen?",
        body: "Diese Bewerbung wurde vor Einführung der KI-Punkte abgeschickt. Ihre Antworten gehen dann zur Bewertung an die KI (Anthropic).\n\nNur fortfahren, wenn der Bewerber zugestimmt hat (z. B. per Nachricht). Die Freigabe wird mit deinem Namen im Audit-Log gespeichert.",
        confirmLabel: "Bewerber hat zugestimmt",
      });
      if (!ok) return;
      start(async () => {
        setError(null);
        const r = await overrideAiConsentAction(applicationId);
        if (!r.ok) setError(r.error);
        else router.refresh();
      });
    };
    return (
      <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2" data-testid="ai-rating-locked">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Robot size={14} aria-hidden /> KI-Einschätzung
        </p>
        <p className="text-xs text-muted">Bewerbung von vor dem 12.11.2026 – automatisch bewertet die KI nur neuere (Datenschutz-Einwilligung).</p>
        {isAdmin ? (
          <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm w-full" disabled={pending} onClick={override} data-testid="ai-override">
            <Robot size={14} aria-hidden /> {pending ? "KI bewertet … (bis zu 30 s)" : "KI-Punkte freigeben & berechnen"}
          </button>
        ) : (
          <p className="text-[0.7rem] text-faint">Ein Admin kann die KI-Punkte freigeben, wenn der Bewerber zugestimmt hat.</p>
        )}
        {error && <p className="nv-error text-xs">{error}</p>}
      </div>
    );
  }
  const run = () =>
    start(async () => {
      setError(null);
      const r = await rescoreAction(applicationId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2" data-testid="ai-rating">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          {bot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bot.avatarUrl} alt="" width={18} height={18} className="rounded-full" />
          ) : (
            <Robot size={14} aria-hidden />
          )}
          KI-Einschätzung{bot ? <span className="font-normal text-muted"> · {bot.name}</span> : null}
        </p>
        {overall !== null && (
          <p className="text-sm tabular-nums">
            {formatScore(overall)}
            <span className="text-xs text-muted"> / 5</span>
          </p>
        )}
      </div>
      {ai.kind === "scores" && (
        <details className="text-xs text-fg-2">
          <summary className="cursor-pointer text-muted">Begründungen{ai.fazit ? " & Fazit" : ""}</summary>
          <ul className="mt-1.5 space-y-1">
            {RATING_CRITERIA.filter((c) => ai.reasons[c.key]).map((c) => (
              <li key={c.key}>
                <span className="text-muted">{c.label}:</span> {ai.reasons[c.key]}
              </li>
            ))}
          </ul>
          {ai.fazit && <p className="mt-1.5 italic">{ai.fazit}</p>}
        </details>
      )}
      {ai.kind === "blocked" && (
        <p className="text-xs text-[var(--tone-danger)]">
          {ai.reason === "manipulation"
            ? "Keine KI-Punkte: In der Bewerbung wurde ein möglicher Manipulationsversuch erkannt. Bitte selbst bewerten."
            : "Die KI-Antwort war nicht auswertbar. Versuch es nochmal."}
        </p>
      )}
      {ai.kind === "none" && <p className="text-xs text-muted">Noch keine KI-Punkte.</p>}
      {ai.kind === "unavailable" && <p className="text-xs text-muted">Noch keine KI-Punkte: {ai.reason}</p>}
      {ai.kind === "pending" && <p className="text-xs text-muted">Die KI bewertet die Bewerbung gerade … (aktualisiert sich gleich)</p>}
      <div className="flex items-center gap-2">
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm !px-2" disabled={pending || ai.kind === "pending"} onClick={run}>
          {pending ? "Berechne …" : ai.kind === "none" || ai.kind === "unavailable" ? "KI-Punkte berechnen" : "Neu berechnen"}
        </button>
        {error && <span className="nv-error text-xs">{error}</span>}
      </div>
      <p className="text-[0.65rem] text-faint">Nur Orientierung – zählt nicht zum Team-Schnitt, entscheiden tut das Team.</p>
    </div>
  );
}
