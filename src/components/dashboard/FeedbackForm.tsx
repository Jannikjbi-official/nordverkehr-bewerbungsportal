"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Star } from "@phosphor-icons/react/ssr";
import { submitFeedbackAction } from "@/app/actions/application";

const LABELS = ["", "Gar nicht gut", "Eher nicht gut", "Okay", "Gut", "Richtig gut"];

/** Kurze Umfrage nach der Entscheidung: 1–5 Sterne + optionaler Kommentar. */
export function FeedbackForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="nv-card p-5 space-y-3"
      data-testid="feedback-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rating) return setError("Bitte 1 bis 5 Sterne wählen.");
        setError(null);
        run(async () => {
          const r = await submitFeedbackAction({ applicationId, rating, comment: comment || undefined });
          if (!r.ok) setError(r.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <p className="font-semibold">Wie fandest du den Bewerbungsablauf?</p>
        <p className="text-sm text-muted">Egal wie es ausgegangen ist – dein ehrliches Feedback hilft uns, besser zu werden. Freiwillig und nur fürs Team sichtbar.</p>
      </div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Bewertung">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} von 5 – ${LABELS[n]}`}
            className={`p-1 rounded ${n <= rating ? "text-[var(--tone-warn)]" : "text-faint hover:text-muted"}`}
            onClick={() => setRating(n)}
          >
            <Star size={26} weight={n <= rating ? "fill" : "regular"} aria-hidden />
          </button>
        ))}
        {rating > 0 && <span className="ml-2 text-sm text-muted">{LABELS[rating]}</span>}
      </div>
      <textarea
        className="nv-input text-sm !min-h-20"
        maxLength={1000}
        placeholder="Was war gut, was können wir besser machen? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending}>
          {pending ? "Sende …" : "Feedback senden"}
        </button>
        {error && <span className="nv-error text-sm">{error}</span>}
      </div>
    </form>
  );
}
