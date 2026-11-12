"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Copy } from "@phosphor-icons/react/ssr";
import { createCalendarTokenAction } from "@/app/actions/application";
import { confirmDialog } from "@/components/ConfirmDialog";

/** Kalender-Abo (Gesprächstermine als .ics) – Link anzeigen, kopieren, neu erzeugen. */
export function CalendarLink({ url: initial }: { url: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const create = () =>
    start(async () => {
      setError(null);
      const r = await createCalendarTokenAction();
      if (!r.ok) return setError(r.error);
      setUrl(r.data.url);
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Gespräche im eigenen Kalender</p>
      <p className="nv-help">Alle anstehenden Bewerbungsgespräche (deine mit ⭐) als Kalender-Abo – z. B. in Google Kalender „Per URL hinzufügen“. Der Link ist geheim, nicht teilen.</p>
      {url ? (
        <>
          <div className="flex gap-2">
            <input className="nv-input font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Kalender-Link" />
            <button
              type="button"
              className="nv-btn nv-btn-ghost nv-btn-sm shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(url).catch(() => {});
                setCopied(true);
              }}
            >
              <Copy size={14} aria-hidden /> {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
          <button
            type="button"
            className="nv-btn nv-btn-quiet nv-btn-sm"
            disabled={pending}
            onClick={async () => (await confirmDialog({ title: "Neuen Link erzeugen?", body: "Der alte Link funktioniert danach nicht mehr.", confirmLabel: "Neu erzeugen" })) && create()}
          >
            Neuen Link erzeugen
          </button>
        </>
      ) : (
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={create}>
          <CalendarPlus size={14} aria-hidden /> Kalender-Link erzeugen
        </button>
      )}
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
