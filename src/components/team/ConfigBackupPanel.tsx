"use client";

import { useState, useTransition } from "react";
import { DownloadSimple, UploadSimple, CheckCircle, WarningCircle } from "@phosphor-icons/react/ssr";
import { importConfigAction } from "@/app/actions/admin";
import { confirmDialog } from "@/components/ConfirmDialog";
import type { ImportReport } from "@/lib/admin/config-backup";

const line = (label: string, x: { created: number; updated: number }) => `${label}: ${x.created} neu, ${x.updated} aktualisiert`;

/** Sicherung herunterladen bzw. einspielen (mit Vorschau). */
export function ConfigBackupPanel() {
  const [json, setJson] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const describe = (r: ImportReport) =>
    [line("Positionen", r.positions), line("Schritte", r.sections), line("Fragen", r.questions), line("Bausteine", r.templates), `Einstellungen: ${r.settings}`].join(" · ");

  return (
    <section className="nv-card p-5 sm:p-6 space-y-4" aria-labelledby="backup-title">
      <div>
        <h2 id="backup-title" className="font-semibold text-lg">
          Einstellungen sichern & wiederherstellen
        </h2>
        <p className="text-sm text-muted mt-1">
          Positionen, Formular (inkl. Quiz-Lösungen), Nachrichtenbausteine und alle Einstellungen als Datei – z. B. für ein Testsystem oder als Sicherung vor
          größeren Umbauten. Bewerbungen und Nutzer sind nie enthalten. Beim Einspielen wird zusammengeführt: Vorhandenes wird aktualisiert, Fehlendes angelegt,
          nichts gelöscht.
        </p>
        <p className="text-xs text-muted mt-2">
          „Bewerbungsdaten sichern“ lädt zusätzlich alle Bewerbungen samt Antworten, Nachrichten, Kommentaren und Bewertungen herunter (nur zum Aufbewahren, kein
          Einspielen). Enthält personenbezogene Daten – sicher ablegen und nach den Löschfristen löschen. Der Download steht im Audit-Log.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/team/admin/config" className="nv-btn nv-btn-ghost nv-btn-sm" download>
          <DownloadSimple size={14} aria-hidden /> Sicherung herunterladen
        </a>
        <a
          href="/api/team/admin/data"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          download
          title="Alle Bewerbungen mit Antworten, Nachrichten, Kommentaren und Bewertungen – enthält personenbezogene Daten, sicher aufbewahren."
        >
          <DownloadSimple size={14} aria-hidden /> Bewerbungsdaten sichern
        </a>
        <label className="nv-btn nv-btn-quiet nv-btn-sm cursor-pointer">
          <UploadSimple size={14} aria-hidden /> Sicherung auswählen …
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setResult(null);
              setPreview(null);
              if (!f) return;
              setFileName(f.name);
              const text = await f.text();
              setJson(text);
              start(async () => {
                const r = await importConfigAction(text, true);
                if (!r.ok) return setResult({ ok: false, text: r.error });
                setPreview(r.data.report);
              });
            }}
          />
        </label>
      </div>
      {preview && json && (
        <div className="rounded-xl border border-line p-3 text-sm space-y-2">
          <p>
            <strong>{fileName}</strong> – Vorschau: {describe(preview)}
          </p>
          {preview.skipped.length > 0 && <p className="text-xs text-muted">Wird übersprungen: {preview.skipped.slice(0, 5).join("; ")}</p>}
          <button
            type="button"
            className="nv-btn nv-btn-primary nv-btn-sm"
            disabled={pending}
            onClick={async () => {
              if (!(await confirmDialog({ title: "Sicherung einspielen?", body: "Vorhandene Positionen, Fragen, Bausteine und Einstellungen werden überschrieben, wenn sie in der Datei stehen.", confirmLabel: "Einspielen" }))) return;
              start(async () => {
                const r = await importConfigAction(json, false);
                setPreview(null);
                setResult(r.ok ? { ok: true, text: `Eingespielt – ${describe(r.data.report)}` } : { ok: false, text: r.error });
              });
            }}
          >
            {pending ? "Spielt ein …" : "Jetzt einspielen"}
          </button>
        </div>
      )}
      {pending && !preview && <p className="text-sm text-muted">Prüfe Datei …</p>}
      {result && (
        <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${result.ok ? "nv-tone-success" : "nv-tone-danger"}`} role="status">
          {result.ok ? <CheckCircle size={16} className="shrink-0 mt-0.5" aria-hidden /> : <WarningCircle size={16} className="shrink-0 mt-0.5" aria-hidden />}
          {result.text}
        </p>
      )}
    </section>
  );
}
