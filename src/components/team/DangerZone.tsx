"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash, WarningOctagon } from "@phosphor-icons/react/ssr";
import { resetApplicationsAction } from "@/app/actions/admin";
import { HelpLink } from "@/components/team/HelpLink";

/**
 * Gefahrenzone: alle Bewerbungen löschen. Zweistufig – erst aufklappen, dann
 * den Bestätigungssatz exakt eintippen. Der Knopf bleibt bis dahin gesperrt.
 */
export function DangerZone({ counts, phrase }: { counts: { all: number; drafts: number; submitted: number }; phrase: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [resetNumbering, setResetNumbering] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const matches = typed.trim() === phrase;

  return (
    <section className="nv-card p-5 sm:p-6 border-[color-mix(in_srgb,var(--tone-danger)_45%,transparent)]" aria-labelledby="danger-title">
      <h2 id="danger-title" className="flex items-center gap-2 font-semibold text-lg text-[var(--tone-danger)]">
        <WarningOctagon size={20} aria-hidden /> Gefahrenzone
        <HelpLink id="daten-zuruecksetzen" className="ml-auto" />
      </h2>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">Alle Bewerbungen löschen</p>
          <p className="text-muted mt-0.5">
            Löscht <strong className="text-fg">{counts.all}</strong> Bewerbungen ({counts.submitted} eingereicht, {counts.drafts} Entwürfe) samt Antworten,
            Bildern, Nachrichten, Abstimmungen und Kommentaren sowie die gemerkten Basisantworten. Konten, Positionen, Fragen, Bausteine, Einstellungen,
            Sperren und Notizen bleiben. <strong className="text-fg">Lässt sich nicht rückgängig machen.</strong>
          </p>
        </div>
        {!open && (
          <button type="button" className="nv-btn nv-btn-danger nv-btn-sm shrink-0" onClick={() => setOpen(true)} disabled={counts.all === 0}>
            <Trash size={14} aria-hidden /> Daten zurücksetzen
          </button>
        )}
      </div>

      {open && (
        <form
          className="mt-4 space-y-3 rounded-xl border border-[color-mix(in_srgb,var(--tone-danger)_35%,transparent)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches) return;
            start(async () => {
              setResult(null);
              const r = await resetApplicationsAction({ confirm: typed, resetNumbering });
              setResult(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
              if (r.ok) {
                setOpen(false);
                setTyped("");
                router.refresh();
              }
            });
          }}
        >
          <label htmlFor="reset-confirm" className="nv-field-label">
            Zum Bestätigen tippe <span className="font-mono text-[var(--tone-danger)]">{phrase}</span>
          </label>
          <input
            id="reset-confirm"
            className="nv-input font-mono"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-describedby="reset-hint"
          />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="nv-check !mt-0.5" checked={resetNumbering} onChange={(e) => setResetNumbering(e.target.checked)} />
            <span>
              Bewerbungs-Nummern wieder bei 1 beginnen
              <span id="reset-hint" className="block nv-help">Sonst zählen neue Bewerbungen dort weiter, wo sie aufgehört haben.</span>
            </span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => { setOpen(false); setTyped(""); }} disabled={pending}>
              Abbrechen
            </button>
            <button type="submit" className="nv-btn nv-btn-danger nv-btn-sm" disabled={!matches || pending}>
              <Trash size={14} aria-hidden /> {pending ? "Löscht …" : `Endgültig ${counts.all} Bewerbungen löschen`}
            </button>
          </div>
        </form>
      )}

      {result && (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-sm ${result.ok ? "nv-tone-success" : "nv-tone-danger"}`} role="status" data-testid="reset-result">
          {result.text}
        </p>
      )}
    </section>
  );
}
