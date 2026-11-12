"use client";

import { useState, useTransition } from "react";
import { BellSimple, BellSimpleSlash } from "@phosphor-icons/react/ssr";
import { setMuteAction } from "@/app/actions/team";

const OPTIONS = [
  { hours: 1, label: "1 Std." },
  { hours: 8, label: "8 Std." },
  { hours: 24, label: "24 Std." },
  { hours: 72, label: "3 Tage" },
];

const fmt = (iso: string) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Pings zu neuen Bewerber-Nachrichten für eine Weile stummschalten (Portal zeigt weiter alles). */
export function MuteControl({ applicationId, until: initial, nowMs }: { applicationId: string; until: string | null; nowMs: number }) {
  const [until, setUntil] = useState(initial && new Date(initial).getTime() > nowMs ? initial : null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = (hours: number) =>
    start(async () => {
      setError(null);
      const r = await setMuteAction(applicationId, hours);
      if (r.ok) setUntil(r.data.until);
      else setError(r.error);
    });

  return (
    <div className="text-xs">
      {until ? (
        <p className="flex items-center gap-2 text-muted">
          <BellSimpleSlash size={14} aria-hidden /> Stumm bis {fmt(until)} Uhr
          <button type="button" className="nv-link" disabled={pending} onClick={() => set(0)}>
            aufheben
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-muted">
            <BellSimple size={14} aria-hidden /> Neue Antworten stumm für
          </span>
          {OPTIONS.map((o) => (
            <button key={o.hours} type="button" className="nv-btn nv-btn-ghost nv-btn-sm !py-0.5 !px-2 !text-xs" disabled={pending} onClick={() => set(o.hours)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {error && <p className="nv-error mt-1">{error}</p>}
    </div>
  );
}
