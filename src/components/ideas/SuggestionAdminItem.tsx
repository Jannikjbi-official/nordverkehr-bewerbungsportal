"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SuggestionStatus } from "@prisma/client";
import { confirmDialog } from "@/components/ConfirmDialog";
import { deleteSuggestionAction, updateSuggestionAction } from "@/app/actions/suggestions";
import { STATUSES, STATUS_LABEL } from "@/lib/suggestion-labels";

const NOTIFY_ON: SuggestionStatus[] = ["PLANNED", "DONE", "DECLINED"];

/** Admin: Status, Antwort an die Person, DM-Hinweis, Löschen. */
export function SuggestionAdminItem({ id, status: initialStatus, adminNote, hasAuthor }: { id: string; status: SuggestionStatus; adminNote: string | null; hasAuthor: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<SuggestionStatus>(initialStatus);
  const [note, setNote] = useState(adminNote ?? "");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  const dirty = status !== initialStatus || note.trim() !== (adminNote ?? "");
  const willNotify = hasAuthor && notify && status !== initialStatus && NOTIFY_ON.includes(status);

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <label htmlFor={`st-${id}`} className="nv-field-label">
            Status
          </label>
          <select id={`st-${id}`} className="nv-input" value={status} onChange={(e) => setStatus(e.target.value as SuggestionStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`note-${id}`} className="nv-field-label">
            Antwort an die Person <span className="text-muted font-normal">(optional, sieht sie unter „Ideen & Fehler“)</span>
          </label>
          <textarea id={`note-${id}`} className="nv-input text-sm !min-h-16" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. „Kommt mit dem nächsten Update“" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="nv-btn nv-btn-primary nv-btn-sm"
          disabled={pending || !dirty}
          onClick={() =>
            run(async () => {
              setMsg(null);
              const r = await updateSuggestionAction({ id, status, adminNote: note, notify });
              setMsg(r.ok ? { ok: true, text: willNotify ? "Gespeichert – DM ist raus." : "Gespeichert." } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? "Speichert …" : "Speichern"}
        </button>
        {hasAuthor && status !== initialStatus && NOTIFY_ON.includes(status) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="nv-check" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Person per DM informieren
          </label>
        )}
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm ml-auto text-[var(--tone-danger)]"
          disabled={pending}
          onClick={async () => {
            if (!(await confirmDialog({ title: "Eintrag endgültig löschen?", body: "Zum Beispiel bei Spam oder doppelten Einträgen. Das lässt sich nicht rückgängig machen.", confirmLabel: "Löschen", tone: "danger" }))) return;
            run(async () => {
              const r = await deleteSuggestionAction(id);
              if (r.ok) router.refresh();
              else setMsg({ ok: false, text: r.error });
            });
          }}
        >
          Löschen
        </button>
      </div>
      {msg && (
        <p className={msg.ok ? "text-xs text-[var(--tone-success)]" : "nv-error text-xs"} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
