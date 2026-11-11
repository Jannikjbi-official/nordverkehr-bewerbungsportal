"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
          <button type="button" onClick={reset} className="nv-btn nv-btn-primary mt-8">
            Nochmal versuchen
          </button>
        </div>
      </div>
    </section>
  );
}
