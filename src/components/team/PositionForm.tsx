"use client";

import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";
import { POSITION_STATUS_OPTIONS } from "@/lib/positions-status";
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
  /** ISO-Zeitpunkte oder null */
  opensAt: string | null;
  closesAt: string | null;
  maxApplications: number | null;
  quizMinScore: number | null;
  interviewQuestions: string[];
  minProVotes: number | null;
  requireAdminApproval: boolean;
  teamRoleIds: string[];
}

/** ISO → Wert für <input type="datetime-local"> (lokale Zeit des Browsers) */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

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
  opensAt: null,
  closesAt: null,
  maxApplications: null,
  quizMinScore: null,
  interviewQuestions: [],
  minProVotes: null,
  requireAdminApproval: false,
  teamRoleIds: [],
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

export function PositionForm({ position, applicationCount = 0 }: { position: PositionData | null; applicationCount?: number }) {
  const router = useRouter();
  const [p, setP] = useState<PositionData>(position ?? EMPTY);
  const [tasks, setTasks] = useState((position?.tasks ?? []).join("\n"));
  const [ivq, setIvq] = useState((position?.interviewQuestions ?? []).join("\n"));
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
      const res = await savePositionAction({ ...p, tasks: lines(tasks), requirements: lines(reqs), interviewQuestions: lines(ivq), acceptRoleId: p.acceptRoleId || null });
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
        <div className="sm:col-span-2">
          <label htmlFor="p-ivq" className="nv-field-label">
            Gesprächsfragen fürs Protokoll (eine pro Zeile)
          </label>
          <textarea id="p-ivq" className="nv-input text-sm" rows={4} placeholder="Leer = Standard-Fragen aus den Einstellungen" value={ivq} onChange={(e) => { setIvq(e.target.value); setSaved(false); }} />
          <p className="nv-help mt-1">Nur für das Team: erscheinen im Reiter „Gespräch“ der Bewerbung zum Abhaken, mit Notizen pro Frage.</p>
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
          <Select id="p-status" options={POSITION_STATUS_OPTIONS} value={p.status} onChange={(v) => set("status", v)} />
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
        <div>
          <label htmlFor="p-quiz" className="nv-field-label">
            Regel-Quiz: Mindestpunkte
          </label>
          <input id="p-quiz" type="number" min={0} className="nv-input" placeholder="kein Minimum" value={p.quizMinScore ?? ""} onChange={(e) => set("quizMinScore", optNum(e.target.value))} />
          <p className="nv-help mt-1">Nur Hinweis fürs Team (rote Pille), kein automatischer Ausschluss. Quizfragen legst du unten als Fragetyp „Quiz“ an.</p>
        </div>
        <div>
          <label htmlFor="p-minpro" className="nv-field-label">
            Vier-Augen: Pro-Stimmen für Annahme
          </label>
          <input id="p-minpro" type="number" min={1} max={20} className="nv-input" placeholder="keine Mindestzahl" value={p.minProVotes ?? ""} onChange={(e) => set("minProVotes", optNum(e.target.value))} />
          <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="nv-check !mt-0" checked={p.requireAdminApproval} onChange={(e) => set("requireAdminApproval", e.target.checked)} />
            Annahme nur durch Admins
          </label>
          <p className="nv-help mt-1">„Angenommen“ geht erst, wenn genug Teammitglieder mit Pro gestimmt haben bzw. ein Admin annimmt.</p>
        </div>
        <div>
          <label htmlFor="p-roles" className="nv-field-label">
            Zuständige Discord-Rollen
          </label>
          <input
            id="p-roles"
            className="nv-input font-mono text-sm"
            placeholder="leer = ganzes Team"
            value={p.teamRoleIds.join(", ")}
            onChange={(e) => set("teamRoleIds", e.target.value.split(/[\s,]+/).map((x) => x.replace(/\D/g, "")).filter(Boolean))}
          />
          <p className="nv-help mt-1">Rollen-IDs, mit Komma getrennt. Dann sehen nur Teammitglieder mit einer dieser Rollen (und Admins) die Bewerbungen dieser Stelle.</p>
        </div>
      </div>

      <fieldset className="rounded-xl border border-line p-4 space-y-3">
        <legend className="px-1 text-sm font-medium">Automatisch öffnen &amp; schließen</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="p-open" className="nv-field-label">
              Öffnet am
            </label>
            <input id="p-open" type="datetime-local" className="nv-input" value={toLocalInput(p.opensAt)} onChange={(e) => set("opensAt", fromLocalInput(e.target.value))} />
          </div>
          <div>
            <label htmlFor="p-close" className="nv-field-label">
              Schließt am
            </label>
            <input id="p-close" type="datetime-local" className="nv-input" value={toLocalInput(p.closesAt)} onChange={(e) => set("closesAt", fromLocalInput(e.target.value))} />
          </div>
          <div>
            <label htmlFor="p-max" className="nv-field-label">
              Höchstzahl Bewerbungen
            </label>
            <input id="p-max" type="number" min={1} className="nv-input" placeholder="unbegrenzt" value={p.maxApplications ?? ""} onChange={(e) => set("maxApplications", optNum(e.target.value))} />
            {p.maxApplications ? (
              <p className="nv-help mt-1">
                Bisher {applicationCount} von {p.maxApplications}.
              </p>
            ) : null}
          </div>
        </div>
        <p className="nv-help">
          Der Bot prüft die Daten jede Nacht um 0 Uhr (und morgens noch einmal) – also am besten ganze Tage wählen. „Öffnet am“ wirkt nur bei geschlossenen Stellen. Ist die Höchstzahl erreicht, schließt die Stelle sofort. Bei jeder Öffnung bekommen Vorgemerkte eine DM, der Stellenaufruf in Discord aktualisiert sich selbst.
        </p>
      </fieldset>

      {error && <p className="nv-error">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {p.id ? (
          <button
            type="button"
            className="nv-btn nv-btn-danger nv-btn-sm"
            onClick={async () => {
              if (!(await confirmDialog({ title: "Position löschen?", body: "Geht nur, solange es keine Bewerbungen darauf gibt.", confirmLabel: "Löschen", tone: "danger" }))) return;
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
