import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTeam } from "@/lib/auth/session";
import { groupItems, publishedEntries, versionLabel } from "@/lib/changelog";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
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
        <p className="text-sm text-muted mt-2">
          Alle Änderungen eines Tages als eine Version – veröffentlicht jeden Tag um 0 Uhr, gleichzeitig im Changelog-Kanal auf Discord.
        </p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <Entries />
      </Suspense>
    </div>
  );
}

async function Entries() {
  await requireTeam();
  const entries = publishedEntries();
  if (!entries.length) return <p className="text-sm text-muted">Die erste Version erscheint heute um 0 Uhr.</p>;
  return (
    <ol className="relative space-y-6 border-l border-line pl-6 ml-2">
      {entries.map((e, i) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 ${i === 0 ? "bg-red border-red" : "bg-surface border-line-strong"}`} aria-hidden />
          <article className="nv-card p-5">
            <p className="nv-mono">{formatDay(new Date(`${e.date}T12:00:00`))}</p>
            <h2 className="font-semibold text-lg mt-1">
              {versionLabel(e)}
              {e.title && <span className="font-normal text-muted"> · {e.title}</span>}
            </h2>
            <div className="mt-3 space-y-4">
              {groupItems(e.items).map((g) => (
                <div key={g.kind}>
                  <p className="text-sm font-semibold">
                    <span aria-hidden>{g.emoji}</span> {g.label}
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm text-fg-2 list-disc pl-5 marker:text-red-text">
                    {g.items.map((it, k) => (
                      <li key={k}>
                        <DiscordMarkdown text={it.text} className="inline [&_strong]:text-fg" />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}
