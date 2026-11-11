import "server-only";
import { db } from "@/lib/db";
import type { FormSectionDef } from "@/lib/applications/form";
import { assembleForm } from "@/lib/applications/assemble";

export async function listPublicPositions() {
  const positions = await queryPublicPositions();
  if (positions.length > 0) return positions;
  // Frische Datenbank (z. B. direkt nach dem Verbinden von MongoDB Atlas auf Vercel):
  // Indizes und Basisdaten einmalig anlegen. Läuft nur, solange noch keine Bewerbungsart existiert.
  if ((await db.applicationType.count()) === 0) {
    const { bootstrapDatabase } = await import("@/lib/setup/base-seed");
    await bootstrapDatabase(db).catch((e) => console.error("[setup] Ersteinrichtung fehlgeschlagen", e));
    return queryPublicPositions();
  }
  return positions;
}

function queryPublicPositions() {
  return db.position.findMany({
    where: { status: { in: ["OPEN", "CLOSED"] }, type: { key: "team", active: true } },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
  });
}

export async function getPublicPosition(slug: string) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const p = await db.position.findUnique({ where: { slug }, include: { type: true } });
  if (!p || p.status === "HIDDEN" || !p.type.active) return null;
  return p;
}

/**
 * Formular-Schritte: allgemeine Abschnitte (einmal zentral definiert) zuerst,
 * dann die Fachfragen der Position. Duplikate werden per Key/Text entfernt.
 */
export async function getFormDefinition(position: { id: string; typeId: string; title: string }): Promise<FormSectionDef[]> {
  const sections = await db.formSection.findMany({
    // Alte Abschnitte ohne `archived`-Feld vereinheitlicht die Migration beim Serverstart
    where: { typeId: position.typeId, OR: [{ positionId: null }, { positionId: position.id }], NOT: { archived: true } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { questions: { where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  return assembleForm(
    sections.map((s) => ({
      id: s.id,
      key: s.key,
      title: s.title,
      description: s.description,
      positionId: s.positionId,
      sortOrder: s.sortOrder,
      createdAt: s.createdAt,
      questions: s.questions.map((q) => ({
        id: q.id,
        key: q.key,
        label: q.label,
        helpText: q.helpText,
        placeholder: q.placeholder,
        type: q.type,
        required: q.required,
        minLength: q.minLength,
        maxLength: q.maxLength,
        minValue: q.minValue,
        maxValue: q.maxValue,
        options: q.options,
        sortOrder: q.sortOrder,
      })),
    })),
    position,
  );
}
