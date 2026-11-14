"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Aktualisiert die Seite nur auf Abruf – kein Polling, keine Abfragen im Hintergrund:
 * Kommt man nach einer Weile zurück in den Tab bzw. ins Fenster, werden die Daten
 * einmal neu geladen (router.refresh). Eingaben (z. B. eine angefangene Nachricht)
 * bleiben dabei erhalten. Sonst hilft Neuladen.
 */
export function LiveRefresh({ awayMs = 30_000 }: { awayMs?: number } = {}) {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt: number | null = null;
    const onHide = () => {
      hiddenAt ??= Date.now();
    };
    const onShow = () => {
      if (hiddenAt === null) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= awayMs) router.refresh();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? onHide() : onShow());

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", onShow);
    };
  }, [awayMs, router]);

  return null;
}
