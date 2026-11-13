import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Container } from "@/components/ui";
import { PositionMatch } from "@/components/apply/PositionMatch";
import { listPublicPositions } from "@/lib/data/positions";

export const metadata: Metadata = { title: "Welche Stelle passt zu mir?", description: "Fünf kurze Fragen – danach siehst du, welche Stelle bei Nordverkehr zu dir passen könnte." };

export default function MatchPage() {
  return (
    <section className="pt-28 sm:pt-32 pb-12">
      <Container>
        <div className="mx-auto max-w-2xl space-y-6">
          <header>
            <p className="nv-label">Bewerbung // Selbsttest</p>
            <h1 className="nv-headline text-5xl mt-3">
              Welche Stelle <em>passt?</em>
            </h1>
            <p className="mt-3 text-lg text-muted">Fünf kurze Fragen, dann siehst du, wo du am besten reinpasst. Nichts wird gespeichert.</p>
          </header>
          <Suspense fallback={<div className="nv-skeleton h-96" />}>
            <Content />
          </Suspense>
        </div>
      </Container>
    </section>
  );
}

async function Content() {
  await connection();
  const positions = await listPublicPositions();
  return <PositionMatch positions={positions.map((p) => ({ slug: p.slug, title: p.title, tagline: p.tagline, open: p.status === "OPEN" }))} />;
}
