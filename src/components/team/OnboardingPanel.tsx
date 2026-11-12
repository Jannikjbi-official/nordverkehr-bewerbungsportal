"use client";

import { useRef, useState } from "react";
import { setProbationAction, toggleOnboardingAction } from "@/app/actions/team";
import type { OnboardingState } from "@/lib/team/onboarding";

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");

/**
 * Einarbeitung: Checkliste + Probezeit-Ende.
 * Reagiert sofort (optimistisch): Haken erscheint direkt, gespeichert wird im
 * Hintergrund – der Reihe nach, damit schnelle Klicks sich nicht überschreiben.
 * Schlägt das Speichern fehl, wird der Haken zurückgenommen.
 */
export function OnboardingPanel({
  applicationId,
  items,
  state: initial,
  probationUntil,
  me,
}: {
  applicationId: string;
  items: string[];
  state: OnboardingState;
  probationUntil: string | null;
  /** Anzeigename für frisch gesetzte Haken (bis der Server antwortet) */
  me: string;
}) {
  const [state, setState] = useState<OnboardingState>(initial);
  const [saving, setSaving] = useState(0);
  // Neuer Stand vom Server (LiveRefresh, andere Teammitglieder) → übernehmen, außer es wird gerade gespeichert
  const initialKey = JSON.stringify(initial);
  const [seenKey, setSeenKey] = useState(initialKey);
  if (initialKey !== seenKey && saving === 0) {
    setSeenKey(initialKey);
    setState(initial);
  }
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const done = items.filter((i) => state[i]).length;

  /** Aufrufe nacheinander ausführen; Zähler für die kleine „speichert…“-Anzeige */
  function enqueue(task: () => Promise<void>) {
    setSaving((n) => n + 1);
    queue.current = queue.current.then(task).finally(() => setSaving((n) => n - 1));
  }

  function toggle(item: string, checked: boolean) {
    setError(null);
    const before = state[item];
    setState((s) => {
      const next = { ...s };
      if (checked) next[item] = { at: new Date().toISOString(), by: me };
      else delete next[item];
      return next;
    });
    enqueue(async () => {
      const r = await toggleOnboardingAction(applicationId, item, checked).catch(() => ({ ok: false as const, error: "Keine Verbindung." }));
      if (r.ok && r.data) {
        // Server-Stand für diesen Punkt übernehmen (Name/Zeit), andere Punkte nicht anfassen
        const server = r.data.state[item];
        setState((s) => {
          const next = { ...s };
          if (server) next[item] = server;
          else delete next[item];
          return next;
        });
      } else if (!r.ok) {
        setError(r.error ?? "Konnte nicht speichern.");
        setState((s) => {
          const next = { ...s };
          if (before) next[item] = before;
          else delete next[item];
          return next;
        });
      }
    });
  }

  function setProbation(value: string) {
    setError(null);
    enqueue(async () => {
      const r = await setProbationAction(applicationId, value ? new Date(`${value}T12:00:00`).toISOString() : null).catch(() => ({ ok: false as const, error: "Keine Verbindung." }));
      if (!r.ok) setError(r.error ?? "Konnte nicht speichern.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
          <div className="h-full bg-[var(--tone-success)] transition-[width] duration-150" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
        <span className="text-xs text-muted tabular-nums" aria-live="polite">
          {done}/{items.length}
          {saving > 0 && <span className="sr-only"> – wird gespeichert</span>}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const check = state[item];
          return (
            <li key={item}>
              <label className="flex items-start gap-2.5 cursor-pointer text-sm">
                <input type="checkbox" className="nv-check mt-0.5" checked={!!check} onChange={(e) => toggle(item, e.target.checked)} />
                <span>
                  <span className={check ? "text-muted line-through" : ""}>{item}</span>
                  {check && (
                    <span className="block text-[0.7rem] text-faint">
                      {check.by} · {new Date(check.at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line pt-3">
        <label htmlFor="probation" className="nv-field-label">
          Probezeit bis
        </label>
        <div className="flex gap-2">
          <input id="probation" type="date" className="nv-input" defaultValue={toDateInput(probationUntil)} onChange={(e) => setProbation(e.target.value)} />
        </div>
        <p className="nv-help mt-1">Kurz vor dem Ende erscheint die Person in der Team-Übersicht im Teamchat.</p>
      </div>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
