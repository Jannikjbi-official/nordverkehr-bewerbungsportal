"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle, Flask, Trash, WarningCircle } from "@phosphor-icons/react/ssr";
import { createTestApplicationsAction, deleteTestApplicationsAction } from "@/app/actions/admin";
import { confirmDialog } from "@/components/ConfirmDialog";

interface Scenario {
  key: string;
  label: string;
  description: string;
}

/** Admin: Testbewerbungen pro Stelle und Szenario anlegen bzw. alle wieder löschen. */
export function TestDataPanel({ positions, scenarios, existing }: { positions: { id: string; title: string; status: string }[]; scenarios: Scenario[]; existing: number }) {
  const router = useRouter();
  const [pos, setPos] = useState<string[]>(positions.filter((p) => p.status !== "HIDDEN").map((p) => p.id));
  const [sc, setSc] = useState<string[]>(scenarios.map((s) => s.key));
  const [postToDiscord, setPostToDiscord] = useState(false);
  const [runAi, setRunAi] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (list: string[], set: (v: string[]) => void, key: string) => set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const total = pos.length * sc.length;

  const run = (fn: () => Promise<{ ok: true; data: { message: string } } | { ok: false; error: string }>) =>
    start(async () => {
      setResult(null);
      const r = await fn();
      setResult(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <section className="nv-card p-5 sm:p-6 space-y-4" aria-labelledby="test-title">
      <div>
        <h2 id="test-title" className="flex items-center gap-2 font-semibold text-lg">
          <Flask size={20} aria-hidden /> Testbewerbungen
        </h2>
        <p className="text-sm text-muted mt-1">
          Legt pro Stelle und Szenario eine eingereichte Bewerbung an – zum Durchspielen von Hinweisen, KI, Bewertung, Status, Nachrichten, Terminen und Protokoll.
          Testbewerber sind keine echten Discord-Accounts: <strong className="text-fg">DMs und Rollen werden nie verschickt</strong>. Testbewerbungen heißen „TEST-0001“,
          sind in Liste und Board markiert und zählen nicht in Statistik und Höchstzahl.
        </p>
      </div>

      <fieldset>
        <legend className="nv-field-label">Stellen</legend>
        <div className="flex flex-wrap gap-2">
          {positions.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm cursor-pointer">
              <input type="checkbox" className="nv-check !mt-0" checked={pos.includes(p.id)} onChange={() => toggle(pos, setPos, p.id)} />
              {p.title}
              {p.status !== "OPEN" && <span className="text-xs text-muted">({p.status === "CLOSED" ? "geschlossen" : "versteckt"})</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="nv-field-label">Szenarien</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {scenarios.map((s) => (
            <label key={s.key} className="flex items-start gap-2 rounded-lg border border-line px-2.5 py-2 text-sm cursor-pointer">
              <input type="checkbox" className="nv-check !mt-0.5" checked={sc.includes(s.key)} onChange={() => toggle(sc, setSc, s.key)} />
              <span>
                <span className="font-medium">{s.label}</span>
                <span className="block text-xs text-muted">{s.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="nv-check" checked={postToDiscord} onChange={(e) => setPostToDiscord(e.target.checked)} />
          <span>
            <span className="text-sm font-medium">Auch im Bewerbungs-Kanal posten</span>
            <span className="block nv-help">Wie echte Bewerbungen (mit „Übernehmen“-Knopf und Thread, falls eingeschaltet) – markiert mit „(TEST)“.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="nv-check" checked={runAi} onChange={(e) => setRunAi(e.target.checked)} />
          <span>
            <span className="text-sm font-medium">KI-Einordnung und KI-Punkte gleich anstoßen</span>
            <span className="block nv-help">Kostet KI-Budget (pro Testbewerbung zwei Anfragen). Ohne Haken bewertet die KI beim ersten Öffnen, wie sonst auch.</span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="nv-btn nv-btn-primary nv-btn-sm"
          disabled={pending || total === 0}
          onClick={() => run(() => createTestApplicationsAction({ positionIds: pos, scenarios: sc, postToDiscord, runAi }))}
          data-testid="create-tests"
        >
          <Flask size={14} aria-hidden /> {pending ? "Lege an …" : `${total} Testbewerbung${total === 1 ? "" : "en"} anlegen`}
        </button>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          disabled={pending || existing === 0}
          onClick={async () =>
            (await confirmDialog({
              title: "Alle Testbewerbungen löschen?",
              body: `${existing} Testbewerbung${existing === 1 ? "" : "en"} samt Testbewerbern, Nachrichten, Bewertungen und Protokollen. Echte Bewerbungen bleiben unberührt.`,
              confirmLabel: "Löschen",
              tone: "danger",
            })) && run(() => deleteTestApplicationsAction())
          }
        >
          <Trash size={14} aria-hidden /> Alle Testbewerbungen löschen ({existing})
        </button>
      </div>
      {result && (
        <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${result.ok ? "nv-tone-success" : "nv-tone-danger"}`} role="status">
          {result.ok ? <CheckCircle size={16} className="shrink-0 mt-0.5" aria-hidden /> : <WarningCircle size={16} className="shrink-0 mt-0.5" aria-hidden />}
          {result.text}
        </p>
      )}
    </section>
  );
}
