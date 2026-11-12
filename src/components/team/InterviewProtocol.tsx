"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckSquare, NotePencil, Plus, Square, Trash } from "@phosphor-icons/react/ssr";
import { addInterviewNoteAction, addInterviewQuestionsAction, deleteInterviewNoteAction, toggleInterviewCheckAction } from "@/app/actions/team";
import { confirmDialog } from "@/components/ConfirmDialog";
import type { Protocol, ProtocolNote } from "@/lib/team/interview";

const fmt = (iso: string) => new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Fehler");
      after?.();
      router.refresh();
    });
  };
  return { pending, error, run };
}

/** Gesprächsprotokoll: Fragen abhaken, Notizen pro Frage, Gesamtfazit. Nur für das Team. */
export function InterviewProtocol({ applicationId, protocol, meId, isAdmin }: { applicationId: string; protocol: Protocol; meId: string; isAdmin: boolean }) {
  const done = protocol.items.filter((i) => i.checked).length;
  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          Fragen fürs TeamSpeak-Gespräch zum Abhaken, Notizen mit Name und Zeit. Nur für das Team sichtbar, steht im Audit-Log und in der Druckansicht.
        </p>
        <span className="nv-pill tabular-nums">
          {done} / {protocol.items.length} besprochen
        </span>
      </div>

      <ol className="space-y-3">
        {protocol.items.map((item, i) => (
          <li key={item.question} className="rounded-xl border border-line p-3">
            <QuestionRow applicationId={applicationId} index={i} question={item.question} extra={item.extra} checked={item.checked} />
            <Notes notes={item.notes} meId={meId} isAdmin={isAdmin} />
            <NoteBox applicationId={applicationId} question={item.question} placeholder="Notiz zu dieser Frage …" />
          </li>
        ))}
      </ol>

      <AddQuestions applicationId={applicationId} />

      <section className="rounded-xl border border-red-line p-3 space-y-2" aria-labelledby="fazit">
        <h3 id="fazit" className="font-semibold text-sm">
          Gesamtfazit
        </h3>
        <Notes notes={protocol.conclusion} meId={meId} isAdmin={isAdmin} empty="Noch kein Fazit." />
        <NoteBox applicationId={applicationId} question="" placeholder="Fazit zum Gespräch – Eindruck, Empfehlung, offene Punkte …" />
        <p className="text-xs text-muted">Tipp: Den Bewertungsbogen im Reiter „Bewertung“ direkt nach dem Gespräch ausfüllen.</p>
      </section>

      {protocol.orphans.length > 0 && (
        <section className="space-y-2">
          <h3 className="nv-mono">Weitere Notizen (Frage nicht mehr in der Vorlage)</h3>
          <ul className="space-y-2 text-sm">
            {protocol.orphans.map((n) => (
              <li key={n.id}>
                <p className="text-xs text-muted">„{n.question}“</p>
                <NoteLine note={n} canDelete={n.byId === meId || isAdmin} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QuestionRow({ applicationId, index, question, extra, checked }: { applicationId: string; index: number; question: string; extra: boolean; checked: { by: string; at: string } | null }) {
  const { pending, error, run } = useRun();
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        aria-pressed={!!checked}
        disabled={pending}
        onClick={() => run(() => toggleInterviewCheckAction(applicationId, question, !checked))}
      >
        {checked ? <CheckSquare size={20} weight="fill" className="shrink-0 text-[var(--tone-success)]" aria-hidden /> : <Square size={20} className="shrink-0 text-muted" aria-hidden />}
        <span className="min-w-0">
          <span className={`text-sm font-medium ${checked ? "text-fg-2" : ""}`}>
            <span className="font-mono text-xs text-red-text mr-1.5">{String(index + 1).padStart(2, "0")}</span>
            {question}
          </span>
          {extra && <span className="ml-2 nv-pill !py-0 !px-1.5 text-[0.65rem]">eigene Frage</span>}
          {checked && (
            <span className="block text-xs text-muted">
              besprochen · {checked.by} · {fmt(checked.at)}
            </span>
          )}
        </span>
      </button>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}

function Notes({ notes, meId, isAdmin, empty }: { notes: ProtocolNote[]; meId: string; isAdmin: boolean; empty?: string }) {
  if (!notes.length) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  return (
    <ul className="mt-2 space-y-2 pl-7">
      {notes.map((n) => (
        <li key={n.id}>
          <NoteLine note={n} canDelete={n.byId === meId || isAdmin} />
        </li>
      ))}
    </ul>
  );
}

function NoteLine({ note, canDelete }: { note: ProtocolNote; canDelete: boolean }) {
  const { pending, run } = useRun();
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {note.by} · {fmt(note.at)}
        </p>
        {canDelete && (
          <button
            type="button"
            aria-label="Notiz löschen"
            className="nv-btn nv-btn-quiet !p-1"
            disabled={pending}
            onClick={async () => (await confirmDialog({ title: "Notiz löschen?", confirmLabel: "Löschen", tone: "danger" })) && run(() => deleteInterviewNoteAction(note.id))}
          >
            <Trash size={13} aria-hidden />
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-fg-2">{note.body}</p>
    </div>
  );
}

function NoteBox({ applicationId, question, placeholder }: { applicationId: string; question: string; placeholder: string }) {
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  if (!open) {
    return (
      <button type="button" className="mt-2 ml-7 nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setOpen(true)}>
        <NotePencil size={14} aria-hidden /> Notiz
      </button>
    );
  }
  return (
    <form
      className="mt-2 ml-7 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addInterviewNoteAction({ applicationId, question, body }), () => {
          setBody("");
          setOpen(false);
        });
      }}
    >
      <textarea className="nv-input !min-h-16 text-sm" rows={2} maxLength={3000} autoFocus aria-label={placeholder} placeholder={placeholder} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
        <button className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || !body.trim()}>
          {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
      {error && <p className="nv-error text-xs">{error}</p>}
    </form>
  );
}

function AddQuestions({ applicationId }: { applicationId: string }) {
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden /> Eigene Fragen ergänzen
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addInterviewQuestionsAction(applicationId, text), () => {
          setText("");
          setOpen(false);
        });
      }}
    >
      <label htmlFor="iv-extra" className="nv-field-label">
        Eigene Fragen (eine pro Zeile)
      </label>
      <textarea
        id="iv-extra"
        className="nv-input text-sm"
        rows={4}
        maxLength={5000}
        placeholder="z. B. die Gesprächsfragen aus dem Reiter „KI“ hier einfügen – Aufzählungszeichen werden entfernt."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
        <button className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || !text.trim()}>
          {pending ? "Speichert …" : "Fragen hinzufügen"}
        </button>
      </div>
      {error && <p className="nv-error text-xs">{error}</p>}
    </form>
  );
}
