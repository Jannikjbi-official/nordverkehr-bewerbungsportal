"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { liveVersionAction, type LiveScope } from "@/app/actions/live";

/**
 * Hält die Seite aktuell, ohne dass man neu laden muss: fragt alle paar
 * Sekunden eine kleine Version ab und lädt nur bei Änderungen die Daten neu.
 * Eingaben (z. B. eine angefangene Nachricht) bleiben dabei erhalten.
 * Im Hintergrund-Tab pausiert die Abfrage; beim Zurückkommen wird sofort geprüft.
 */
export function LiveRefresh({ scope, id, intervalMs = 5000 }: { scope: LiveScope; id?: string; intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let stopped = false;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (stopped || busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const v = await liveVersionAction(scope, id);
        fails = 0;
        if (v === null) {
          stopped = true; // nicht (mehr) berechtigt – nicht weiter fragen
          return;
        }
        if (last.current !== null && v !== last.current) router.refresh();
        last.current = v;
      } catch {
        fails++; // Netz weg o. Ä. – langsamer weiterprobieren
      } finally {
        busy.current = false;
      }
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(async () => {
        await check();
        schedule();
      }, intervalMs * Math.min(1 + fails, 6));
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [scope, id, intervalMs, router]);

  return null;
}
