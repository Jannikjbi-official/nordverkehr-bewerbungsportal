"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Star } from "@phosphor-icons/react/ssr";
import { rateAction } from "@/app/actions/team";
import { RATING_CRITERIA, formatScore, type RatingSummary, type Scores } from "@/lib/team/ratings";

/** Bewertungsbogen: eigene Punkte pro Kriterium + Durchschnitt des Teams. */
export function RatingPanel({
  applicationId,
  mine,
  myNote,
  summary,
  raters,
}: {
  applicationId: string;
  mine: Scores;
  myNote: string | null;
  summary: RatingSummary;
  raters: { name: string; avg: number | null }[];
}) {
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
      <ul className="space-y-2.5">
        {RATING_CRITERIA.map((c) => {
          const val = scores[c.key] ?? 0;
          const team = summary.perCriterion[c.key];
          return (
            <li key={c.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-fg-2" title={c.hint}>
                  {c.label}
                </span>
                <span className="text-[0.7rem] text-muted tabular-nums" title="Schnitt des Teams">
                  Ø {formatScore(team.avg)}
                </span>
              </div>
              <div className="mt-0.5 flex gap-0.5" role="radiogroup" aria-label={c.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={val === n}
                    aria-label={`${n} von 5`}
                    disabled={pending}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: s[c.key] === n ? undefined : n }))}
                    className={`p-0.5 rounded transition-colors ${n <= val ? "text-[var(--tone-warn)]" : "text-faint hover:text-muted"}`}
                  >
                    <Star size={18} weight={n <= val ? "fill" : "regular"} aria-hidden />
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <textarea
        className="nv-input text-sm !min-h-16"
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
