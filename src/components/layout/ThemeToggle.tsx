"use client";

import { Moon, Sun } from "@phosphor-icons/react/ssr";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => "dark");
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("nv-theme", next);
        } catch {}
      }}
      className="nv-btn nv-btn-quiet !p-2 rounded-lg"
      aria-label={next === "light" ? "Helles Design aktivieren" : "Dunkles Design aktivieren"}
      title={next === "light" ? "Hell" : "Dunkel"}
    >
      {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
