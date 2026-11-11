"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Question, WarningOctagon } from "@phosphor-icons/react/ssr";

/**
 * Eigene Bestätigungs-Box statt window.confirm/alert – im Nordverkehr-Stil.
 * Aufruf überall:  if (!(await confirmDialog({ title: "…" }))) return;
 * Der <ConfirmHost/> hängt einmal im Root-Layout.
 */
export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" für Löschen & Co. (roter Knopf), "info" für reine Hinweise */
  tone?: "default" | "danger" | "info";
  /** Nur ein Knopf (Hinweis statt Frage) */
  alertOnly?: boolean;
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((r: Request) => void) | null = null;
const queue: Request[] = [];

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const req = { ...options, resolve };
    if (show) show(req);
    else if (typeof window !== "undefined" && !document.querySelector("[data-confirm-host]")) {
      // Fallback, falls der Host (noch) nicht da ist
      resolve(options.alertOnly ? (window.alert(options.title), true) : window.confirm([options.title, options.body].filter(Boolean).join("\n\n")));
    } else queue.push(req);
  });
}

/** Hinweis mit nur einem Knopf (Ersatz für alert). */
export async function alertDialog(options: Omit<ConfirmOptions, "alertOnly" | "cancelLabel">) {
  await confirmDialog({ confirmLabel: "OK", tone: "info", ...options, alertOnly: true });
}

const ICON = { default: Question, danger: WarningOctagon, info: Info } as const;
const ICON_TONE = {
  default: "bg-red-soft text-red-text",
  danger: "bg-[var(--tone-danger-bg)] text-[var(--tone-danger)]",
  info: "bg-[var(--tone-info-bg)] text-[var(--tone-info)]",
} as const;

export function ConfirmHost() {
  const dialog = useRef<HTMLDialogElement>(null);
  // Eine Abfrage, die vor dem Laden des Hosts kam, gleich übernehmen
  const [req, setReq] = useState<Request | null>(() => queue.shift() ?? null);
  const answered = useRef(false);

  useEffect(() => {
    show = (r) => setReq((cur) => (cur ? (queue.push(r), cur) : r));
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    answered.current = false;
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, [req]);

  function finish(ok: boolean) {
    if (!req || answered.current) return;
    answered.current = true;
    req.resolve(ok);
    dialog.current?.close();
    // nächste Anfrage (falls mehrere hintereinander kommen)
    const next = queue.shift();
    setReq(next ?? null);
  }

  const tone = req?.tone ?? "default";
  const Icon = ICON[tone];

  return (
    <dialog
      ref={dialog}
      data-confirm-host
      aria-labelledby="confirm-title"
      aria-describedby={req?.body ? "confirm-body" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
      onClick={(e) => {
        // Klick auf den abgedunkelten Hintergrund = Abbrechen
        if (e.target === dialog.current) finish(false);
      }}
      className="nv-confirm m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-[var(--nv-shadow)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {req && (
        <form
          method="dialog"
          className="p-6"
          onSubmit={(e) => {
            e.preventDefault();
            finish(true);
          }}
        >
          <div className="flex items-start gap-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${ICON_TONE[tone]}`}>
              <Icon size={22} weight="fill" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id="confirm-title" className="font-semibold text-lg leading-snug">
                {req.title}
              </h2>
              {req.body && (
                <p id="confirm-body" className="mt-1.5 text-sm text-fg-2 whitespace-pre-line">
                  {req.body}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!req.alertOnly && (
              <button type="button" className="nv-btn nv-btn-ghost" onClick={() => finish(false)}>
                {req.cancelLabel ?? "Abbrechen"}
              </button>
            )}
            <button type="submit" autoFocus className={`nv-btn ${tone === "danger" ? "nv-btn-danger-solid" : "nv-btn-primary"}`}>
              {req.confirmLabel ?? "Bestätigen"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
