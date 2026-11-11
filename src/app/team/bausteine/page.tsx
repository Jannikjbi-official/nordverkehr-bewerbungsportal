import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { TemplateManager } from "@/components/team/TemplateManager";

export const metadata: Metadata = { title: "Nachrichtenbausteine" };

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Bausteine</p>
        <h1 className="nv-headline text-4xl mt-2">
          Nachrichten&shy;<em>bausteine.</em>
        </h1>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          Textvorlagen für Antworten an Bewerber. Platzhalter wie <code className="nv-kbd">{"{name}"}</code> werden beim Senden
          automatisch ersetzt. Reihenfolge per Drag &amp; Drop.
        </p>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-[30rem]" />}>
        <Templates />
      </Suspense>
    </div>
  );
}

async function Templates() {
  await requireTeam();
  const templates = await db.messageTemplate.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  return (
    <TemplateManager
      templates={templates.map((t) => ({ id: t.id, category: t.category, title: t.title, body: t.body, active: t.active }))}
    />
  );
}
