/**
 * Regel-Quiz pro Person: Reihenfolge der Quizfragen und ihrer Antworten wird
 * gemischt, optional nur eine Auswahl (Fragenpool) gezogen. Deterministisch per
 * Schlüssel (Nutzer + Stelle + Versuch) – gleiche Person, gleicher Versuch, gleiche Fragen.
 * Rein (ohne DB), für Formular, Absenden und Tests.
 */
import type { FormSectionDef } from "@/lib/applications/form";

/** Kleiner, stabiler Hash → 32-Bit-Seed (FNV-1a). */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministischer Zufall (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  const r = rng(hash(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Schlüssel: neuer Versuch (nach Absage/Zurückziehen) → neue Ziehung. */
export const quizSeed = (userId: string, positionId: string, attempt: number) => `${userId}:${positionId}:${attempt}`;

/**
 * Quizfragen jedes Abschnitts mischen (an ihren bisherigen Plätzen), Antworten mischen
 * und – wenn `drawCount` gesetzt ist – über alle Abschnitte nur so viele Quizfragen behalten.
 */
export function personalizeQuiz(sections: FormSectionDef[], seed: string, drawCount?: number | null): FormSectionDef[] {
  const allQuiz = sections.flatMap((s) => s.questions.filter((q) => q.type === "QUIZ").map((q) => q.id));
  const keep = drawCount && drawCount > 0 && drawCount < allQuiz.length ? new Set(shuffle(allQuiz, `${seed}:pool`).slice(0, drawCount)) : null;
  return sections
    .map((s) => {
      const quiz = s.questions.filter((q) => q.type === "QUIZ" && (!keep || keep.has(q.id)));
      if (!quiz.length && !s.questions.some((q) => q.type === "QUIZ")) return s;
      const mixed = shuffle(quiz, `${seed}:${s.id}`).map((q) => ({ ...q, options: shuffle(q.options, `${seed}:${q.id}`) }));
      let i = 0;
      const questions = s.questions.filter((q) => q.type !== "QUIZ" || !keep || keep.has(q.id)).map((q) => (q.type === "QUIZ" ? mixed[i++] : q));
      return { ...s, questions };
    })
    .filter((s) => s.questions.length > 0);
}
