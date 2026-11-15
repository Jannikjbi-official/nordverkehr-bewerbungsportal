"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle, Robot, XCircle } from "@phosphor-icons/react/ssr";
import { answerAiConsentAction } from "@/app/actions/application";

/**
 * Frage „Darf die KI deine Bewerbung einschätzen?“ – öffnet sich als Fenster,
 * solange noch nicht geantwortet wurde. Danach bleibt ein kleiner Hinweis
 * mit der Entscheidung, die sich jederzeit ändern lässt.
 */
export function AiConsentPrompt({ applicationId, answer }: { applicationId: string; answer: "granted" | "denied" | null }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Offen, solange keine Antwort da ist; „Ändern“ öffnet es erneut
  const [open, setOpen] = useState(answer === null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function decide(allow: boolean) {
    setError(null);
    start(async () => {
      const r = await answerAiConsentAction(applicationId, allow);
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      {(answer || !open) && (
        <div className="nv-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="ai-consent-status">
          <p className="flex items-start gap-2 text-sm">
            <Robot size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            {answer ? (
              <span>
                KI-Einschätzung: <strong>{answer === "granted" ? "erlaubt" : "abgelehnt"}</strong>
                <span className="block text-xs text-muted">Du kannst deine Entscheidung jederzeit ändern.</span>
              </span>
            ) : (
              <span>
                <strong>Offene Frage vom Team:</strong> Darf eine KI deine Bewerbung einschätzen?
              </span>
            )}
          </p>
          <button type="button" className={`nv-btn nv-btn-sm w-full sm:w-auto ${answer ? "nv-btn-ghost" : "nv-btn-primary"}`} onClick={() => setOpen(true)}>
            {answer ? "Ändern" : "Beantworten"}
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="ai-consent-title"
        aria-describedby="ai-consent-body"
        data-testid="ai-consent-dialog"
        onCancel={(e) => {
          // Esc schließt das Fenster; ohne Antwort bleibt oben „Beantworten“ (und beim nächsten Besuch öffnet es sich wieder)
          e.preventDefault();
          setOpen(false);
        }}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-[var(--nv-shadow)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-soft text-red-text">
              <Robot size={22} weight="fill" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id="ai-consent-title" className="font-semibold text-lg leading-snug">
                Darf eine KI deine Bewerbung einschätzen?
              </h2>
              <div id="ai-consent-body" className="mt-2 space-y-2 text-sm text-fg-2">
                <p>Das Team nutzt eine KI (Claude von Anthropic), die Antworten nach festen Kriterien einschätzt und kurz begründet.</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Nur deine Antworten und die Stelle gehen an die KI – nicht dein Name, deine Discord-ID oder Bilder.</li>
                  <li>Die Punkte sind nur eine Orientierung. Entscheiden tun immer Menschen.</li>
                  <li>
                    <strong>Ablehnen hat keinerlei Nachteile</strong> – dann bewertet das Team ganz normal ohne KI.
                  </li>
                </ul>
              </div>
            </div>
          </div>
          {error && (
            <p className="nv-error mt-3" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            <button type="button" className="nv-btn nv-btn-ghost w-full" disabled={pending} onClick={() => decide(false)} data-testid="ai-consent-deny">
              <XCircle size={16} aria-hidden /> Ablehnen
            </button>
            <button type="button" className="nv-btn nv-btn-primary w-full" disabled={pending} onClick={() => decide(true)} data-testid="ai-consent-allow">
              <CheckCircle size={16} weight="fill" aria-hidden /> {pending ? "Speichert …" : "Erlauben"}
            </button>
          </div>
          {answer === null && <p className="mt-3 text-center text-xs text-muted">Schließt du das Fenster, fragen wir beim nächsten Besuch nochmal.</p>}
        </div>
      </dialog>
    </>
  );
}
