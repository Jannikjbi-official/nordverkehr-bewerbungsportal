"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash } from "@phosphor-icons/react/ssr";
import { addNoteAction, banUserAction, deleteNoteAction, liftBanAction } from "@/app/actions/team";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Fehler");
      else {
        after?.();
        router.refresh();
      }
    });
  };
  return { pending, error, run };
}

export function NoteForm({ subjectId }: { subjectId: string }) {
  const { pending, error, run } = useRun();
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addNoteAction(subjectId, body), () => setBody(""));
      }}
      className="space-y-2"
    >
      <label htmlFor="note" className="sr-only">
        Neue Notiz
      </label>
      <textarea id="note" className="nv-input text-sm !min-h-20" maxLength={2000} placeholder="Neue Notiz (nur für das Team sichtbar)" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end">
        <button className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || !body.trim()}>
          Notiz speichern
        </button>
      </div>
      {error && <p className="nv-error">{error}</p>}
    </form>
  );
}

export function DeleteNoteButton({ noteId }: { noteId: string }) {
  const { pending, run } = useRun();
  return (
    <button type="button" className="nv-btn nv-btn-quiet !p-1" aria-label="Notiz löschen" disabled={pending} onClick={() => confirm("Notiz löschen?") && run(() => deleteNoteAction(noteId))}>
      <Trash size={14} aria-hidden />
    </button>
  );
}

export function BanForm({ subjectId }: { subjectId: string }) {
  const { pending, error, run } = useRun();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("30");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirm("Nutzer für Bewerbungen sperren?")) return;
        run(() => banUserAction({ subjectId, reason, days: days === "0" ? null : Number(days) }), () => setReason(""));
      }}
    >
      <p className="text-sm text-muted">Gesperrte Nutzer können sich nicht bewerben, sehen aber weiter ihre bisherigen Bewerbungen.</p>
      <div>
        <label htmlFor="ban-reason" className="nv-field-label">
          Grund (intern)
        </label>
        <input id="ban-reason" className="nv-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label htmlFor="ban-days" className="nv-field-label">
            Dauer
          </label>
          <select id="ban-days" className="nv-input" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">7 Tage</option>
            <option value="30">30 Tage</option>
            <option value="90">90 Tage</option>
            <option value="180">180 Tage</option>
            <option value="365">1 Jahr</option>
            <option value="0">Unbefristet</option>
          </select>
        </div>
        <button className="nv-btn nv-btn-danger" disabled={pending || reason.trim().length < 3}>
          Sperren
        </button>
      </div>
      {error && <p className="nv-error">{error}</p>}
    </form>
  );
}

export function LiftBanButton({ banId }: { banId: string }) {
  const { pending, run } = useRun();
  return (
    <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => confirm("Sperre aufheben?") && run(() => liftBanAction(banId))}>
      Sperre aufheben
    </button>
  );
}
