"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDigestOptOutAction } from "@/app/actions/application";

/** Teammitglieder: persönliche Morgen-DM mit den eigenen offenen Punkten an/aus. */
export function DigestToggle({ on, globallyOff }: { on: boolean; globallyOff: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = (next: boolean) =>
    start(async () => {
      setError(null);
      const r = await setDigestOptOutAction(!next);
      if (!r.ok) return setError(r.error);
      setValue(next);
      router.refresh();
    });
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="nv-check" checked={value} disabled={pending} onChange={(e) => toggle(e.target.checked)} />
        <span>
          <span className="text-sm font-medium">Morgen-DM mit meinen offenen Punkten</span>
          <span className="block nv-help">
            Kommt nur, wenn bei deinen geclaimten Bewerbungen etwas ansteht – z. B. „2 Bewerber warten auf deine Antwort, 1 Gespräch heute“.
            {globallyOff && " Gerade für alle in den Einstellungen ausgeschaltet."}
          </span>
        </span>
      </label>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
