"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProbationAction, toggleOnboardingAction } from "@/app/actions/team";
import type { OnboardingState } from "@/lib/team/onboarding";

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");

/** Einarbeitung: Checkliste + Probezeit-Ende. */
export function OnboardingPanel({ applicationId, items, state, probationUntil }: { applicationId: string; items: string[]; state: OnboardingState; probationUntil: string | null }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = items.filter((i) => state[i]).length;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    run(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Fehler");
      else router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
          <div className="h-full bg-[var(--tone-success)] transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
        <span className="text-xs text-muted tabular-nums">
          {done}/{items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const check = state[item];
          return (
            <li key={item}>
              <label className="flex items-start gap-2.5 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="nv-check mt-0.5"
                  checked={!!check}
                  disabled={pending}
                  onChange={(e) => act(() => toggleOnboardingAction(applicationId, item, e.target.checked))}
                />
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
          <input
            id="probation"
            type="date"
            className="nv-input"
            defaultValue={toDateInput(probationUntil)}
            disabled={pending}
            onChange={(e) => act(() => setProbationAction(applicationId, e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null))}
          />
        </div>
        <p className="nv-help mt-1">Kurz vor dem Ende erscheint die Person in der Team-Übersicht im Teamchat.</p>
      </div>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
