"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NotePencil } from "@phosphor-icons/react/ssr";
import { amendAnswersAction } from "@/app/actions/application";

interface AmendableAnswer {
  id: string;
  label: string;
  section: string;
  type: string;
  value: string;
}

/** Bewerber ergänzt/korrigiert Textantworten, solange das Team noch nicht draufgeschaut hat. */
export function AmendForm({ applicationId, answers }: { applicationId: string; answers: AmendableAnswer[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(answers.map((a) => [a.id, a.value])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = answers.filter((a) => values[a.id].trim() !== a.value.trim()).length;

  if (!open) {
    return (
      <div className="nv-card p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Noch etwas vergessen?</p>
          <p className="text-sm text-muted">Bis jemand aus dem Team deine Bewerbung übernimmt, kannst du deine Antworten ergänzen oder korrigieren.</p>
        </div>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm shrink-0" onClick={() => setOpen(true)}>
          <NotePencil size={15} aria-hidden /> Antworten nachreichen
        </button>
      </div>
    );
  }

  return (
    <form
      className="nv-card p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await amendAnswersAction({ applicationId, answers: values });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            return setMsg({ ok: false, text: r.error });
          }
          setErrors({});
          setMsg({ ok: true, text: r.data.changed ? `${r.data.changed} Antwort(en) aktualisiert.` : "Nichts geändert." });
          if (r.data.changed) {
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <p className="font-semibold">Antworten nachreichen</p>
        <p className="text-sm text-muted">Geht nur, solange noch niemand aus dem Team deine Bewerbung übernommen hat. Auswahlfragen und Bilder lassen sich hier nicht ändern.</p>
      </div>
      {answers.map((a) => (
        <div key={a.id}>
          <label htmlFor={`amend-${a.id}`} className="nv-field-label">
            {a.label} <span className="text-xs text-muted font-normal">· {a.section}</span>
          </label>
          {a.type === "LONG_TEXT" || a.type === "SCENARIO" ? (
            <textarea
              id={`amend-${a.id}`}
              className="nv-input text-sm !min-h-28"
              maxLength={4000}
              aria-invalid={!!errors[a.id] || undefined}
              value={values[a.id]}
              onChange={(e) => setValues({ ...values, [a.id]: e.target.value })}
            />
          ) : (
            <input
              id={`amend-${a.id}`}
              className="nv-input text-sm"
              maxLength={a.type === "URL" ? 500 : 200}
              aria-invalid={!!errors[a.id] || undefined}
              value={values[a.id]}
              onChange={(e) => setValues({ ...values, [a.id]: e.target.value })}
            />
          )}
          {errors[a.id] && <p className="nv-error text-xs mt-1">{errors[a.id]}</p>}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {msg && <span className={`text-sm mr-auto ${msg.ok ? "text-[var(--tone-success)]" : "nv-error"}`}>{msg.text}</span>}
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
        <button className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || !changed}>
          {pending ? "Speichert …" : `Speichern${changed ? ` (${changed})` : ""}`}
        </button>
      </div>
    </form>
  );
}
