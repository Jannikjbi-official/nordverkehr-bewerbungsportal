"use client";

import { useSyncExternalStore } from "react";

type Key = "text" | "contrast";
const VALUE: Record<Key, string> = { text: "large", contrast: "high" };

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-text", "data-contrast"] });
  return () => obs.disconnect();
}

function Toggle({ k, label }: { k: Key; label: string }) {
  const on = useSyncExternalStore(subscribe, () => document.documentElement.dataset[k] === VALUE[k], () => false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`nv-pill transition-colors ${on ? "nv-pill-red" : "hover:text-fg"}`}
      onClick={() => {
        const d = document.documentElement;
        if (on) delete d.dataset[k];
        else d.dataset[k] = VALUE[k];
        try {
          if (on) localStorage.removeItem(`nv-${k}`);
          else localStorage.setItem(`nv-${k}`, VALUE[k]);
        } catch {}
      }}
    >
      {label}
    </button>
  );
}

/** Lesbarkeit: größere Schrift und mehr Kontrast – pro Gerät gespeichert. */
export function ReadabilityToggles() {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lesbarkeit" data-testid="readability">
      <span className="text-xs text-muted mr-1">Lesbarkeit:</span>
      <Toggle k="text" label="Größere Schrift" />
      <Toggle k="contrast" label="Mehr Kontrast" />
    </div>
  );
}
