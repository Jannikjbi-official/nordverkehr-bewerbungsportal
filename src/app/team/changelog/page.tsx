import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTeam } from "@/lib/auth/session";
import { CHANGELOG, groupItems, isPublished, publishTimeLabel, publishedEntries, versionLabel } from "@/lib/changelog";
import { changelogRule } from "@/lib/discord/changelog-post";
import { nowMs } from "@/lib/time";
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
          Alle Änderungen eines Tages als eine Version – veröffentlicht jeden Tag um 0 Uhr, auf Discord mit den Tagesaufgaben am Morgen.
        </p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <Entries />
      </Suspense>
    </div>
  );
}

async function Entries() {
  const { access } = await requireTeam();
  const rule = await changelogRule();
  const now = new Date(nowMs());
  // Admins sehen den laufenden Tag schon vorab (als Vorschau), alle anderen erst ab der Veröffentlichung
  const entries = access.isAdmin ? CHANGELOG : publishedEntries(now, rule);
  if (!entries.length) return <p className="text-sm text-muted">Die erste Version erscheint heute {publishTimeLabel(rule)}.</p>;
  return (
    <ol className="relative space-y-6 border-l border-line pl-6 ml-2">
      {entries.map((e, i) => {
        const preview = !isPublished(e, now, rule);
        return (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 ${
              preview ? "bg-surface border-dashed border-red" : i === 0 || (i === 1 && !isPublished(entries[0], now, rule)) ? "bg-red border-red" : "bg-surface border-line-strong"
            }`}
            aria-hidden
          />
          <article className={`nv-card p-5 ${preview ? "border-dashed border-red-line" : ""}`}>
            {preview && (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full nv-tone-warn border px-2.5 py-0.5 text-xs font-medium">
                Vorschau nur für Admins · wird um 0 Uhr veröffentlicht und danach auf Discord gepostet
              </p>
            )}
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
        );
      })}
    </ol>
  );
}
