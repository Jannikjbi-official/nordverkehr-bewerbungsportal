"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChatCircleText, PaperPlaneRight } from "@phosphor-icons/react/ssr";
import { askPositionAction } from "@/app/actions/application";

/** Fragefeld auf der Stellenseite – KI antwortet nur aus dem Stellentext. */
export function PositionQa({ positionId, loggedIn, loginHref }: { positionId: string; loggedIn: boolean; loginHref: string }) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="nv-card p-6 space-y-3" data-testid="position-qa">
      <h2 className="flex items-center gap-2 font-semibold">
        <ChatCircleText size={18} className="text-red-text" aria-hidden /> Fragen zur Stelle
      </h2>
      <p className="text-sm text-muted">Die KI antwortet nur aus den Infos auf dieser Seite. Alles andere beantwortet dir der Support im Discord.</p>
      {answers.map((x, i) => (
        <div key={i} className="space-y-1 text-sm">
          <p className="font-medium">„{x.q}“</p>
          <p className="rounded-xl bg-surface-2 p-3 text-fg-2 whitespace-pre-wrap">{x.a}</p>
        </div>
      ))}
      {loggedIn ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const question = q.trim();
            start(async () => {
              const r = await askPositionAction(positionId, question);
              if (!r.ok) return setError(r.error);
              setAnswers((a) => [...a, { q: question, a: r.data.answer }]);
              setQ("");
            });
          }}
        >
          <label htmlFor="pqa" className="sr-only">
            Deine Frage
          </label>
          <input id="pqa" className="nv-input min-w-0 flex-1" maxLength={300} placeholder="z. B. Wie viel Zeit sollte ich mitbringen?" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || q.trim().length < 5}>
            <PaperPlaneRight size={14} weight="fill" aria-hidden /> {pending ? "Denkt nach …" : "Fragen"}
          </button>
        </form>
      ) : (
        <Link href={loginHref} className="nv-btn nv-btn-ghost nv-btn-sm w-full">
          Mit Discord einloggen, um zu fragen
        </Link>
      )}
      {error && <p className="nv-error text-sm">{error}</p>}
    </section>
  );
}
