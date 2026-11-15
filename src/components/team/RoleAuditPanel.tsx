"use client";

import { useState, useTransition } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { fixRoleAction, roleAuditAction, type RoleAuditReport } from "@/app/actions/admin";

type Row = RoleAuditReport["missing"][number];

/** Rollen-Abgleich: zeigt, wo Portal und Discord nicht zusammenpassen, und behebt es auf Knopfdruck. */
export function RoleAuditPanel() {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<RoleAuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const check = () =>
    start(async () => {
      setError(null);
      const r = await roleAuditAction();
      if (r.ok) {
        setReport(r.data);
        setDone(new Set());
      } else setError(r.error);
    });

  const fix = (row: Row, mode: "add" | "remove") =>
    start(async () => {
      if (mode === "remove" && !(await confirmDialog({ title: "Rolle entfernen?", body: `${row.name} verliert die Rolle der Stelle „${row.position}“ auf Discord.`, confirmLabel: "Entfernen", tone: "danger" }))) return;
      const r = await fixRoleAction({ discordId: row.discordId, roleId: row.roleId, mode });
      if (r.ok) setDone((d) => new Set(d).add(`${row.discordId}:${row.roleId}`));
      else setError(r.error);
    });

  const list = (rows: Row[], mode: "add" | "remove" | null, label: string) => (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const key = `${r.discordId}:${r.roleId}`;
        return (
          <li key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{r.name}</span> <span className="text-muted">· {r.position}</span>
            </span>
            {mode &&
              (done.has(key) ? (
                <span className="text-xs text-[var(--tone-success)]">erledigt</span>
              ) : (
                <button type="button" className={`nv-btn nv-btn-sm ${mode === "remove" ? "nv-btn-danger" : "nv-btn-ghost"}`} disabled={pending} onClick={() => fix(r, mode)}>
                  {label}
                </button>
              ))}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="nv-card p-5 space-y-4" data-testid="role-audit">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">Rollen-Abgleich</h2>
          <p className="text-sm text-muted">Vergleicht Annahmen im Portal mit den Rollen der Stellen auf Discord. Ändert nichts, bis du einen Knopf drückst.</p>
        </div>
        <button type="button" className="nv-btn nv-btn-primary nv-btn-sm shrink-0" disabled={pending} onClick={check}>
          {pending && !report ? "Prüft …" : "Jetzt prüfen"}
        </button>
      </div>
      {error && <p className="nv-error text-sm">{error}</p>}
      {report && (
        <div className="space-y-4">
          <p className="text-xs text-muted">{report.checked} Mitglieder auf Discord geprüft.</p>
          {report.missing.length + report.extra.length + report.notInGuild.length === 0 && <p className="text-sm text-[var(--tone-success)]">✓ Alles passt zusammen.</p>}
          {report.missing.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Angenommen, aber Rolle fehlt ({report.missing.length})</p>
              {list(report.missing, "add", "Rolle geben")}
            </div>
          )}
          {report.extra.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Hat die Rolle, ist im Portal aber nicht angenommen ({report.extra.length})</p>
              <p className="text-xs text-muted">Kann gewollt sein (z. B. vor dem Portal ins Team gekommen). Im Zweifel erst nachfragen.</p>
              {list(report.extra, "remove", "Rolle entfernen")}
            </div>
          )}
          {report.notInGuild.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Angenommen, aber nicht mehr auf dem Server ({report.notInGuild.length})</p>
              {list(report.notInGuild, null, "")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
