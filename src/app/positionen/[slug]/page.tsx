import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowLeft, ArrowRight, CheckCircle, ClockCountdown, ListChecks, Prohibit, Target } from "@phosphor-icons/react/ssr";
import { Container, IconTile, Notice, formatDay } from "@/components/ui";
import { getPublicPosition } from "@/lib/data/positions";
import { getCurrentUser } from "@/lib/auth/session";
import { getEligibility } from "@/lib/applications/service";
import { getSettings } from "@/lib/settings";
import { effectiveMinAge } from "@/lib/applications/rules";
import { NotifyToggle } from "@/components/NotifyToggle";
import { db } from "@/lib/db";

export default function PositionPage({ params }: PageProps<"/positionen/[slug]">) {
  return (
    <Suspense fallback={<PositionSkeleton />}>
      <PositionDetail params={params} />
    </Suspense>
  );
}

type PublicPosition = NonNullable<Awaited<ReturnType<typeof getPublicPosition>>>;

async function PositionDetail({ params }: Pick<PageProps<"/positionen/[slug]">, "params">) {
  await connection();
  const { slug } = await params;
  const position = await getPublicPosition(slug);
  if (!position) notFound();
  const settings = await getSettings();
  const minAge = effectiveMinAge(position, { minAge: settings["applications.minAge"] });
  const open = position.status === "OPEN";

  return (
    <>
      <section className="relative overflow-hidden pt-32 pb-10 sm:pt-40">
        <div className="absolute inset-0 nv-hero-glow pointer-events-none" aria-hidden />
        <Container className="relative">
          <Link href="/#positionen" className="nv-btn nv-btn-quiet nv-btn-sm -ml-3 mb-6">
            <ArrowLeft size={14} aria-hidden /> Alle Positionen
          </Link>
          <div className="flex items-start gap-5 nv-anim">
            <IconTile icon={position.icon} className="h-14 w-14" />
            <div>
              <p className="nv-label">Position // {position.title}</p>
              <h1 className="nv-headline text-5xl sm:text-6xl mt-3">
                {position.title}
                <em>.</em>
              </h1>
              <p className="mt-3 text-lg text-muted">{position.tagline}</p>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            <p className="text-lg text-fg-2 max-w-2xl nv-anim" style={{ "--i": 1 } as React.CSSProperties}>
              {position.description}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <ListCard icon={<ListChecks size={20} aria-hidden />} title="Deine Aufgaben" items={position.tasks} />
              <ListCard icon={<Target size={20} aria-hidden />} title="Was du mitbringst" items={position.requirements} />
            </div>
          </div>

          <aside
            className="lg:sticky lg:top-28 self-start nv-card p-6 bg-surface nv-anim"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            <p className="nv-mono">Status</p>
            <div className="mt-2 flex items-center gap-2">
              {open ? (
                <span className="nv-pill nv-tone-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-current nv-pulse-dot" aria-hidden /> Bewerbungen offen
                </span>
              ) : (
                <span className="nv-pill">Gerade geschlossen</span>
              )}
            </div>
            {open && position.closesAt && (
              <p className="mt-2 text-xs text-muted">Bewerbungen bis {formatDay(position.closesAt)} möglich.</p>
            )}
            {!open && position.opensAt && <p className="mt-2 text-xs text-muted">Öffnet voraussichtlich am {formatDay(position.opensAt)}.</p>}
            {open && typeof position.seats === "number" && position.seats > 0 && (
              <p className="mt-2 text-xs text-muted">{position.seats === 1 ? "Nur noch 1 Platz frei." : `Noch ${position.seats} Plätze frei.`}</p>
            )}
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Mindestalter</dt>
                <dd>{minAge} Jahre</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Gespräch &amp; Support</dt>
                <dd>Discord</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Ingame-Voice</dt>
                <dd>TeamSpeak &amp; SaltyChat</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Vergütung</dt>
                <dd className="text-right">Ehrenamtlich – derzeit keine Bezahlung</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Sperrfrist nach Absage</dt>
                <dd>{position.cooldownDays ?? settings["applications.cooldownDays"]} Tage</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Bearbeitung</dt>
                <dd className="text-right">{settings["applications.processingTime"]}</dd>
              </div>
            </dl>
            <div className="nv-divider my-5" />
            <Suspense fallback={<div className="nv-skeleton h-11" />}>
              <ApplyCta position={position} />
            </Suspense>
          </aside>
        </div>
      </Container>
    </>
  );
}

async function ApplyCta({ position }: { position: PublicPosition }) {
  const user = await getCurrentUser();
  if (!user) {
    return position.status === "OPEN" ? (
      <div className="space-y-3">
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/bewerben/${position.slug}`)}`}
          className="nv-btn nv-btn-primary w-full"
        >
          Mit Discord einloggen &amp; bewerben <ArrowRight size={16} aria-hidden />
        </Link>
        <p className="text-xs text-muted text-center">Dein Entwurf wird automatisch gespeichert.</p>
      </div>
    ) : (
      <p className="text-sm text-muted">Für diese Position nehmen wir gerade keine Bewerbungen an. Schau bald wieder vorbei.</p>
    );
  }
  if (position.status !== "OPEN") {
    const me = await db.user.findUnique({ where: { id: user.id }, select: { notifyNewPositions: true } });
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Für diese Position nehmen wir gerade keine Bewerbungen an.</p>
        <NotifyToggle on={!!me?.notifyNewPositions} />
      </div>
    );
  }

  const e = await getEligibility(user.id, position);
  if (e.ok) {
    return (
      <Link href={`/bewerben/${position.slug}`} className="nv-btn nv-btn-primary w-full">
        {e.draftId ? "Entwurf fortsetzen" : "Jetzt bewerben"} <ArrowRight size={16} aria-hidden />
      </Link>
    );
  }
  switch (e.code) {
    case "open_exists":
      return (
        <div className="space-y-3">
          <Notice tone="info" icon={CheckCircle} title="Du hast dich schon beworben.">
            Den aktuellen Stand siehst du im Dashboard.
          </Notice>
          <Link href={`/dashboard/${e.applicationId}`} className="nv-btn nv-btn-ghost w-full">
            Zur Bewerbung
          </Link>
        </div>
      );
    case "cooldown":
      return (
        <Notice tone="warn" icon={ClockCountdown} title="Sperrfrist läuft.">
          Du kannst dich ab dem {formatDay(e.until)} wieder bewerben.
        </Notice>
      );
    case "banned":
      return (
        <Notice tone="danger" icon={Prohibit} title={e.message}>
          {e.until ? `Bis ${formatDay(e.until)}.` : "Bei Fragen melde dich im Support."}
        </Notice>
      );
    case "closed":
      return <p className="text-sm text-muted">{e.message}</p>;
  }
}

function ListCard({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="nv-card p-6">
      <div className="flex items-center gap-2 text-red-text">
        {icon}
        <h2 className="font-semibold text-fg">{title}</h2>
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5 text-sm text-fg-2">
            <span className="mt-2 h-1 w-1 rounded-full bg-red shrink-0" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PositionSkeleton() {
  return (
    <Container className="pt-40 space-y-6">
      <div className="nv-skeleton h-16 w-2/3" />
      <div className="nv-skeleton h-6 w-1/2" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="nv-skeleton h-56" />
        <div className="nv-skeleton h-56" />
      </div>
    </Container>
  );
}
