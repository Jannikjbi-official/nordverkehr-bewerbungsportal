import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHero } from "@/components/ui";
import { IMPRINT, SOURCE_URL } from "@/lib/legal";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Impressum", description: "Wer hinter Nordverkehr steht und wie du uns erreichst." };

export default function ImprintPage() {
  return (
    <>
      <PageHero label="RECHTLICHES // IMPRESSUM" title="Impressum." compact>
        <p>Wer hinter Nordverkehr steht und wie du uns erreichst.</p>
      </PageHero>
      <Container>
        <article className="max-w-3xl text-fg-2 leading-relaxed [&_p]:mt-3">
          <H n="01">Angaben gemäß § 5 DDG</H>
          <p className="text-fg">{IMPRINT.name}</p>
          {IMPRINT.address.length ? (
            <p className="!mt-1">
              {IMPRINT.address.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </p>
          ) : (
            <p className="!mt-1">Anschrift wird in Kürze ergänzt.</p>
          )}

          <H n="02">Kontakt</H>
          <p>
            E-Mail:{" "}
            <a className="nv-link" href={`mailto:${IMPRINT.email}`}>
              {IMPRINT.email}
            </a>
            <br />
            Discord:{" "}
            <a className="nv-link" href={publicEnv.discordInvite} target="_blank" rel="noopener noreferrer">
              {IMPRINT.discordContact}
            </a>
          </p>

          <H n="03">Verantwortlich für den Inhalt</H>
          <p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: {IMPRINT.name}, Anschrift wie oben.</p>

          <H n="04">Haftung für Inhalte und Links</H>
          <p>
            Die Inhalte dieser Website wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität können wir jedoch keine Gewähr übernehmen. Als
            Diensteanbieter sind wir für eigene Inhalte nach den allgemeinen Gesetzen verantwortlich.
          </p>
          <p>
            Diese Website enthält Links zu externen Seiten (z. B. Discord oder FiveM), auf deren Inhalte wir keinen Einfluss haben. Für diese Inhalte ist stets der jeweilige
            Anbieter verantwortlich. Werden uns Rechtsverletzungen bekannt, entfernen wir entsprechende Links umgehend.
          </p>

          <H n="05">Urheberrecht & Marken</H>
          <p>
            Die auf dieser Website erstellten Inhalte unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung und Verbreitung außerhalb der Grenzen des
            Urheberrechts bedürfen der schriftlichen Zustimmung. Der Quellcode des Bewerbungsportals ist davon ausgenommen: Er steht unter der{" "}
            <a className="nv-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              AGPL-3.0
            </a>
            ; Name und Logo „Nordverkehr“ sind nicht freigegeben.
          </p>
          <p>
            Nordverkehr ist ein unabhängiges Community-Projekt und steht in keiner Verbindung zu Rockstar Games, Take-Two Interactive oder Cfx.re. Grand Theft Auto, GTA und
            FiveM sind Marken der jeweiligen Rechteinhaber.
          </p>

          <p className="mt-10 text-sm">
            Wie wir mit deinen Daten umgehen, steht unter{" "}
            <Link className="nv-link" href="/datenschutz">
              Datenschutz
            </Link>
            .
          </p>
        </article>
      </Container>
    </>
  );
}

function H({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl mt-10 mb-3 text-fg">
      <span className="nv-mono mr-3 text-red-text">§{n}</span>
      {children}
    </h2>
  );
}
