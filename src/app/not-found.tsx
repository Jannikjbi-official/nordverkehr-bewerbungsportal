import Link from "next/link";
import { Container } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="pt-40 pb-16">
      <Container>
        <div className="max-w-lg nv-anim">
          <p className="nv-label">Fehler // 404</p>
          <h1 className="nv-headline text-5xl mt-4">
            Falsch <em>abgebogen.</em>
          </h1>
          <p className="text-muted mt-4">Die Seite gibt es nicht (mehr). Passiert auch auf der Elbchaussee.</p>
          <div className="mt-8 flex gap-3">
            <Link href="/" className="nv-btn nv-btn-primary">Zur Übersicht</Link>
            <Link href="/dashboard" className="nv-btn nv-btn-ghost">Meine Bewerbungen</Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
