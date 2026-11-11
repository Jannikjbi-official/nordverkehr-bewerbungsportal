import type { Metadata } from "next";
import Link from "next/link";
import { LockKey } from "@phosphor-icons/react/ssr";
import { Container } from "@/components/ui";

export const metadata: Metadata = { title: "Kein Zugriff", robots: { index: false } };

export default function NoAccessPage() {
  return (
    <section className="pt-36 pb-16">
      <Container>
        <div className="mx-auto max-w-lg text-center nv-anim">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-soft text-red-text border border-red-line">
            <LockKey size={28} aria-hidden />
          </div>
          <p className="nv-label justify-center w-full mt-6">Team-Bereich</p>
          <h1 className="nv-headline text-4xl mt-3">
            Hier geht&apos;s nur <em>fürs Team</em> weiter.
          </h1>
          <p className="text-muted mt-4">
            Der Team-Bereich ist nur mit der passenden Rolle auf unserem Discord-Server erreichbar. Wenn du die Rolle
            gerade erst bekommen hast, log dich einmal neu ein.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="nv-btn nv-btn-primary">Meine Bewerbungen</Link>
            <Link href="/" className="nv-btn nv-btn-ghost">Zur Übersicht</Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
