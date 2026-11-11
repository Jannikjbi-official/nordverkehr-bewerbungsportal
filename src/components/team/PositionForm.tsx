"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FloppyDisk, Trash } from "@phosphor-icons/react/ssr";
import { deletePositionAction, savePositionAction } from "@/app/actions/admin";
import { POSITION_ICON_KEYS_CLIENT, PositionIconClient } from "@/components/team/position-icons";

interface PositionData {
  id?: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  tasks: string[];
  requirements: string[];
  icon: string;
  status: "OPEN" | "CLOSED" | "HIDDEN";
  minAge: number | null;
  cooldownDays: number | null;
  acceptRoleId: string | null;
}

const EMPTY: PositionData = {
  slug: "",
  title: "",
  tagline: "",
  description: "",
  tasks: [],
  requirements: [],
  icon: "users",
  status: "CLOSED",
  minAge: null,
  cooldownDays: null,
  acceptRoleId: null,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function PositionForm({ position }: { position: PositionData | null }) {
  const router = useRouter();
  const [p, setP] = useState<PositionData>(position ?? EMPTY);
  const [tasks, setTasks] = useState((position?.tasks ?? []).join("\n"));
  const [reqs, setReqs] = useState((position?.requirements ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof PositionData>(k: K, v: PositionData[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setSaved(false);
  };
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  const optNum = (v: string) => (v === "" ? null : Number(v));

  function save() {
    setError(null);
    start(async () => {
      const res = await savePositionAction({ ...p, tasks: lines(tasks), requirements: lines(reqs), acceptRoleId: p.acceptRoleId || null });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      if (!p.id) router.push(`/team/positionen/${res.data.id}`);
      else router.refresh();
    });
  }

  return (
    <section className="nv-card p-5 sm:p-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-title" className="nv-field-label">
            Titel
          </label>
          <input
            id="p-title"
            className="nv-input"
            maxLength={60}
            value={p.title}
            onChange={(e) => {
              set("title", e.target.value);
              if (!p.id) set("slug", slugify(e.target.value));
            }}
          />
        </div>
        <div>
          <label htmlFor="p-slug" className="nv-field-label">
            URL-Slug
          </label>
          <input id="p-slug" className="nv-input font-mono text-sm" maxLength={60} value={p.slug} onChange={(e) => set("slug", slugify(e.target.value))} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-tag" className="nv-field-label">
            Kurzbeschreibung
          </label>
          <input id="p-tag" className="nv-input" maxLength={120} value={p.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="z. B. Discord Tickets, Spielerhilfe." />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-desc" className="nv-field-label">
            Beschreibung
          </label>
          <textarea id="p-desc" className="nv-input" rows={4} maxLength={2000} value={p.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div>
          <label htmlFor="p-tasks" className="nv-field-label">
            Aufgaben (eine pro Zeile)
          </label>
          <textarea id="p-tasks" className="nv-input text-sm" rows={5} value={tasks} onChange={(e) => { setTasks(e.target.value); setSaved(false); }} />
        </div>
        <div>
          <label htmlFor="p-reqs" className="nv-field-label">
            Anforderungen (eine pro Zeile)
          </label>
          <textarea id="p-reqs" className="nv-input text-sm" rows={5} value={reqs} onChange={(e) => { setReqs(e.target.value); setSaved(false); }} />
        </div>
      </div>

      <fieldset>
        <legend className="nv-field-label">Icon</legend>
        <div className="flex flex-wrap gap-2">
          {POSITION_ICON_KEYS_CLIENT.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={p.icon === k}
              aria-label={k}
              onClick={() => set("icon", k)}
              className={`h-11 w-11 grid place-items-center rounded-xl border transition-colors ${p.icon === k ? "border-red-line bg-red-soft text-red-text" : "border-line text-muted hover:text-fg"}`}
            >
              <PositionIconClient icon={k} />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="p-status" className="nv-field-label">
            Status
          </label>
          <select id="p-status" className="nv-input" value={p.status} onChange={(e) => set("status", e.target.value as PositionData["status"])}>
            <option value="OPEN">Offen</option>
            <option value="CLOSED">Geschlossen</option>
            <option value="HIDDEN">Versteckt</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-age" className="nv-field-label">
            Mindestalter
          </label>
          <input id="p-age" type="number" className="nv-input" placeholder="Standard" value={p.minAge ?? ""} onChange={(e) => set("minAge", optNum(e.target.value))} />
        </div>
        <div>
          <label htmlFor="p-cd" className="nv-field-label">
            Sperrfrist (Tage)
          </label>
          <input id="p-cd" type="number" className="nv-input" placeholder="Standard" value={p.cooldownDays ?? ""} onChange={(e) => set("cooldownDays", optNum(e.target.value))} />
        </div>
        <div>
          <label htmlFor="p-role" className="nv-field-label">
            Discord-Rolle bei Annahme
          </label>
          <input id="p-role" className="nv-input font-mono text-sm" inputMode="numeric" placeholder="Rollen-ID (optional)" value={p.acceptRoleId ?? ""} onChange={(e) => set("acceptRoleId", e.target.value.trim() || null)} />
        </div>
      </div>

      {error && <p className="nv-error">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {p.id ? (
          <button
            type="button"
            className="nv-btn nv-btn-danger nv-btn-sm"
            onClick={() => {
              if (!confirm("Position löschen? Geht nur ohne Bewerbungen.")) return;
              start(async () => {
                const res = await deletePositionAction(p.id!);
                if (!res.ok) setError(res.error);
                else router.push("/team/positionen");
              });
            }}
          >
            <Trash size={14} aria-hidden /> Löschen
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-[var(--tone-success)]">Gespeichert</span>}
          <button type="button" className="nv-btn nv-btn-primary" disabled={pending} onClick={save}>
            <FloppyDisk size={16} aria-hidden /> {pending ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>
    </section>
  );
}
