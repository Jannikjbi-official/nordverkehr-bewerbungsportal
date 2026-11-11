"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import type { HelpSection } from "@/lib/help";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Begriffe mit Suche; Sprungmarken (#id) heben den Begriff hervor. */
export function HelpBrowser({ sections }: { sections: HelpSection[] }) {
  const [q, setQ] = useState("");
  const [hash, setHash] = useState("");

  useEffect(() => {
    const update = () => setHash(window.location.hash.slice(1));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const filtered = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return sections;
    return sections
      .map((s) => ({
        ...s,
        terms: s.terms.filter((t) => norm([t.term, t.text, ...(t.list ?? []).flatMap((l) => [l.label, l.text])].join(" ")).includes(n)),
      }))
      .filter((s) => s.terms.length > 0);
  }, [q, sections]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <aside className="lg:sticky lg:top-28 self-start space-y-4">
        <label className="relative block">
          <span className="sr-only">Begriff suchen</span>
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="nv-input !pl-9" placeholder="Begriff suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <nav aria-label="Themen" className="hidden lg:block">
          <ul className="space-y-3 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="font-semibold hover:text-red-text">
                  {s.title}
                </a>
                <ul className="mt-1 space-y-0.5 border-l border-line pl-3">
                  {s.terms.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`} className={`block truncate text-muted hover:text-fg ${hash === t.id ? "!text-red-text" : ""}`}>
                        {t.term}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="space-y-8 min-w-0">
        {filtered.length === 0 && <p className="text-sm text-muted">Nichts gefunden.</p>}
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-28 space-y-3">
            <h2 className="nv-mono">{s.title}</h2>
            {s.terms.map((t) => (
              <article
                key={t.id}
                id={t.id}
                className={`nv-card p-5 scroll-mt-28 transition-colors ${hash === t.id ? "border-red-line bg-red-soft" : ""}`}
              >
                <h3 className="font-semibold">{t.term}</h3>
                <DiscordMarkdown text={t.text} className="mt-1.5 text-sm text-fg-2 [&_strong]:text-fg" />
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
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
