import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Prisma, SuggestionKind, SuggestionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Avatar, EmptyState, cn, formatDayTime } from "@/components/ui";
import { SuggestionAdminItem } from "@/components/ideas/SuggestionAdminItem";
import { KIND_EMOJI, KIND_LABEL, OPEN_STATUSES, STATUSES, STATUS_LABEL, STATUS_TONE } from "@/lib/suggestion-labels";

export const metadata: Metadata = { title: "Ideen & Fehler · Admin" };

const KINDS: SuggestionKind[] = ["IDEA", "FEEDBACK", "BUG"];

export default function AdminIdeasPage({ searchParams }: PageProps<"/team/admin/ideen">) {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[32rem]" />}>
      <Ideas searchParams={searchParams} />
    </Suspense>
  );
}

async function Ideas({ searchParams }: Pick<PageProps<"/team/admin/ideen">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status.toLowerCase() : "offen";
  const kindParam = typeof sp.art === "string" ? sp.art : "";
  const kind = KINDS.find((k) => k === kindParam.toUpperCase());
  const statusFilter: SuggestionStatus[] | null =
    statusParam === "alle" ? null : statusParam === "offen" ? OPEN_STATUSES : STATUSES.filter((s) => s === statusParam.toUpperCase());

  const where: Prisma.SuggestionWhereInput = {
    ...(statusFilter ? { status: { in: statusFilter.length ? statusFilter : OPEN_STATUSES } } : {}),
    ...(kind ? { kind } : {}),
  };
  const [items, counts] = await Promise.all([
    db.suggestion.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: { author: { select: { discordId: true, avatar: true, username: true, globalName: true, isTeam: true } }, handledBy: { select: { username: true, globalName: true } } },
    }),
    db.suggestion.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: SuggestionStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const openCount = OPEN_STATUSES.reduce((n, s) => n + count(s), 0);
  const total = STATUSES.reduce((n, s) => n + count(s), 0);

  const href = (next: { status?: string; art?: string }) => {
    const q = new URLSearchParams();
    const st = next.status ?? statusParam;
    const ar = next.art ?? kindParam;
    if (st && st !== "offen") q.set("status", st);
    if (ar) q.set("art", ar);
    const s = q.toString();
    return `/team/admin/ideen${s ? `?${s}` : ""}`;
  };
  const statusChips = [
    { key: "offen", label: "Offen", n: openCount },
    ...STATUSES.map((s) => ({ key: s.toLowerCase(), label: STATUS_LABEL[s], n: count(s) })),
    { key: "alle", label: "Alle", n: total },
  ];

  return (
    <div className="space-y-6">
      <section className="nv-card p-5 sm:p-6">
        <h2 className="font-semibold text-lg">Ideen & Fehler</h2>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          Alles, was Bewerber und Team unter <Link href="/ideen" className="nv-link">/ideen</Link> einreichen: Ideen, Feedback und Fehlermeldungen. Status setzen, kurz antworten – bei
          „Geplant“, „Umgesetzt“ und „Nicht geplant“ bekommt die Person auf Wunsch eine DM. Neue Einreichungen meldet der Bot im Leitungs-Chat; ist keiner eingestellt, steht im Bot-Log nur ein Hinweis ohne Inhalt.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <nav aria-label="Status" className="flex flex-wrap gap-1.5">
          {statusChips.map((c) => (
            <Link key={c.key} href={href({ status: c.key })} className={cn("nv-pill transition-colors", statusParam === c.key ? "nv-pill-red" : "hover:text-fg")}>
              {c.label} <span className="tabular-nums opacity-70">{c.n}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Art" className="flex flex-wrap gap-1.5">
          <Link href={href({ art: "" })} className={cn("nv-pill transition-colors", !kind ? "nv-pill-red" : "hover:text-fg")}>
            Alle Arten
          </Link>
          {KINDS.map((k) => (
            <Link key={k} href={href({ art: k.toLowerCase() })} className={cn("nv-pill transition-colors", kind === k ? "nv-pill-red" : "hover:text-fg")}>
              {KIND_EMOJI[k]} {KIND_LABEL[k]}
            </Link>
          ))}
        </nav>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nichts in dieser Ansicht">Neue Ideen und Meldungen erscheinen hier, sobald jemand etwas einreicht.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {items.map((s) => {
            const name = s.author ? s.author.globalName || s.author.username : "Gelöschtes Konto";
            return (
              <li key={s.id} id={s.id} className="nv-card p-5 scroll-mt-28 target:ring-2 target:ring-[var(--nv-red)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {KIND_EMOJI[s.kind]} {s.title}
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-xs text-muted">
                      {s.author && <Avatar discordId={s.author.discordId} avatar={s.author.avatar} size={18} className="shrink-0" />}
                      <span>
                        {[name + (s.author?.isTeam ? " (Team)" : ""), KIND_LABEL[s.kind], formatDayTime(s.createdAt), s.handledBy && `bearbeitet von ${s.handledBy.globalName || s.handledBy.username}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>
                  </div>
                  <span className={cn("nv-pill !text-[0.7rem] !py-0.5 shrink-0", `nv-tone-${STATUS_TONE[s.status]}`)}>{STATUS_LABEL[s.status]}</span>
                </div>
                <p className="mt-3 text-sm text-fg-2 whitespace-pre-line break-words">{s.body}</p>
                {s.location && (
                  <p className="mt-2 text-xs text-muted">
                    <span className="font-medium">Wo:</span> {s.location}
                  </p>
                )}
                <SuggestionAdminItem id={s.id} status={s.status} adminNote={s.adminNote} hasAuthor={!!s.author} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
