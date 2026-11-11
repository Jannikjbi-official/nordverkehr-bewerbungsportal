import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ClipboardText, WarningCircle } from "@phosphor-icons/react/ssr";
import { Container, EmptyState, IconTile, PageHero, StatusBadge, formatDay, formatRelative } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { STATUS_HINT } from "@/lib/applications/status";
import { DiscardDraftButton } from "@/components/dashboard/DiscardDraftButton";

export const metadata: Metadata = { title: "Meine Bewerbungen", robots: { index: false } };

export default function DashboardPage() {
  return (
    <>
      <PageHero label="NORDVERKEHR // DEIN BEREICH" title="Meine" emphasis="Bewerbungen." compact>
        <p>Hier siehst du jederzeit, wo deine Bewerbung steht – und was das Team dir geschrieben hat.</p>
      </PageHero>
      <Container>
        <Suspense fallback={<ListSkeleton />}>
          <ApplicationList />
        </Suspense>
      </Container>
    </>
  );
}

async function ApplicationList() {
  const user = await requireUser("/dashboard");
  const apps = await db.application.findMany({
    where: { userId: user.id },
    include: {
      position: { select: { title: true, slug: true, icon: true } },
      messages: { where: { direction: "TEAM_TO_APPLICANT", readAt: null }, select: { id: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (!apps.length) {
    return (
      <EmptyState
        icon={ClipboardText}
        title="Noch keine Bewerbung"
        action={
          <Link href="/#positionen" className="nv-btn nv-btn-primary">
            Offene Positionen ansehen <ArrowRight size={16} aria-hidden />
          </Link>
        }
      >
        Such dir eine Position aus – dein Entwurf wird automatisch gespeichert.
      </EmptyState>
    );
  }

  return (
    <ul className="grid gap-4">
      {apps.map((a, i) => {
        const isDraft = a.status === "DRAFT";
        const dmIssue = a.confirmationDmStatus === "DM_CLOSED" || a.confirmationDmStatus === "FAILED";
        return (
          <li key={a.id} className="nv-anim" style={{ "--i": i } as React.CSSProperties}>
            <div className="nv-card nv-card-hover p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <IconTile icon={a.position.icon} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl">{a.position.title}</h2>
                  <StatusBadge status={a.status} />
                  {a.messages.length > 0 && (
                    <span className="nv-pill nv-pill-red !text-[0.7rem] !py-0.5">{a.messages.length} neue Nachricht(en)</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {isDraft
                    ? `Entwurf · zuletzt gespeichert ${formatRelative(a.updatedAt)}`
                    : `${a.publicId} · eingereicht am ${formatDay(a.submittedAt)}`}
                </p>
                <p className="mt-2 text-sm text-fg-2">{STATUS_HINT[a.status]}</p>
                {dmIssue && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--tone-danger)]">
                    <WarningCircle size={14} aria-hidden /> Wir konnten dir keine Discord-DM schicken.
                  </p>
                )}
              </div>
              <div className="flex gap-2 sm:flex-col sm:items-end">
                {isDraft ? (
                  <>
                    <Link href={`/bewerben/${a.position.slug}`} className="nv-btn nv-btn-primary nv-btn-sm">
                      Fortsetzen <ArrowRight size={14} aria-hidden />
                    </Link>
                    <DiscardDraftButton draftId={a.id} />
                  </>
                ) : (
                  <Link href={`/dashboard/${a.id}`} className="nv-btn nv-btn-ghost nv-btn-sm">
                    Details <ArrowRight size={14} aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="nv-skeleton h-32" />
      ))}
    </div>
  );
}
