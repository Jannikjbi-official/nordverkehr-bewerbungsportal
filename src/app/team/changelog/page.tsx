import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTeam } from "@/lib/auth/session";
import { CHANGELOG } from "@/lib/changelog";
import { formatDay } from "@/components/ui";

export const metadata: Metadata = { title: "Changelog" };

export default function ChangelogPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Changelog</p>
        <h1 className="nv-headline text-4xl mt-2">
          Was ist <em>neu?</em>
        </h1>
        <p className="text-sm text-muted mt-2">Jede Änderung am Bewerbungsportal – neue Einträge kommen auch in den Changelog-Kanal auf Discord.</p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <Entries />
      </Suspense>
    </div>
  );
}

async function Entries() {
  await requireTeam();
  return (
    <ol className="relative space-y-6 border-l border-line pl-6 ml-2">
      {CHANGELOG.map((e, i) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 ${i === 0 ? "bg-red border-red" : "bg-surface border-line-strong"}`} aria-hidden />
          <article className="nv-card p-5">
            <p className="nv-mono">{formatDay(new Date(`${e.date}T12:00:00`))}</p>
            <h2 className="font-semibold text-lg mt-1">{e.title}</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-2 list-disc pl-5 marker:text-red-text">
              {e.items.map((it, k) => (
                <li key={k}>{it}</li>
              ))}
            </ul>
          </article>
        </li>
      ))}
    </ol>
  );
}
