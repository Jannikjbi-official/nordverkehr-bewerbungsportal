import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AUDIT_LABELS } from "@/lib/audit";
import { formatDayTime } from "@/components/ui";

export const metadata: Metadata = { title: "Audit-Log" };
const PAGE = 50;

export default function AuditPage({ searchParams }: PageProps<"/team/audit">) {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Audit</p>
        <h1 className="nv-headline text-4xl mt-2">
          Audit-<em>Log.</em>
        </h1>
        <p className="text-sm text-muted mt-2">Wer hat wann was gemacht. Einträge werden nach der eingestellten Frist automatisch gelöscht.</p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <AuditList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AuditList({ searchParams }: Pick<PageProps<"/team/audit">, "searchParams">) {
  await requireTeam();
  const sp = await searchParams;
  const action = typeof sp.aktion === "string" && sp.aktion in AUDIT_LABELS ? sp.aktion : undefined;
  const page = Math.max(1, Math.min(500, Number(sp.seite) || 1));
  const where = action ? { action } : {};
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    db.auditLog.count({ where }),
  ]);
  const href = (p: number) => `?${new URLSearchParams({ ...(action ? { aktion: action } : {}), seite: String(p) })}`;

  const targetLink = (type: string | null, id: string | null) => {
    if (!type || !id) return null;
    if (type === "application") return `/team/bewerbungen/${id}`;
    if (type === "user") return `/team/nutzer/${id}`;
    return null;
  };

  return (
    <div className="space-y-4">
      <form className="flex gap-2 max-w-md">
        <label htmlFor="aktion" className="sr-only">
          Aktion
        </label>
        <select id="aktion" name="aktion" className="nv-input" defaultValue={action ?? ""}>
          <option value="">Alle Aktionen</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="nv-btn nv-btn-ghost">Filtern</button>
      </form>
      <div className="nv-card overflow-hidden">
        <div className="nv-scroll-x">
          <table className="nv-table w-full text-sm min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Zeitpunkt</th>
                <th scope="col">Wer</th>
                <th scope="col">Aktion</th>
                <th scope="col">Ziel</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const link = targetLink(r.targetType, r.targetId);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-muted">{formatDayTime(r.createdAt)}</td>
                    <td>{r.actor ? (r.actor.globalName ?? r.actor.username) : <span className="text-muted">System</span>}</td>
                    <td>{AUDIT_LABELS[r.action] ?? r.action}</td>
                    <td>{link ? <Link className="nv-link" href={link}>{r.targetType}</Link> : <span className="text-muted">{r.targetType ?? "–"}</span>}</td>
                    <td className="font-mono text-xs text-muted max-w-xs truncate" title={r.meta ? JSON.stringify(r.meta) : ""}>
                      {r.meta ? JSON.stringify(r.meta) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="p-6 text-sm text-muted">Keine Einträge.</p>}
      </div>
      <nav className="flex justify-between text-sm" aria-label="Seiten">
        <span className="text-muted">{total} Einträge</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="nv-btn nv-btn-ghost nv-btn-sm" href={href(page - 1)}>Neuer</Link>}
          {page * PAGE < total && <Link className="nv-btn nv-btn-ghost nv-btn-sm" href={href(page + 1)}>Älter</Link>}
        </div>
      </nav>
    </div>
  );
}
