import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTeam } from "@/lib/auth/session";
import { HELP } from "@/lib/help";
import { HelpBrowser } from "@/components/team/HelpBrowser";

export const metadata: Metadata = { title: "Hilfe & Begriffe" };

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Hilfe</p>
        <h1 className="nv-headline text-4xl mt-2">
          Hilfe &amp; <em>Begriffe.</em>
        </h1>
        <p className="text-sm text-muted mt-2">Was die Begriffe, Hinweise und Knöpfe im Team-Bereich bedeuten – kurz erklärt.</p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireTeam();
  return <HelpBrowser sections={HELP} />;
}
