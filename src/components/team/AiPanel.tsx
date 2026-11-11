"use client";

import { useState } from "react";
import { ArrowsClockwise, ChatTeardropText, ListChecks, Sparkle, WarningOctagon } from "@phosphor-icons/react/ssr";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { streamAi, type AiFeature } from "@/components/team/ai-client";

const ACTIONS: { feature: AiFeature; label: string; icon: React.ReactNode }[] = [
  { feature: "summary", label: "Zusammenfassung", icon: <ListChecks size={15} aria-hidden /> },
  { feature: "questions", label: "Rückfragen & Gesprächsfragen", icon: <ChatTeardropText size={15} aria-hidden /> },
  { feature: "hints", label: "Auffälligkeiten prüfen", icon: <WarningOctagon size={15} aria-hidden /> },
];

export function AiPanel({ applicationId, cachedSummary, cachedAt }: { applicationId: string; cachedSummary: string | null; cachedAt: string | null }) {
  const [active, setActive] = useState<AiFeature>("summary");
  const [results, setResults] = useState<Partial<Record<AiFeature, string>>>(cachedSummary ? { summary: cachedSummary } : {});
  const [busy, setBusy] = useState<AiFeature | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(feature: AiFeature) {
    setActive(feature);
    setError(null);
    setBusy(feature);
    setResults((r) => ({ ...r, [feature]: "" }));
    try {
      await streamAi({ feature, applicationId }, (full) => setResults((r) => ({ ...r, [feature]: full })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const text = results[active];

  return (
    <section className="nv-card p-5" aria-labelledby="ai-title">
      <h3 id="ai-title" className="flex items-center gap-2 font-semibold">
        <Sparkle size={16} weight="fill" className="text-red-text" aria-hidden /> KI-Hinweise
      </h3>
      <p className="mt-1 text-xs text-muted">
        Nur zur Unterstützung – keine Bewertung, keine Entscheidung. Es werden nur Position und Antworten übermittelt, keine
        Discord-Daten.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.feature}
            type="button"
            disabled={!!busy}
            onClick={() => (results[a.feature] && active !== a.feature ? setActive(a.feature) : run(a.feature))}
            className={`nv-pill transition-colors ${active === a.feature ? "nv-pill-red" : "hover:text-fg"}`}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
      <div className="mt-4 min-h-16 text-sm" aria-live="polite" aria-busy={!!busy}>
        {text ? (
          <DiscordMarkdown text={text} className={`space-y-0.5 text-fg-2 ${busy === active ? "nv-caret" : ""}`} />
        ) : busy === active ? (
          <div className="space-y-2">
            <div className="nv-skeleton h-4 w-3/4" />
            <div className="nv-skeleton h-4 w-2/3" />
            <div className="nv-skeleton h-4 w-1/2" />
          </div>
        ) : (
          <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => run(active)}>
            <Sparkle size={14} aria-hidden /> Jetzt erstellen
          </button>
        )}
        {error && <p className="nv-error mt-2">{error}</p>}
      </div>
      {text && !busy && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{active === "summary" && cachedAt && text === cachedSummary ? `Erstellt ${new Date(cachedAt).toLocaleString("de-DE")}` : "KI-Entwurf"}</span>
          <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm !py-0.5" onClick={() => run(active)}>
            <ArrowsClockwise size={13} aria-hidden /> Neu
          </button>
        </div>
      )}
    </section>
  );
}
