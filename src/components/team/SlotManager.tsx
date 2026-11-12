"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Trash } from "@phosphor-icons/react/ssr";
import { createSlotsAction, deleteSlotAction } from "@/app/actions/team";
import { confirmDialog } from "@/components/ConfirmDialog";

/** Neue freie Termine anlegen: Start, Anzahl, Dauer, Pause. */
export function SlotCreator() {
  const router = useRouter();
  const [start, setStart] = useState("");
  const [count, setCount] = useState(4);
  const [duration, setDuration] = useState(30);
  const [gap, setGap] = useState(0);
  const [note, setNote] = useState("");
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const preview = (() => {
    if (!start) return null;
    const s = new Date(start);
    const end = new Date(s.getTime() + (count * duration + (count - 1) * gap) * 60_000);
    const t = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `${count} Termin${count === 1 ? "" : "e"} von ${t(s)} bis ${t(end)} Uhr`;
  })();

  return (
    <form
      className="nv-card p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!start) return setMsg({ ok: false, text: "Bitte eine Startzeit wählen." });
        setMsg(null);
        run(async () => {
          const r = await createSlotsAction({ start: new Date(start).toISOString(), count, durationMin: duration, gapMin: gap, note: note || undefined });
          setMsg(r.ok ? { ok: true, text: `${r.data.count} Termin(e) angelegt.` } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
    >
      <h2 className="font-semibold">Freie Termine anlegen</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="s-start" className="nv-field-label">
            Erster Termin
          </label>
          <input id="s-start" type="datetime-local" className="nv-input" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="s-count" className="nv-field-label">
            Anzahl
          </label>
          <input id="s-count" type="number" min={1} max={20} className="nv-input" value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
        </div>
        <div>
          <label htmlFor="s-dur" className="nv-field-label">
            Dauer (Minuten)
          </label>
          <input id="s-dur" type="number" min={10} max={180} step={5} className="nv-input" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 30)} />
        </div>
        <div>
          <label htmlFor="s-gap" className="nv-field-label">
            Pause dazwischen (Minuten)
          </label>
          <input id="s-gap" type="number" min={0} max={120} step={5} className="nv-input" value={gap} onChange={(e) => setGap(Number(e.target.value) || 0)} />
        </div>
      </div>
      <div>
        <label htmlFor="s-note" className="nv-field-label">
          Hinweis für Bewerber (optional)
        </label>
        <input id="s-note" className="nv-input" maxLength={200} placeholder="z. B. TeamSpeak-Channel „Bewerbungsgespräche“" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending}>
          <CalendarPlus size={15} aria-hidden /> {pending ? "Lege an …" : "Termine anlegen"}
        </button>
        {preview && <span className="text-sm text-muted">{preview}</span>}
        {msg && <span className={`text-sm ${msg.ok ? "text-muted" : "nv-error"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function DeleteSlotButton({ slotId, booked }: { slotId: string; booked: boolean }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="nv-error text-xs">{error}</span>}
      <button
        type="button"
        className="nv-btn nv-btn-quiet nv-btn-sm !px-2"
        aria-label="Termin löschen"
        disabled={pending}
        onClick={async () => {
          if (!(await confirmDialog({ title: "Termin löschen?", body: booked ? "Der Termin ist schon vorbei." : "Der freie Termin verschwindet für alle Bewerber.", confirmLabel: "Löschen", tone: "danger" }))) return;
          setError(null);
          run(async () => {
            const r = await deleteSlotAction(slotId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        <Trash size={15} aria-hidden />
      </button>
    </span>
  );
}
