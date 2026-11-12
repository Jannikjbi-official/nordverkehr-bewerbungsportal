import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArrowRight,
  ChatCircleDots,
  ClipboardText,
  DiscordLogo,
  FloppyDisk,
  Handshake,
  Microphone,
  ShieldCheck,
} from "@phosphor-icons/react/ssr";
import { Container, IconTile, PageHero, SectionTitle, cn } from "@/components/ui";
import { listPublicPositions } from "@/lib/data/positions";
import { getSettings } from "@/lib/settings";

const STEPS = [
  { icon: DiscordLogo, title: "Mit Discord einloggen", text: "Kein extra Account. Wir brauchen nur deinen Discord-Namen." },
  { icon: FloppyDisk, title: "In Ruhe ausfüllen", text: "Dein Entwurf wird automatisch gespeichert. Du kannst jederzeit weitermachen." },
  { icon: ChatCircleDots, title: "Team prüft & meldet sich", text: "Du bekommst eine Bestätigung per DM und siehst den Status im Dashboard." },
  { icon: Microphone, title: "Gespräch auf Discord", text: "Passt es, lernen wir uns kurz im Sprachkanal kennen. Ehrlich und ohne Druck." },
];

export default function HomePage() {
  return (
    <>
      <PageHero
        label="NORDVERKEHR // TEAM"
        title="Werde Teil"
        emphasis="des Teams."
        aside={
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <a href="#positionen" className="nv-btn nv-btn-primary">
              Offene Positionen <ArrowRight size={16} aria-hidden />
            </a>
            <Link href="/dashboard" className="nv-btn nv-btn-ghost">
              <ClipboardText size={16} aria-hidden /> Meine Bewerbungen
            </Link>
          </div>
        }
      >
        <p>
          Klein, direkt und mit klarem Plan. Wir suchen Leute, die Nordverkehr mit aufbauen – erst auf GTA 5, danach beim
          Umzug auf GTA 6.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="nv-pill nv-pill-red">
            <span className="h-1.5 w-1.5 rounded-full bg-red nv-pulse-dot" aria-hidden /> Bewerbungsphase offen
          </span>
          <Suspense fallback={<span className="nv-pill">Mindestalter …</span>}>
            <MinAgePill />
          </Suspense>
          <span className="nv-pill">Community-Projekt · ehrenamtlich</span>
          <span className="nv-pill">Gespräch &amp; Support auf Discord</span>
          <span className="nv-pill">Hamburg RP</span>
        </div>
      </PageHero>

      <Container>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-[var(--nv-border)] sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-bg p-6 nv-anim" style={{ "--i": i } as React.CSSProperties}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-red-text">0{i + 1}</span>
                <s.icon size={20} className="text-muted" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Container>

      <section id="positionen" className="scroll-mt-28 pt-24">
        <Container>
          <SectionTitle label="Offene Stellen" title="Wir suchen" emphasis="Verstärkung.">
            Klick auf eine Rolle, um Aufgaben und Anforderungen zu sehen. Beworben wird direkt hier im Portal.
          </SectionTitle>
          <Suspense fallback={<PositionsSkeleton />}>
            <PositionList />
          </Suspense>
        </Container>
      </section>

      <section className="pt-24">
        <Container>
          <SectionTitle label="Was zählt" title="Ehrlich" emphasis="statt perfekt." />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Handshake,
                title: "Ehrlichkeit",
                text: "Schreib in deinen eigenen Worten. Kopierte Texte fallen auf – und bringen dich nicht weiter.",
              },
              {
                icon: ClipboardText,
                title: "Verlässlichkeit",
                text: "Lieber fünf Stunden die Woche, die wirklich stattfinden, als zwanzig auf dem Papier.",
              },
              {
                icon: ShieldCheck,
                title: "Fairness",
                text: "Jede Bewerbung wird von mehreren Leuten gelesen. Entscheidungen treffen Menschen – keine Algorithmen.",
              },
            ].map((c) => (
              <div key={c.title} className="nv-card p-6">
                <c.icon size={22} className="text-red-text" aria-hidden />
                <h3 className="mt-4 font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{c.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}

async function MinAgePill() {
  await connection();
  const s = await getSettings();
  return <span className="nv-pill">Ab {s["applications.minAge"]} Jahren</span>;
}

async function PositionList() {
  await connection();
  const positions = await listPublicPositions();
  if (positions.length === 0) {
    return <p className="text-muted">Aktuell sind keine Stellen offen. Schau bald wieder vorbei.</p>;
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {positions.map((p, i) => {
        const open = p.status === "OPEN";
        return (
          <li key={p.id} className="nv-anim" style={{ "--i": i } as React.CSSProperties}>
            <Link
              href={`/positionen/${p.slug}`}
              className={cn("nv-card nv-card-hover group flex items-start gap-5 p-6 h-full", !open && "opacity-70")}
            >
              <IconTile icon={p.icon} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-2xl">{p.title}</h3>
                  {open ? (
                    <span className="nv-pill nv-tone-success !text-[0.7rem] !py-0.5">Offen</span>
                  ) : (
                    <span className="nv-pill !text-[0.7rem] !py-0.5">Geschlossen</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                <p className="mt-4 text-sm text-fg-2 line-clamp-2">{p.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-red-text">
                  Details ansehen
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PositionsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Positionen werden geladen">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="nv-skeleton h-44" />
      ))}
    </div>
  );
}
