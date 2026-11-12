"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarCheck } from "@phosphor-icons/react/ssr";
import { bookSlotAction } from "@/app/actions/application";
import { confirmDialog } from "@/components/ConfirmDialog";
import { CancelInterviewButton } from "@/components/dashboard/CancelInterviewButton";

export interface PickableSlot {
  id: string;
  startsAt: string;
  durationMin: number;
  note: string | null;
}

// Feste Zeitzone: Server (UTC) und Browser rendern sonst unterschiedlich (Hydration-Fehler, falsche Uhrzeit/Tag)
const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** Bewerber wählt einen freien Gesprächstermin (oder bucht um). */
export function SlotPicker({
  applicationId,
  slots,
  current,
  canChange,
  canCancel = false,
}: {
  applicationId: string;
  slots: PickableSlot[];
  current: PickableSlot | null;
  canChange: boolean;
  /** Termin liegt noch in der Zukunft → „Ich kann nicht“ anbieten */
  canCancel?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!current);
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const groups = new Map<string, PickableSlot[]>();
  for (const s of slots) groups.set(day(s.startsAt), [...(groups.get(day(s.startsAt)) ?? []), s]);

  async function book(s: PickableSlot) {
    const ok = await confirmDialog({
      title: current ? "Termin umbuchen?" : "Termin buchen?",
      body: `${day(s.startsAt)} um ${time(s.startsAt)} Uhr (${s.durationMin} Minuten) auf TeamSpeak.${s.note ? `\n${s.note}` : ""}`,
      confirmLabel: current ? "Umbuchen" : "Buchen",
    });
    if (!ok) return;
    setError(null);
    run(async () => {
      const r = await bookSlotAction(applicationId, s.id);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="nv-card p-5 space-y-4 border-red-line" data-testid="slot-picker">
      <div className="flex gap-4">
        <CalendarCheck size={28} className="text-red-text shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">{current ? "Dein Gesprächstermin" : "Such dir einen Gesprächstermin aus"}</p>
          {current ? (
            <p className="text-fg-2 mt-0.5">
              {day(current.startsAt)} um {time(current.startsAt)} Uhr · TeamSpeak
              {current.note && <span className="block text-sm text-muted">{current.note}</span>}
            </p>
          ) : (
            <p className="text-sm text-muted mt-0.5">Wir haben dich zum Gespräch eingeladen. Wähl einfach eine Zeit, die dir passt – am Tag selbst erinnern wir dich per DM.</p>
          )}
          {current && canCancel && <CancelInterviewButton applicationId={applicationId} />}
        </div>
      </div>

      {current && !open && canChange && (
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => setOpen(true)}>
          Termin ändern
        </button>
      )}
      {current && !canChange && <p className="text-xs text-muted">Kurz vor dem Termin kannst du nicht mehr umbuchen – schreib dem Team unten eine Nachricht, falls etwas dazwischenkommt.</p>}

      {open && (
        <>
          {slots.length === 0 ? (
            <p className="text-sm text-muted">Gerade sind keine freien Termine eingetragen. Das Team legt bald neue an – oder schreib unten eine Nachricht.</p>
          ) : (
            <div className="space-y-3">
              {[...groups.entries()].map(([d, list]) => (
                <div key={d}>
                  <p className="nv-mono mb-1.5">{d}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <button key={s.id} type="button" className="nv-btn nv-btn-ghost nv-btn-sm tabular-nums" disabled={pending} onClick={() => book(s)}>
                        {time(s.startsAt)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {current && (
            <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setOpen(false)}>
              Doch nicht ändern
            </button>
          )}
        </>
      )}
      {pending && <p className="text-sm text-muted">Buche …</p>}
      {error && <p className="nv-error text-sm">{error}</p>}
    </div>
  );
}
