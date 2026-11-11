/**
 * Ähnlichkeit von Fragetexten (für die Warnung im Formular-Builder). Rein.
 */
import { normalizeLabel } from "@/lib/setup/questions";

const STOPWORDS = new Set(
  "a an und oder der die das den dem des ein eine einen einem einer du dich dir dein deine deinen deiner wie was wo wann warum welche welcher welches ist bist sind hast hat mit fur fuer von zu im in auf an aus bei uns unser unsere ihr es so noch schon kurz bitte ob als auch nicht"
    .split(" "),
);

export function wordSet(text: string): Set<string> {
  return new Set(
    normalizeLabel(text)
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      // grobe Stammform: einfache Endungen abschneiden
      .map((w) => w.replace(/(ungen|ung|en|er|es|e|n|s)$/, "")),
  );
}

export function similarity(a: string, b: string): number {
  const A = wordSet(a);
  const B = wordSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

export interface ExistingQuestion {
  id: string;
  key: string | null;
  label: string;
  where: string;
}

export interface SimilarHit extends ExistingQuestion {
  score: number;
  reason: "key" | "text";
}

/** Findet Fragen mit gleichem Key oder sehr ähnlichem Text (ohne die Frage selbst). */
export function findSimilarQuestions(
  input: { id?: string; key?: string | null; label: string },
  existing: ExistingQuestion[],
  threshold = 0.7,
): SimilarHit[] {
  const hits: SimilarHit[] = [];
  const own = normalizeLabel(input.label);
  for (const q of existing) {
    if (q.id === input.id) continue;
    if (input.key && q.key && input.key === q.key) {
      hits.push({ ...q, score: 1, reason: "key" });
      continue;
    }
    if (own.length < 8) continue;
    const score = normalizeLabel(q.label) === own ? 1 : similarity(input.label, q.label);
    if (score >= threshold) hits.push({ ...q, score, reason: "text" });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Key-Vorschlag aus dem Fragetext, z. B. "support.einstieg_neue_spieler". */
export function suggestKey(label: string, prefix?: string | null) {
  const words = [...wordSet(label)].slice(0, 4).join("_").slice(0, 40) || "frage";
  return prefix ? `${prefix}.${words}` : words;
}

export const KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)?$/;
