"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { MATCH_QUESTIONS, scorePositions } from "@/lib/applications/match";

/** Selbsttest: 5 Fragen, danach passende offene Stellen. Nichts wird gespeichert. */
export function PositionMatch({ positions }: { positions: { slug: string; title: string; tagline: string; open: boolean }[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const done = MATCH_QUESTIONS.every((q) => answers[q.key] !== undefined);
  const ranked = done ? scorePositions(answers, positions.map((p) => p.slug)) : [];
  const top = ranked.slice(0, 3).map((r) => positions.find((p) => p.slug === r.slug)!);

  return (
    <div className="space-y-5">
      {MATCH_QUESTIONS.map((q, qi) => (
        <fieldset key={q.key} className="nv-card p-5">
          <legend className="font-semibold px-1">
            {qi + 1}. {q.label}
          </legend>
          <div className="mt-2 grid gap-2">
            {q.options.map((o, oi) => (
              <label key={o.label} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer text-sm ${answers[q.key] === oi ? "border-red-line bg-red-soft" : "border-line hover:border-line-strong"}`}>
                <input type="radio" name={q.key} className="nv-check" checked={answers[q.key] === oi} onChange={() => setAnswers((a) => ({ ...a, [q.key]: oi }))} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {done && (
        <section className="nv-card p-5 border-red-line space-y-3" aria-live="polite">
          <h2 className="font-semibold text-lg">Das könnte zu dir passen</h2>
          {top.length === 0 ? (
            <p className="text-sm text-muted">Gerade passt keine offene Stelle richtig – schau dir trotzdem alle Stellen an.</p>
          ) : (
            <ul className="space-y-2">
              {top.map((p, i) => (
                <li key={p.slug}>
                  <Link href={`/positionen/${p.slug}`} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 hover:border-red-line">
                    <span>
                      <span className="font-medium">
                        {i === 0 && "⭐ "}
                        {p.title}
                      </span>
                      <span className="block text-xs text-muted">
                        {p.tagline}
                        {!p.open && " · gerade geschlossen"}
                      </span>
                    </span>
                    <ArrowRight size={16} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Nur eine Orientierung – bewerben kannst du dich auf jede offene Stelle. Deine Antworten werden nicht gespeichert.</p>
        </section>
      )}
    </div>
  );
}
