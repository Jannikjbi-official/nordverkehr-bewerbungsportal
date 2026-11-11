/**
 * Formular zusammenbauen: allgemeine Abschnitte zuerst, dann Fachfragen der
 * Position. Rein und testbar (auch im Browser nutzbar).
 *
 * - Duplikate werden entfernt: gleicher Key, oder – falls kein Key – gleicher
 *   normalisierter Fragetext. Die erste Vorkommnis gewinnt (allgemein vor fachlich).
 * - Heißt ein Abschnitt wie seine Position ("SUPPORT // SUPPORT"), wird er als
 *   "Fachfragen" angezeigt.
 * - Leere Abschnitte fallen weg.
 */
import type { FormQuestion, FormSectionDef } from "@/lib/applications/form";
import { normalizeLabel } from "@/lib/setup/questions";

export interface RawSection {
  id: string;
  key: string | null;
  title: string;
  description: string | null;
  positionId: string | null;
  sortOrder: number;
  createdAt?: Date;
  questions: (FormQuestion & { sortOrder?: number })[];
}

export function assembleForm(sections: RawSection[], position: { title: string }): FormSectionDef[] {
  const ordered = [...sections].sort(
    (a, b) =>
      Number(a.positionId !== null) - Number(b.positionId !== null) ||
      a.sortOrder - b.sortOrder ||
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );

  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  const seenSectionKeys = new Set<string>();
  const result: FormSectionDef[] = [];

  for (const s of ordered) {
    if (s.key && seenSectionKeys.has(s.key)) continue;
    if (s.key) seenSectionKeys.add(s.key);

    const questions = [...s.questions]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .filter((q) => {
        const label = normalizeLabel(q.label);
        if ((q.key && seenKeys.has(q.key)) || seenLabels.has(label)) return false;
        if (q.key) seenKeys.add(q.key);
        seenLabels.add(label);
        return true;
      })
      .map(({ sortOrder: _s, ...q }) => q);
    if (!questions.length) continue;

    const sameAsPosition = s.positionId !== null && normalizeLabel(s.title) === normalizeLabel(position.title);
    result.push({
      id: s.id,
      key: s.key,
      general: s.positionId === null,
      title: sameAsPosition ? "Fachfragen" : s.title,
      description: s.description,
      questions,
    });
  }
  return result;
}

/** Alle Fragen-Keys/-Texte eines zusammengebauten Formulars (für Tests & Prüfungen). */
export function duplicateCheck(sections: FormSectionDef[]) {
  const keys = new Map<string, number>();
  const labels = new Map<string, number>();
  for (const s of sections)
    for (const q of s.questions) {
      if (q.key) keys.set(q.key, (keys.get(q.key) ?? 0) + 1);
      const l = normalizeLabel(q.label);
      labels.set(l, (labels.get(l) ?? 0) + 1);
    }
  return {
    duplicateKeys: [...keys].filter(([, n]) => n > 1).map(([k]) => k),
    duplicateLabels: [...labels].filter(([, n]) => n > 1).map(([l]) => l),
  };
}
