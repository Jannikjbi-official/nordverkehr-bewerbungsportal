"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowClockwise, ArrowDown, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { publishJobsPostAction, publishSpotlightAction } from "@/app/actions/admin";

/** Knöpfe zum Posten/Aktualisieren eines Stellenaufrufs (gesamt oder für eine Stelle). */
export function JobsPostButtons({ posted, slug, compact }: { posted: boolean; slug?: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (mode: "new" | "update") =>
    start(async () => {
      setResult(null);
      const r = slug ? await publishSpotlightAction(slug, mode) : await publishJobsPostAction(mode);
      setResult(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
      router.refresh();
    });

  const size = compact ? "nv-btn-sm !py-1" : "nv-btn-sm";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {posted ? (
          <>
            <button type="button" className={`nv-btn nv-btn-ghost ${size}`} disabled={pending} onClick={() => run("update")}>
              <ArrowClockwise size={14} aria-hidden /> Aktualisieren
            </button>
            <button
              type="button"
              className={`nv-btn nv-btn-quiet ${size}`}
              disabled={pending}
              onClick={() => confirm("Alten Post löschen und neu (unten im Kanal) posten?") && run("new")}
            >
              <ArrowDown size={14} aria-hidden /> Neu posten
            </button>
          </>
        ) : (
          <button type="button" className={`nv-btn nv-btn-primary ${size}`} disabled={pending} onClick={() => run("new")}>
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
