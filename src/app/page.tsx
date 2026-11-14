import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArrowRight,
  ChatCircleDots,
  ClipboardText,
  DiscordLogo,
  FloppyDisk,
  Flask,
  Handshake,
  IdentificationCard,
  Microphone,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react/ssr";
import { Container, IconTile, PageHero, SectionTitle, cn, formatDay } from "@/components/ui";
import { db } from "@/lib/db";
import { KINDS, kindOf } from "@/lib/kinds";
import { listPublicPositions } from "@/lib/data/positions";
import { getSettings } from "@/lib/settings";

const STEPS = [
  { icon: DiscordLogo, title: "Mit Discord einloggen", text: "Kein extra Account. Wir brauchen nur deinen Discord-Namen." },
  { icon: FloppyDisk, title: "In Ruhe ausfüllen", text: "Dein Entwurf wird automatisch gespeichert. Du kannst jederzeit weitermachen." },
  { icon: ChatCircleDots, title: "Team prüft & meldet sich", text: "Du bekommst eine Bestätigung per DM und siehst den Status im Dashboard." },
  { icon: Microphone, title: "Gespräch auf Discord", text: "Bei Whitelist und Team lernen wir uns kurz im Sprachkanal kennen. Ehrlich und ohne Druck." },
];

export default function HomePage() {
  return (
    <>
      <PageHero
        label="NORDVERKEHR // BEWERBUNG"
        title="Bewirb dich"
        emphasis="bei Nordverkehr."
        aside={
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <a href="#bewerben" className="nv-btn nv-btn-primary">
              Jetzt bewerben <ArrowRight size={16} aria-hidden />
            </a>
            <Link href="/dashboard" className="nv-btn nv-btn-ghost">
              <ClipboardText size={16} aria-hidden /> Meine Bewerbungen
            </Link>
          </div>
        }
      >
        <p>
          Ob als Spieler auf der Whitelist, als Beta-Tester vor dem Start oder im Team – hier bewirbst du dich. Ehrliches
          Hamburg-RP: erst auf GTA 5, danach beim Umzug auf GTA 6.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Suspense fallback={<span className="nv-pill">Mindestalter …</span>}>
            <MinAgePill />
          </Suspense>
          <span className="nv-pill">Login mit Discord</span>
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

      <section id="bewerben" className="scroll-mt-28 pt-24">
        <Container>
          <SectionTitle label="Bewerben" title="Wo willst du" emphasis="mitmachen?">
            Drei Wege zu Nordverkehr – jeder mit eigenem Formular. Du kannst dich für mehrere gleichzeitig bewerben.
          </SectionTitle>
          <Suspense fallback={<div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="nv-skeleton h-56" />)}</div>}>
            <KindCards />
          </Suspense>
        </Container>
      </section>

      <section id="positionen" className="scroll-mt-28 pt-24">
        <Container>
          <SectionTitle label="Team // Offene Stellen" title="Wir suchen" emphasis="Verstärkung.">
            Nordverkehr ist ein Community-Projekt – die Mitarbeit im Team ist ehrenamtlich. Klick auf eine Rolle, um Aufgaben
            und Anforderungen zu sehen. Unsicher?{" "}
            <Link href="/passt-zu-mir" className="nv-link">
              Welche Stelle passt zu mir?
            </Link>
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

/** Whitelist, Beta, Team – mit Status (offen/geschlossen) und Link. */
async function KindCards() {
  await connection();
  await listPublicPositions(); // legt bei frischer Datenbank Basisdaten an
  const [special, teamOpen] = await Promise.all([
    db.position.findMany({
      where: { slug: { in: ["whitelist", "beta"] }, status: { not: "HIDDEN" }, type: { active: true } },
      select: { slug: true, title: true, status: true, opensAt: true, seats: true, type: { select: { key: true } } },
    }),
    db.position.count({ where: { status: "OPEN", type: { key: "team", active: true } } }),
  ]);
  const cards = [
    ...["whitelist", "beta"].flatMap((slug) => {
      const p = special.find((x) => x.slug === slug);
      if (!p) return [];
      const k = kindOf(p.type.key);
      return [{ key: k.key, title: p.title, teaser: k.teaser, open: p.status === "OPEN", href: k.path, icon: k.key === "beta" ? Flask : IdentificationCard, note: p.status !== "OPEN" && p.opensAt ? `Öffnet am ${formatDay(p.opensAt)}` : p.status === "OPEN" && typeof p.seats === "number" && p.seats > 0 ? `Noch ${p.seats} Plätze` : null }];
    }),
    {
      key: "team",
      title: "Team",
      teaser: KINDS.team.teaser,
      open: teamOpen > 0,
      href: "/#positionen",
      icon: UsersThree,
      note: teamOpen > 0 ? `${teamOpen} ${teamOpen === 1 ? "Stelle" : "Stellen"} offen` : null,
    },
  ];
  return (
    <ul className={cn("grid gap-4", cards.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
      {cards.map((c, i) => (
        <li key={c.key} className="nv-anim" style={{ "--i": i } as React.CSSProperties}>
          <Link href={c.href} className={cn("nv-card nv-card-hover group flex h-full flex-col gap-4 p-6", !c.open && "opacity-80")}>
            <div className="flex items-center justify-between gap-3">
              <span className="h-12 w-12 shrink-0 rounded-xl grid place-items-center text-red-text border border-red-line bg-red-soft">
                <c.icon size={24} weight="duotone" aria-hidden />
              </span>
              {c.open ? (
                <span className="nv-pill nv-tone-success !text-[0.7rem] !py-0.5">Offen</span>
              ) : (
                <span className="nv-pill !text-[0.7rem] !py-0.5">{c.key === "team" ? "Gerade keine Stellen" : "Noch geschlossen"}</span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-display text-3xl">{c.title}</h3>
              <p className="mt-2 text-sm text-muted">{c.teaser}</p>
              {c.note && <p className="mt-2 text-xs text-fg-2">{c.note}</p>}
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-text">
              {c.open ? (c.key === "team" ? "Stellen ansehen" : "Jetzt bewerben") : "Mehr erfahren"}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
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
