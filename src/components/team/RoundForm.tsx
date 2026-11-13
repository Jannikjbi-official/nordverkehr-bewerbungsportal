"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createRoundAction, deleteRoundAction } from "@/app/actions/admin";
import { confirmDialog } from "@/components/ConfirmDialog";

/** Neue Bewerbungsrunde anlegen (Admins). */
export function RoundForm({ positions }: { positions: { id: string; title: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [positionId, setPositionId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = () =>
    start(async () => {
      setError(null);
      const r = await createRoundAction({ name, positionId: positionId || null, startsAt, endsAt, target: target ? Number(target) : null });
      if (!r.ok) return setError(r.error);
      setName("");
      setTarget("");
      router.refresh();
    });
  return (
    <div className="nv-card p-5 space-y-3">
      <h2 className="font-semibold">Neue Runde</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="nv-input" placeholder="z. B. Support-Runde Dezember" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <select className="nv-input" value={positionId} onChange={(e) => setPositionId(e.target.value)} aria-label="Stelle">
          <option value="">Alle Stellen</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <label className="text-xs text-muted">
          Start
          <input type="date" className="nv-input mt-1" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Ende
          <input type="date" className="nv-input mt-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <input type="number" min={1} className="nv-input" placeholder="Ziel: Annahmen (optional)" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Ziel" />
      </div>
      <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || !name || !startsAt || !endsAt} onClick={save}>
        Runde anlegen
      </button>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}

export function DeleteRoundButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="nv-link text-xs"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmDialog({ title: `„${name}“ löschen?`, body: "Nur die Runde verschwindet – Bewerbungen bleiben unverändert.", confirmLabel: "Löschen", tone: "danger" }))) return;
        start(async () => {
          await deleteRoundAction(id);
          router.refresh();
        });
      }}
    >
      Löschen
    </button>
  );
}
