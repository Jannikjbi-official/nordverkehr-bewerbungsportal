"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowClockwise, CheckCircle, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react/ssr";
import { deleteChangelogPostsAction, discordTestAction, flushOutboxAction, postChangelogNowAction } from "@/app/actions/admin";

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
        {(
          [
            ["applications", "Test: Bewerbungs-Kanal"],
            ["botLog", "Test: Bot-Log-Kanal"],
            ["changelog", "Test: Changelog-Kanal"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={busy} onClick={() => run(l, () => discordTestAction(k))}>
            <PaperPlaneTilt size={14} aria-hidden /> {l}
          </button>
        ))}
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={busy} onClick={() => run("Changelog", () => postChangelogNowAction())}>
          <ArrowClockwise size={14} aria-hidden /> Fertige Changelog-Tage jetzt posten
        </button>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          disabled={busy}
          onClick={() => confirm("Alle Changelog-Posts des Bots im Kanal löschen? Die Versionen werden danach beim nächsten Lauf neu gepostet.") && run("Changelog", () => deleteChangelogPostsAction())}
        >
          Changelog-Posts im Kanal löschen
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
