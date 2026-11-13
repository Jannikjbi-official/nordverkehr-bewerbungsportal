"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const path = usePathname();
  // „Wo“ für die Fehlermeldung vorausfüllen: Seite + Fehler-ID
  const where = `${path}${error.digest ? ` (Fehler-ID ${error.digest})` : ""}`;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="pt-40 pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-lg">
          <p className="nv-label">Fehler</p>
          <h1 className="nv-headline text-5xl mt-4">
            Da hat was <em>gehakt.</em>
          </h1>
          <p className="text-muted mt-4">
            Versuch es gleich nochmal. Deine Entwürfe sind gespeichert.
            {error.digest && <span className="block mt-2 font-mono text-xs text-faint">Fehler-ID: {error.digest}</span>}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <button type="button" onClick={reset} className="nv-btn nv-btn-primary">
              Nochmal versuchen
            </button>
            <Link href={`/ideen?art=fehler&von=${encodeURIComponent(where)}`} className="nv-btn nv-btn-ghost">
              Fehler melden
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
