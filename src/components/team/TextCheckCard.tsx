"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardText, ListChecks, Robot } from "@phosphor-icons/react/ssr";
import { textCheckAction } from "@/app/actions/team";
import type { TextCheckResult } from "@/lib/ai/textcheck-rules";

const TONE = { niedrig: "nv-tone-success", mittel: "nv-tone-warn", hoch: "nv-tone-danger" } as const;
const TITLE = {
  niedrig: "Kein Hinweis auf KI-Text",
  mittel: "Teilweise Hinweise auf KI-Text",
  hoch: "Antworten wirken KI-geschrieben",
} as const;
const ICON = { einfuegen: ClipboardText, regel: ListChecks, ki: Robot } as const;

/** Ergebnis des KI-Text-Checks – nur Hinweis, kein Beweis. */
export function TextCheckCard({ applicationId, result, checkedAt }: { applicationId: string; result: TextCheckResult | null; checkedAt: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setError(null);
      const r = await textCheckAction(applicationId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });

  if (!result) {
    return (
      <div className="nv-card p-4 flex flex-wrap items-center gap-3 text-sm" data-testid="textcheck">
        <Robot size={18} className="text-muted" aria-hidden />
        <span className="text-muted flex-1">Noch kein KI-Text-Check für diese Bewerbung.</span>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={run}>
          {pending ? "Prüfe …" : "Jetzt prüfen"}
        </button>
        {error && <span className="nv-error text-xs w-full">{error}</span>}
      </div>
    );
  }

  return (
    <details className={`rounded-2xl border px-4 py-3 text-sm ${TONE[result.level]}`} open={result.level !== "niedrig"} data-testid="textcheck">
      <summary className="cursor-pointer flex flex-wrap items-center gap-2 font-medium">
        <Robot size={16} aria-hidden /> KI-Text-Check: {TITLE[result.level]}
        <span className="text-xs font-normal opacity-80">({result.level}{result.aiUsed ? ", Regeln + KI" : ", nur Regeln"})</span>
      </summary>
      <div className="mt-2 space-y-2 text-fg-2">
        {result.signals.length ? (
          <ul className="space-y-1">
            {result.signals.map((s, i) => {
              const I = ICON[s.source] ?? Robot;
              return (
                <li key={i} className="flex gap-2">
                  <I size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{s.text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Keine Auffälligkeiten gefunden.</p>
        )}
        <p className="text-xs opacity-80">
          Nur ein Hinweis, kein Beweis: KI-Texte lassen sich nicht sicher erkennen, gute Schreiber werden manchmal falsch eingeschätzt. Im Gespräch einfach nach
          Details fragen.{checkedAt ? ` Geprüft ${new Date(checkedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}.` : ""}
        </p>
        {error && <p className="nv-error text-xs">{error}</p>}
      </div>
    </details>
  );
}
