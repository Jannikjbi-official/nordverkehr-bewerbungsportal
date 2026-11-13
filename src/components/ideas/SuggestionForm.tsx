"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SuggestionKind } from "@prisma/client";
import { submitSuggestionAction } from "@/app/actions/suggestions";
import { KIND_EMOJI, KIND_HINT, KIND_LABEL } from "@/lib/suggestion-labels";
import { cn } from "@/components/ui";

const KINDS: SuggestionKind[] = ["IDEA", "FEEDBACK", "BUG"];

/** Idee, Feedback oder Fehler einreichen. `initialKind`/`from` z. B. aus ?art=fehler&von=/team */
export function SuggestionForm({ initialKind = "IDEA", from = "" }: { initialKind?: SuggestionKind; from?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<SuggestionKind>(initialKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState(from);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, run] = useTransition();

  if (sent) {
    return (
      <div className="nv-card p-6 space-y-3" role="status">
        <p className="font-semibold text-lg">Danke! 🙌</p>
        <p className="text-sm text-fg-2">
          Ist angekommen. Die Leitung schaut sich alles an – den Stand siehst du unten bei „Deine Einreichungen“. Wenn sich etwas tut, bekommst du eine DM.
        </p>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          onClick={() => {
            setSent(false);
            setTitle("");
            setBody("");
            setLocation("");
          }}
        >
          Noch etwas einreichen
        </button>
      </div>
    );
  }

  return (
    <form
      className="nv-card p-5 sm:p-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setErrors({});
        run(async () => {
          const r = await submitSuggestionAction({ kind, title, body, location: kind === "BUG" ? location : undefined });
          if (!r.ok) {
            setError(r.error);
            setErrors(r.fieldErrors ?? {});
            return;
          }
          setSent(true);
          router.refresh();
        });
      }}
    >
      <fieldset>
        <legend className="nv-field-label">Was möchtest du einreichen?</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition-colors", kind === k ? "border-[var(--nv-red)] bg-red-soft" : "border-line hover:bg-surface-2/50")}
            >
              <span className="font-medium">
                {KIND_EMOJI[k]} {KIND_LABEL[k]}
              </span>
            </button>
          ))}
        </div>
        <p className="nv-help mt-2">{KIND_HINT[kind]}</p>
      </fieldset>

      <div>
        <label htmlFor="sg-title" className="nv-field-label">
          Kurz und knapp
        </label>
        <input
          id="sg-title"
          className="nv-input"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "BUG" ? "z. B. „Bild-Upload hängt bei 99 %“" : kind === "FEEDBACK" ? "z. B. „Formular war angenehm kurz“" : "z. B. „Erinnerung vor dem Gespräch auch per Discord-Event“"}
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="nv-error text-xs mt-1">{errors.title}</p>}
      </div>

      <div>
        <label htmlFor="sg-body" className="nv-field-label">
          Beschreibung
        </label>
        <textarea id="sg-body" className="nv-input !min-h-32" maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={!!errors.body} />
        <p className="nv-help mt-1 flex justify-between gap-2">
          <span>{kind === "BUG" ? "Schritte zum Nachstellen helfen sehr: Was hast du geklickt, was kam dann?" : "Gern mit Beispiel – warum wäre das gut?"}</span>
          <span className="tabular-nums">{body.length}/3000</span>
        </p>
        {errors.body && <p className="nv-error text-xs mt-1">{errors.body}</p>}
      </div>

      {kind === "BUG" && (
        <div>
          <label htmlFor="sg-location" className="nv-field-label">
            Wo ist es passiert? <span className="text-muted font-normal">(optional)</span>
          </label>
          <input id="sg-location" className="nv-input" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z. B. Bewerbungsformular, Schritt 3 · Handy, Chrome" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="nv-btn nv-btn-primary" disabled={pending}>
          {pending ? "Sende …" : "Einreichen"}
        </button>
        {error && !Object.keys(errors).length && <span className="nv-error text-sm">{error}</span>}
      </div>
      <p className="text-xs text-faint">Sichtbar nur für dich und die Leitung (Admins). Bitte keine Passwörter oder privaten Daten eintragen.</p>
    </form>
  );
}
