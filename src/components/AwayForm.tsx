"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarX } from "@phosphor-icons/react/ssr";

const toInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }) : "");
const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" });

/** „Bis … nicht erreichbar“ – für Bewerber (Dashboard) und Teammitglieder (Konto). */
export function AwayForm({
  until,
  nowMs,
  maxDays,
  title,
  help,
  save,
}: {
  until: string | null;
  nowMs: number;
  maxDays: number;
  title: string;
  help: string;
  save: (date: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const active = !!until && new Date(until).getTime() > nowMs;
  const [value, setValue] = useState(active ? toInput(until) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const min = toInput(new Date(nowMs + 86_400_000).toISOString());
  const max = toInput(new Date(nowMs + maxDays * 86_400_000).toISOString());
  const run = (date: string | null) =>
    start(async () => {
      setError(null);
      const r = await save(date);
      if (!r.ok) return setError(r.error ?? "Hat nicht geklappt.");
      if (!date) setValue("");
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <CalendarX size={16} aria-hidden /> {title}
      </p>
      {active ? (
        <p className="text-sm text-fg-2">
          Nicht erreichbar bis {day(until!)}.{" "}
          <button type="button" className="nv-link" disabled={pending} onClick={() => run(null)}>
            Bin wieder da
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="nv-input !w-auto" min={min} max={max} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Bis wann" />
          <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || !value} onClick={() => run(value)}>
            Eintragen
          </button>
        </div>
      )}
      <p className="nv-help">{help}</p>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
