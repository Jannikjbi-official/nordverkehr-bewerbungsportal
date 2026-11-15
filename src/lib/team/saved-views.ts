/**
 * Gespeicherte Ansichten der Bewerbungsliste (pro Teammitglied): Name + Filter-Query.
 * Rein (ohne DB), für Aktionen und Tests.
 */
import { z } from "zod";

export const MAX_VIEWS = 12;

export const savedViewSchema = z.object({ name: z.string().trim().min(1).max(40), query: z.string().max(600) });
export type SavedView = z.infer<typeof savedViewSchema>;

/** Gespeicherte Daten sicher lesen (kaputte Einträge fallen weg). */
export function readViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const p = savedViewSchema.safeParse(v);
    return p.success ? [p.data] : [];
  }).slice(0, MAX_VIEWS);
}

/** Ansicht hinzufügen oder (gleicher Name) ersetzen; neueste zuletzt, höchstens MAX_VIEWS. */
export function upsertView(views: SavedView[], view: SavedView): SavedView[] {
  const rest = views.filter((v) => v.name.toLowerCase() !== view.name.toLowerCase());
  return [...rest, view].slice(-MAX_VIEWS);
}
