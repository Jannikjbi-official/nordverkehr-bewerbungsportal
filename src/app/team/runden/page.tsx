import type { Metadata } from "next";
import { Suspense } from "react";
import { cn, formatDay } from "@/components/ui";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/time";
import { loadRounds, roundPhase } from "@/lib/team/rounds";
import { DeleteRoundButton, RoundForm } from "@/components/team/RoundForm";

export const metadata: Metadata = { title: "Bewerbungsrunden" };

export default function RoundsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Runden</p>
        <h1 className="nv-headline text-4xl mt-2">
          Bewerbungs<em>runden.</em>
        </h1>
        <p className="text-sm text-muted mt-2">Zeiträume mit Ziel – z. B. „Support-Runde Dezember, 3 neue Leute“. Gezählt wird nach Eingangsdatum, ohne Testbewerbungen.</p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-72" />}>
        <Rounds />
      </Suspense>
    </div>
  );
}

async function Rounds() {
  const { access } = await requireTeam();
  const [rounds, positions] = await Promise.all([loadRounds(db), db.position.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, title: true } })]);
  const title = new Map(positions.map((p) => [p.id, p.title]));
  const now = nowMs();
  return (
    <div className="space-y-4">
      {access.isAdmin && <RoundForm positions={positions} />}
      {rounds.length === 0 && <p className="text-sm text-muted">Noch keine Runde angelegt.</p>}
      <ul className="grid gap-4 md:grid-cols-2">
        {rounds.map((r) => {
          const phase = roundPhase(r, now);
          const s = r.stats;
          return (
            <li key={r.id} className="nv-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{r.name}</h2>
                  <p className="text-xs text-muted">
                    {r.positionId ? (title.get(r.positionId) ?? "Gelöschte Stelle") : "Alle Stellen"} · {formatDay(r.startsAt)} – {formatDay(r.endsAt)}
                  </p>
                </div>
                <span className={cn("nv-pill !text-[0.7rem]", phase === "läuft" ? "nv-tone-success" : phase === "geplant" ? "nv-tone-info" : "")}>{phase}</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Eingänge", s.total],
                  ["Angenommen", r.target ? `${s.accepted}/${r.target}` : s.accepted],
                  ["Offen", s.open],
                  ["Abgelehnt", s.rejected],
                  ["Zurückgezogen", s.withdrawn],
                  ["Ø bis Entscheidung", s.avgDays === null ? "–" : `${s.avgDays.toLocaleString("de-DE")} T.`],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border border-line p-2">
                    <dt className="text-[0.65rem] text-muted">{k}</dt>
                    <dd className="font-display text-lg tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center justify-between">
                {s.targetReached === null ? <span /> : s.targetReached ? <span className="text-xs text-[var(--tone-success)]">✓ Ziel erreicht</span> : <span className="text-xs text-muted">Ziel noch nicht erreicht</span>}
                {access.isAdmin && <DeleteRoundButton id={r.id} name={r.name} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
