"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface TabDef {
  key: string;
  label: string;
  /** Kleine Zahl/Markierung neben dem Titel */
  badge?: ReactNode;
  content: ReactNode;
  /** Weitere Anker (#…), die diesen Reiter öffnen */
  aliases?: string[];
}

/**
 * Reiter, die alle Inhalte gerendert lassen (nur ausgeblendet) – so bleibt
 * z. B. eine angefangene Nachricht beim Wechseln erhalten. Öffnet sich per
 * Anker (#nachrichten) oder merkt sich die letzte Wahl pro `id`.
 */
export function Tabs({ id, tabs, defaultKey, className, compact }: { id: string; tabs: TabDef[]; defaultKey?: string; className?: string; compact?: boolean }) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key);

  // Anker in der URL (z. B. #nachricht aus dem Board) öffnet den passenden Reiter
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if (!h) return;
      const t = tabs.find((x) => x.key === h || x.aliases?.includes(h));
      if (t) setActive(t.key);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // tabs ändern sich nur mit neuen Daten – Schlüssel reichen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map((t) => t.key).join("|")]);

  return (
    <div className={className}>
      <div role="tablist" aria-label="Bereiche" className={`flex gap-1 overflow-x-auto nv-scroll-x border-b border-line ${compact ? "px-3" : "px-1"}`}>
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${id}-tab-${t.key}`}
              aria-selected={on}
              aria-controls={`${id}-panel-${t.key}`}
              onClick={() => setActive(t.key)}
              className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 ${compact ? "py-2.5 text-xs" : "py-3 text-sm"} font-medium transition-colors ${
                on ? "text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== null && t.badge !== 0 && (
                <span className={`rounded-full px-1.5 text-[0.65rem] leading-4 tabular-nums ${on ? "bg-red text-white" : "bg-surface-2 text-muted"}`}>{t.badge}</span>
              )}
              {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-red" aria-hidden />}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} hidden={t.key !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
