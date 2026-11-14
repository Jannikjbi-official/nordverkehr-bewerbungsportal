"use client";

import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useState, useTransition } from "react";
import { ArrowClockwise, CheckCircle, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react/ssr";
import { deleteChangelogPostsAction, discordTestAction, flushOutboxAction, postChangelogNowAction, postSummaryNowAction, postWeeklyNowAction, registerCommandsAction, runDailyTasksAction, scanGuildNowAction, setupInteractionsAction } from "@/app/actions/admin";

export interface FailedJob {
  id: string;
  type: string;
  status: string;
  target: string;
  error: string | null;
  when: string;
}

type Result = { ok: true; data: { message: string } } | { ok: false; error: string };

/** Discord-Zustellung prüfen: Testnachricht pro Kanal, Changelog erneut posten, Fehlerliste. */
export function DiscordDiagnostics({ failed, pending }: { failed: FailedJob[]; pending: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ label: string; ok: boolean; text: string } | null>(null);

  const run = (label: string, fn: () => Promise<Result>) =>
    start(async () => {
      setResult(null);
      const r = await fn();
      setResult({ label, ok: r.ok, text: r.ok ? r.data.message : r.error });
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="nv-btn nv-btn-primary nv-btn-sm"
          disabled={busy}
          data-testid="run-daily"
          onClick={async () =>
            (await confirmDialog({
              title: "Tagesaufgaben jetzt ausführen?",
              body: "Team-Übersicht, Erinnerungen, liegengebliebene Claims, Rückfrage-Fristen, Stellen-Zeitplan, Changelog-Post und Löschfristen laufen sofort. Was heute schon verschickt wurde, geht nicht doppelt raus.\n\nOhne Knopf passiert das einmal am Tag beim ersten Aufruf im Team-Bereich ab 8 Uhr.",
              confirmLabel: "Ausführen",
            })) && run("Tagesaufgaben", () => runDailyTasksAction())
          }
        >
          <ArrowClockwise size={14} aria-hidden /> Tagesaufgaben jetzt ausführen
        </button>
        {(
          [
            ["applications", "Test: Bewerbungs-Kanal"],
            ["botLog", "Test: Bot-Log-Kanal"],
            ["changelog", "Test: Changelog-Kanal"],
            ["summary", "Test: Teamchat"],
            ["lead", "Test: Leitungs-Chat"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={busy} onClick={() => run(l, () => discordTestAction(k))}>
            <PaperPlaneTilt size={14} aria-hidden /> {l}
          </button>
        ))}
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          disabled={busy}
          onClick={async () =>
            (await confirmDialog({
              title: "Team-Übersicht jetzt posten?",
              body: "Die Übersicht geht sofort in den Teamchat – auch wenn sie heute schon kam. Liegt etwas seit Langem, bekommt auch der Leitungs-Chat einen Hinweis.",
              confirmLabel: "Jetzt posten",
            })) && run("Team-Übersicht", () => postSummaryNowAction())
          }
        >
          <PaperPlaneTilt size={14} aria-hidden /> Team-Übersicht jetzt posten
        </button>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={busy} onClick={() => run("Changelog", () => postChangelogNowAction())}>
          <ArrowClockwise size={14} aria-hidden /> Fertige Changelog-Tage jetzt posten
        </button>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          disabled={busy}
          onClick={async () =>
            (await confirmDialog({
              title: "Changelog-Posts löschen?",
              body: "Alle Changelog-Posts des Bots im Kanal werden gelöscht. Die Versionen werden beim nächsten Tageslauf (oder per Knopf) neu gepostet.",
              confirmLabel: "Löschen",
              tone: "danger",
            })) && run("Changelog", () => deleteChangelogPostsAction())
          }
        >
          Changelog-Posts im Kanal löschen
        </button>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          disabled={busy}
          onClick={async () =>
            (await confirmDialog({
              title: "Knopf „Übernehmen“ einrichten?",
              body: "Das Portal trägt seine Adresse als „Interactions Endpoint URL“ bei deiner Discord-App ein. Danach können Teammitglieder neue Bewerbungen direkt in Discord übernehmen.",
              confirmLabel: "Einrichten",
            })) && run("Discord-Knöpfe", () => setupInteractionsAction())
          }
        >
          Knopf „Übernehmen“ einrichten
        </button>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={busy} onClick={() => run("Wochenbericht", () => postWeeklyNowAction())}>
          Wochenbericht jetzt senden
        </button>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={busy} onClick={() => run("Discord-Befehle", () => registerCommandsAction())}>
          Befehle /bewerbung, /offen, /claim registrieren
        </button>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={busy} onClick={() => run("Discord-Prüfung", () => scanGuildNowAction())} data-testid="guild-scan">
          Bewerber auf dem Discord prüfen
        </button>
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" disabled={busy} onClick={() => run("Warteschlange", () => flushOutboxAction())}>
          Ausstehende senden{pending ? ` (${pending})` : ""}
        </button>
      </div>
      {busy && <p className="text-sm text-muted">Sende …</p>}
      {result && (
        <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${result.ok ? "nv-tone-success" : "nv-tone-danger"}`} role="status" data-testid="discord-diag-result">
          {result.ok ? <CheckCircle size={16} className="shrink-0 mt-0.5" aria-hidden /> : <WarningCircle size={16} className="shrink-0 mt-0.5" aria-hidden />}
          <span>
            <strong>{result.label}:</strong> {result.text}
          </span>
        </p>
      )}
      <div>
        <p className="nv-mono mb-2">Letzte Fehler</p>
        {failed.length === 0 ? (
          <p className="text-sm text-muted">Keine fehlgeschlagenen Zustellungen.</p>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="discord-diag-failed">
            {failed.map((j) => (
              <li key={j.id} className="rounded-lg border border-line px-3 py-2">
                <p className="text-xs text-muted">
                  {j.when} · {j.type} · {j.target} · {j.status}
                </p>
                <p className="break-words">{j.error ?? "–"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
