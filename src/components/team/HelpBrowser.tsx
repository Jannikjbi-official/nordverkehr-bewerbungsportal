"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { cn } from "@/components/ui";
import type { HelpSection, HelpTerm } from "@/lib/help";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Einzeiler für die eingeklappte Ansicht: eigener Kurztext oder erster Satz. */
export function shortOf(t: Pick<HelpTerm, "short" | "text">) {
  if (t.short) return t.short;
  // Satzende nur nach ≥ 3 Kleinbuchstaben/Ziffern – „z. B.“, „bzw.“ usw. trennen nicht
  const first = t.text.split(/(?<=[a-zäöüß0-9]{3}[.!?]|[)“"][.!?])\s+(?=[A-ZÄÖÜ„*])/)[0] ?? t.text;
  return first.length > 160 ? `${first.slice(0, 157).replace(/\s+\S*$/, "")} …` : first;
}

// Sprungmarke (#id) aus der Adresszeile – ohne setState im Effect
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readHash = () => window.location.hash.slice(1);

/**
 * Hilfe: Themen als Reiter, Begriffe eingeklappt (Begriff + ein Satz), Details per Klick.
 * Suche und Sprunglinks („Was heißt das?“ → /team/hilfe#id) klappen passende Einträge auf.
 */
export function HelpBrowser({ sections }: { sections: HelpSection[] }) {
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");

  // Sprungmarke auf einen Begriff → dessen Thema anzeigen
  const hashSection = sections.find((s) => s.id === hash || s.terms.some((t) => t.id === hash))?.id ?? null;
  const activeTopic = q.trim() ? null : (topic ?? hashSection);

  const filtered = useMemo(() => {
    const n = norm(q.trim());
    const base = activeTopic ? sections.filter((s) => s.id === activeTopic) : sections;
    if (!n) return base;
    return base
      .map((s) => ({
        ...s,
        terms: s.terms.filter((t) => norm([t.term, t.short ?? "", t.text, ...(t.list ?? []).flatMap((l) => [l.label, l.text])].join(" ")).includes(n)),
      }))
      .filter((s) => s.terms.length > 0);
  }, [q, sections, activeTopic]);

  const searching = q.trim().length > 0;
  const isOpen = (id: string) => opened.has(id) || id === hash || (searching && filtered.reduce((n, s) => n + s.terms.length, 0) <= 3);
  const toggle = (id: string) => {
    if (id === hash) {
      // Per Sprungmarke geöffnet: Marke entfernen, damit der Eintrag zuklappt
      history.replaceState(null, "", window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      setOpened((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Themen" className="flex flex-wrap gap-1.5">
          <TopicChip active={!activeTopic} onClick={() => setTopic(null)} label="Alle" count={sections.reduce((n, s) => n + s.terms.length, 0)} />
          {sections.map((s) => (
            <TopicChip key={s.id} active={activeTopic === s.id} onClick={() => setTopic(s.id)} label={s.title} count={s.terms.length} />
          ))}
        </nav>
        <label className="relative block sm:w-64 shrink-0">
          <span className="sr-only">Begriff suchen</span>
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="nv-input !pl-9" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {filtered.length === 0 && <p className="text-sm text-muted">Nichts gefunden.</p>}

      <div className="space-y-6">
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-28">
            {(!activeTopic || searching) && <h2 className="nv-mono mb-2">{s.title}</h2>}
            <ul className="nv-card divide-y divide-[var(--nv-border)] overflow-hidden">
              {s.terms.map((t) => {
                const open = isOpen(t.id);
                return (
                  <li key={t.id} id={t.id} className={cn("scroll-mt-28", t.id === hash && "bg-red-soft")}>
                    <button
                      type="button"
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
                      aria-expanded={open}
                      aria-controls={`${t.id}-body`}
                      onClick={() => toggle(t.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.term}</span>
                        {!open && <span className="block text-sm text-muted truncate">{stripMd(shortOf(t))}</span>}
                      </span>
                      <CaretDown size={14} className={cn("mt-1 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
                    </button>
                    {open && (
                      <div id={`${t.id}-body`} className="px-4 pb-4 -mt-1">
                        <DiscordMarkdown text={t.text} className="text-sm text-fg-2 [&_strong]:text-fg" />
                        {t.list && (
                          <dl className="mt-3 divide-y divide-[var(--nv-border)] rounded-xl border border-line text-sm">
                            {t.list.map((l) => (
                              <div key={l.label} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4">
                                <dt className="font-medium break-words">{l.label}</dt>
                                <dd className="text-fg-2">{l.text}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const stripMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

function TopicChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("nv-pill transition-colors", active ? "nv-pill-red" : "hover:text-fg")}>
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
