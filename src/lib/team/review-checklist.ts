/** Prüfliste einer Bewerbung: eigene der Stelle, sonst Standard aus den Einstellungen. Rein, für Tests. */
export function checklistFor(position: { reviewChecklist?: string[] | null }, defaults: string): string[] {
  const own = (position.reviewChecklist ?? []).map((l) => l.trim()).filter(Boolean);
  const list = own.length ? own : defaults.split("\n").map((l) => l.trim()).filter(Boolean);
  return [...new Set(list)].slice(0, 15).map((l) => l.slice(0, 120));
}
