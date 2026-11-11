import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ListBullets, Plus } from "@phosphor-icons/react/ssr";
import { IconTile, formatDayTime } from "@/components/ui";
import { PositionStatusSelect } from "@/components/team/PositionStatusSelect";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { buildJobsMessage, buildSpotlightMessage, jobEmoji, type JobPosition } from "@/lib/messages/jobs";
import { getJobsPost, getSpotlights } from "@/lib/discord/jobs-post";
import { JobsPostButtons } from "@/components/team/JobsPostCard";
import { V2Preview } from "@/components/team/V2Preview";

export const metadata: Metadata = { title: "Positionen & Fragen" };

export default function PositionsAdminPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nv-label">Admin // Positionen</p>
          <h1 className="nv-headline text-4xl mt-2">
            Positionen &amp; <em>Fragen.</em>
          </h1>
          <p className="text-sm text-muted mt-2">Positionen öffnen/schließen, Texte pflegen und das Formular ohne Code anpassen.</p>
        </div>
        <Link href="/team/positionen/neu" className="nv-btn nv-btn-primary">
          <Plus size={16} aria-hidden /> Neue Position
        </Link>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await requireAdmin();
  const [positions, general, jobsPost, settings, spotlights] = await Promise.all([
    db.position.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { applications: { where: { status: { not: "DRAFT" } } }, sections: true } } },
    }),
    db.formSection.count({ where: { positionId: null, NOT: { archived: true } } }),
    getJobsPost(db),
    getSettings(),
    getSpotlights(db),
  ]);
  const jobsMessage = buildJobsMessage(positions as unknown as JobPosition[], { appUrl: publicEnv.appUrl, defaultMinAge: settings["applications.minAge"] });
  return (
    <div className="space-y-4">
      <Link href="/team/positionen/allgemein" className="nv-card nv-card-hover flex items-center gap-4 p-5">
        <div className="h-12 w-12 rounded-xl grid place-items-center bg-surface-2 text-muted">
          <ListBullets size={22} aria-hidden />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Allgemeine Fragen</p>
          <p className="text-sm text-muted">{general} Schritte – gelten für alle Positionen (Über dich, Erfahrung & Motivation). Szenarien hat jede Stelle selbst.</p>
        </div>
        <ArrowRight size={16} className="text-muted" aria-hidden />
      </Link>
      <ul className="grid gap-3">
        {positions.map((p) => (
          <li key={p.id} className="nv-card p-5 flex flex-col gap-4 sm:flex-row sm:items-center">
            <IconTile icon={p.icon} />
            <div className="flex-1 min-w-0">
              <p className="font-display text-2xl">{p.title}</p>
              <p className="text-sm text-muted">
                /{p.slug} · {p._count.applications} Bewerbungen · {p._count.sections} eigene Schritte
              </p>
            </div>
            <PositionStatusSelect positionId={p.id} status={p.status} />
            <Link href={`/team/positionen/${p.id}`} className="nv-btn nv-btn-ghost nv-btn-sm">
              Bearbeiten
            </Link>
          </li>
        ))}
      </ul>

      <section className="nv-card p-5 sm:p-6 space-y-4" aria-labelledby="jobs-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="jobs-title" className="font-semibold text-lg">Stellenaufruf in Discord</h2>
            <p className="text-sm text-muted mt-0.5">
              „Wir suchen neue Teammitglieder!“ im Kanal{" "}
              <span className="font-mono">{settings["discord.jobsChannelId"] || "– (in den Einstellungen eintragen)"}</span>. Wird aus den Positionen
              erzeugt{settings["discord.jobsAutoUpdate"] ? " und aktualisiert sich automatisch, sobald du eine Position änderst" : ""}.
            </p>
            <p className="text-xs text-muted mt-1">
              {jobsPost ? `Gepostet · zuletzt aktualisiert ${formatDayTime(new Date(jobsPost.at))}` : "Noch nicht gepostet."}
            </p>
          </div>
          <JobsPostButtons posted={!!jobsPost} />
        </div>
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg">Vorschau ansehen</summary>
          <div className="mt-3">
            <V2Preview message={jobsMessage} />
          </div>
        </details>
      </section>

      <section className="nv-card p-5 sm:p-6 space-y-4" aria-labelledby="spot-title">
        <div>
          <h2 id="spot-title" className="font-semibold text-lg">Einzelaufrufe pro Stelle</h2>
          <p className="text-sm text-muted mt-0.5">
            „Wir suchen …!“ für eine einzelne Stelle im Kanal{" "}
            <span className="font-mono">{settings["discord.spotlightChannelId"] || "– (in den Einstellungen eintragen)"}</span>. Gepostete Aufrufe
            {settings["discord.jobsAutoUpdate"] ? " aktualisieren sich automatisch, wenn du die Position änderst." : " aktualisierst du hier von Hand."}
          </p>
        </div>
        <ul className="divide-y divide-[var(--nv-border)]">
          {positions
            .filter((p) => p.status !== "HIDDEN")
            .map((p) => {
              const post = spotlights[p.slug];
              const message = buildSpotlightMessage(p as unknown as JobPosition, { appUrl: publicEnv.appUrl, defaultMinAge: settings["applications.minAge"] });
              return (
                <li key={p.id} className="py-3 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span aria-hidden>{jobEmoji(p.icon)}</span> {p.title}
                        {p.status === "CLOSED" && <span className="ml-2 text-xs text-muted">(geschlossen)</span>}
                      </p>
                      <p className="text-xs text-muted">{post ? `Gepostet · zuletzt aktualisiert ${formatDayTime(new Date(post.at))}` : "Noch nicht gepostet."}</p>
                    </div>
                    <JobsPostButtons posted={!!post} slug={p.slug} compact />
                  </div>
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Vorschau</summary>
                    <div className="mt-2">
                      <V2Preview message={message} />
                    </div>
                  </details>
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
