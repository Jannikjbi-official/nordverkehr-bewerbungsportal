import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { SuggestionKind } from "@prisma/client";
import { Container, PageHero, cn, formatDay } from "@/components/ui";
import { SuggestionForm } from "@/components/ideas/SuggestionForm";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { KIND_EMOJI, KIND_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/suggestion-labels";

export const metadata: Metadata = {
  title: "Ideen & Fehler melden",
  description: "Ideen, Feedback und Fehler fürs Nordverkehr-Bewerbungsportal einreichen – die Leitung schaut sich alles an.",
};

const KIND_PARAM: Record<string, SuggestionKind> = { idee: "IDEA", feedback: "FEEDBACK", fehler: "BUG" };

export default function IdeasPage({ searchParams }: PageProps<"/ideen">) {
  return (
    <>
      <PageHero label="NORDVERKEHR // MITMACHEN" title="Ideen &" emphasis="Fehler." compact>
        <p>Dir fehlt etwas, dich nervt etwas oder etwas funktioniert nicht? Schreib es uns. Die Leitung liest alles und schaut, was sich einbauen lässt.</p>
      </PageHero>
      <Container>
        <div className="mx-auto max-w-3xl">
          <Suspense fallback={<div className="nv-skeleton h-96" />}>
            <Content searchParams={searchParams} />
          </Suspense>
        </div>
      </Container>
    </>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/ideen">, "searchParams">) {
  const sp = await searchParams;
  const art = typeof sp.art === "string" ? sp.art : "";
  const von = typeof sp.von === "string" && sp.von.startsWith("/") ? sp.von.slice(0, 200) : "";
  const user = await getCurrentUser();
  if (!user) {
    const q = new URLSearchParams({ ...(art ? { art } : {}), ...(von ? { von } : {}) }).toString();
    const back = `/ideen${q ? `?${q}` : ""}`;
    return (
      <div className="nv-card p-6 space-y-3">
        <p className="font-semibold">Kurz einloggen</p>
        <p className="text-sm text-fg-2">Damit wir bei Rückfragen wissen, wen wir anschreiben, brauchst du ein Login mit Discord – dauert zwei Sekunden.</p>
        <Link href={`/login?callbackUrl=${encodeURIComponent(back)}`} className="nv-btn nv-btn-primary nv-btn-sm">
          Mit Discord einloggen
        </Link>
      </div>
    );
  }
  const mine = await db.suggestion.findMany({ where: { authorId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div className="space-y-8">
      <SuggestionForm initialKind={KIND_PARAM[art] ?? "IDEA"} from={von} />
      <section aria-labelledby="mine" className="space-y-3">
        <h2 id="mine" className="nv-mono">
          Deine Einreichungen {mine.length > 0 && <span className="opacity-70">({mine.length})</span>}
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">Noch nichts eingereicht.</p>
        ) : (
          <ul className="space-y-3">
            {mine.map((s) => (
              <li key={s.id} id={s.id} className="nv-card p-4 scroll-mt-28 target:ring-2 target:ring-[var(--nv-red)]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">
                    {KIND_EMOJI[s.kind]} {s.title}
                  </p>
                  <span className={cn("nv-pill !text-[0.7rem] !py-0.5", `nv-tone-${STATUS_TONE[s.status]}`)}>{STATUS_LABEL[s.status]}</span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {KIND_LABEL[s.kind]} · {formatDay(s.createdAt)}
                </p>
                <p className="text-sm text-fg-2 mt-2 whitespace-pre-line line-clamp-4">{s.body}</p>
                {s.adminNote && (
                  <div className="mt-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-sm">
                    <p className="nv-mono mb-1">Antwort der Leitung</p>
                    <DiscordMarkdown text={s.adminNote} className="text-fg-2" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
