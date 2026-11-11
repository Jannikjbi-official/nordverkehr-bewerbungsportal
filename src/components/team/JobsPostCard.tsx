"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowClockwise, ArrowDown, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { publishJobsPostAction } from "@/app/actions/admin";

/** Knöpfe für den Stellenaufruf im Discord-Kanal. */
export function JobsPostButtons({ posted }: { posted: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (mode: "new" | "update") =>
    start(async () => {
      setResult(null);
      const r = await publishJobsPostAction(mode);
      setResult(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {posted ? (
          <>
            <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending} onClick={() => run("update")}>
              <ArrowClockwise size={14} aria-hidden /> Jetzt aktualisieren
            </button>
            <button
              type="button"
              className="nv-btn nv-btn-ghost nv-btn-sm"
              disabled={pending}
              onClick={() => confirm("Alten Post löschen und den Stellenaufruf neu (unten im Kanal) posten?") && run("new")}
            >
              <ArrowDown size={14} aria-hidden /> Neu posten (nach unten)
            </button>
          </>
        ) : (
          <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending} onClick={() => run("new")}>
            <PaperPlaneTilt size={14} weight="fill" aria-hidden /> In Discord posten
          </button>
        )}
      </div>
      {pending && <p className="text-xs text-muted">Sende an Discord …</p>}
      {result && (
        <p className={`rounded-xl border px-3 py-2 text-sm ${result.ok ? "nv-tone-success" : "nv-tone-danger"}`} role="status" data-testid="jobs-result">
          {result.text}
        </p>
      )}
    </div>
  );
}
