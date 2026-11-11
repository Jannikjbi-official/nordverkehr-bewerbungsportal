import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ListBullets, Plus } from "@phosphor-icons/react/ssr";
import { IconTile } from "@/components/ui";
import { PositionStatusSelect } from "@/components/team/PositionStatusSelect";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Positionen & Fragen" };

export default function PositionsAdminPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nv-label">Admin // Positionen</p>
          <h1 className="nv-headline text-4xl mt-2">
            Positionen &amp; <em>Fragen.</em>
          </h1>
          <p className="text-sm text-muted mt-2">Positionen öffnen/schließen, Texte pflegen und das Formular ohne Code anpassen.</p>
        </div>
        <Link href="/team/positionen/neu" className="nv-btn nv-btn-primary">
          <Plus size={16} aria-hidden /> Neue Position
        </Link>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await requireAdmin();
  const [positions, general] = await Promise.all([
    db.position.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { applications: { where: { status: { not: "DRAFT" } } }, sections: true } } },
    }),
    db.formSection.count({ where: { positionId: null } }),
  ]);
  return (
    <div className="space-y-4">
      <Link href="/team/positionen/allgemein" className="nv-card nv-card-hover flex items-center gap-4 p-5">
        <div className="h-12 w-12 rounded-xl grid place-items-center bg-surface-2 text-muted">
          <ListBullets size={22} aria-hidden />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Allgemeine Fragen</p>
          <p className="text-sm text-muted">{general} Schritte – gelten für alle Positionen (Über dich, Motivation, Szenarien …)</p>
        </div>
        <ArrowRight size={16} className="text-muted" aria-hidden />
      </Link>
      <ul className="grid gap-3">
        {positions.map((p) => (
          <li key={p.id} className="nv-card p-5 flex flex-col gap-4 sm:flex-row sm:items-center">
            <IconTile icon={p.icon} />
            <div className="flex-1 min-w-0">
              <p className="font-display text-2xl">{p.title}</p>
              <p className="text-sm text-muted">
                /{p.slug} · {p._count.applications} Bewerbungen · {p._count.sections} eigene Schritte
              </p>
            </div>
            <PositionStatusSelect positionId={p.id} status={p.status} />
            <Link href={`/team/positionen/${p.id}`} className="nv-btn nv-btn-ghost nv-btn-sm">
              Bearbeiten
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
