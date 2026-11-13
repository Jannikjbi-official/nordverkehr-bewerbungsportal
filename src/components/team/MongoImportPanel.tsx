"use client";

import { useState } from "react";
import { IMPORT_CONFIRM_PHRASE } from "@/lib/setup/mongo-import-shared";

type Overview = { available: boolean; dbName?: string; counts?: Record<string, number>; postgres?: { applications: number; users: number }; error?: string };
type Report = { totalSource: number; totalInserted: number; clearedRefs: number; filledRequired: number; ms: number; tables: { model: string; source: number; inserted: number }[] };

const LABEL: Record<string, string> = {
  Application: "Bewerbungen",
  Answer: "Antworten",
  User: "Konten",
  Message: "Nachrichten",
  Position: "Stellen",
  Question: "Fragen",
  Setting: "Einstellungen",
  MessageTemplate: "Bausteine",
  Suggestion: "Ideen & Fehler",
  AuditLog: "Audit-Log",
};

/**
 * Umzug MongoDB → Neon: Bestand prüfen, dann mit Bestätigungswort übernehmen.
 * Ersetzt alles in Postgres; MongoDB bleibt unverändert (Sicherung).
 */
export function MongoImportPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setLoading(true);
    setError(null);
    const r = await fetch("/api/team/admin/mongo-import").catch(() => null);
    const data = (await r?.json().catch(() => null)) as Overview | null;
    setLoading(false);
    if (!data) return setError("Keine Verbindung zum Portal.");
    if (data.error) setError(data.error);
    setOverview(data);
  }

  async function run() {
    setLoading(true);
    setError(null);
    const r = await fetch("/api/team/admin/mongo-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) }).catch(() => null);
    const data = (await r?.json().catch(() => null)) as { ok?: boolean; report?: Report; error?: string } | null;
    setLoading(false);
    if (!data?.ok || !data.report) return setError(data?.error ?? "Übernahme fehlgeschlagen.");
    setReport(data.report);
  }

  if (report) {
    return (
      <div className="space-y-3" role="status">
        <p className="font-semibold text-[var(--tone-success)]">
          Fertig: {report.totalInserted} von {report.totalSource} Einträgen übernommen ({(report.ms / 1000).toFixed(1)} s).
        </p>
        {report.clearedRefs > 0 && <p className="text-sm text-muted">{report.clearedRefs} Verweise auf nicht mehr vorhandene Einträge wurden geleert.</p>}
        <p className="text-sm text-fg-2">
          <strong>Bitte einmal ab- und wieder anmelden</strong> – dein Konto wurde durch das aus MongoDB ersetzt.
        </p>
        <a href="/login" className="nv-btn nv-btn-primary nv-btn-sm">
          Neu anmelden
        </a>
      </div>
    );
  }

  const total = overview?.counts ? Object.values(overview.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="space-y-4">
      {!overview && (
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={check} disabled={loading}>
          {loading ? "Prüfe …" : "Bestand in MongoDB prüfen"}
        </button>
      )}
      {overview && !overview.available && <p className="text-sm text-muted">Keine MongoDB-Verbindung gesetzt (Variable DATABASE_URL_MONGODB_URI) – nichts zu übernehmen.</p>}
      {overview?.counts && (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {Object.entries(LABEL).map(([k, l]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-line py-1">
                <dt className="text-muted">{l}</dt>
                <dd className="tabular-nums">{overview.counts?.[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            Insgesamt {total} Einträge in MongoDB „{overview.dbName}“. In Neon liegen gerade {overview.postgres?.applications ?? 0} Bewerbungen und {overview.postgres?.users ?? 0} Konten – sie werden ersetzt.
          </p>
          <div className="rounded-xl border border-[var(--tone-warn)]/40 bg-[var(--tone-warn-bg)] p-3 text-sm">
            Alles in Neon wird durch den Stand aus MongoDB ersetzt. MongoDB selbst bleibt unverändert. Danach musst du dich neu anmelden.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="nv-field-label">
                Zum Bestätigen „{IMPORT_CONFIRM_PHRASE}“ eintippen
              </span>
              <input className="nv-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </label>
            <button type="button" className="nv-btn nv-btn-primary" disabled={loading || confirm !== IMPORT_CONFIRM_PHRASE || total === 0} onClick={run}>
              {loading ? "Übernehme … (kann etwas dauern)" : "Daten übernehmen"}
            </button>
          </div>
        </>
      )}
      {error && <p className="nv-error text-sm">{error}</p>}
    </div>
  );
}
