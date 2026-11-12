/**
 * Gesprächsprotokoll fürs Bewerbungsgespräch (Discord): Fragen zum Abhaken (Vorlage pro
 * Stelle, sonst Standard aus den Einstellungen, plus eigene Fragen pro Bewerbung)
 * und Notizen pro Frage sowie ein Gesamtfazit. Mehrere Teammitglieder ergänzen –
 * jede Notiz mit Name und Zeit, nichts wird überschrieben. Nur für das Team.
 */

/** Notizen ohne Frage = Gesamtfazit */
export const CONCLUSION = "";
export const MAX_QUESTION_LENGTH = 300;

export const splitLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((l) => l.slice(0, MAX_QUESTION_LENGTH));

/** Fragenliste: Stellen-Vorlage (oder Standard) + eigene Fragen, ohne Dubletten. */
export function protocolQuestions(positionQuestions: string[], defaults: string, extra: string[]) {
  const base = positionQuestions.length ? positionQuestions : splitLines(defaults);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...base, ...extra]) {
    const k = q.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q.trim());
  }
  return out;
}

export interface ProtocolNote {
  id: string;
  body: string;
  by: string;
  byId: string | null;
  at: string;
}

export interface ProtocolItem {
  question: string;
  extra: boolean;
  checked: { by: string; at: string } | null;
  notes: ProtocolNote[];
}

export interface Protocol {
  items: ProtocolItem[];
  conclusion: ProtocolNote[];
  /** Notizen zu Fragen, die es in der Vorlage nicht mehr gibt */
  orphans: (ProtocolNote & { question: string })[];
  /** Haken an Fragen, die es in der Vorlage nicht mehr gibt (z. B. umbenannt) */
  orphanChecks: { question: string; by: string; at: string }[];
  started: boolean;
}

type Person = { globalName: string | null; username: string } | null;
const nameOf = (u: Person) => (u ? u.globalName || u.username : "Gelöscht");

export function buildProtocol(
  questions: string[],
  extra: string[],
  checks: { question: string; checkedAt: Date; checkedBy: Person }[],
  notes: { id: string; question: string; body: string; authorId: string | null; author: Person; createdAt: Date }[],
): Protocol {
  const extraSet = new Set(extra.map((e) => e.trim().toLowerCase()));
  const toNote = (n: (typeof notes)[number]): ProtocolNote => ({ id: n.id, body: n.body, by: nameOf(n.author), byId: n.authorId, at: n.createdAt.toISOString() });
  const sorted = [...notes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const known = new Set(questions);
  return {
    items: questions.map((q) => {
      const c = checks.find((x) => x.question === q);
      return {
        question: q,
        extra: extraSet.has(q.toLowerCase()),
        checked: c ? { by: nameOf(c.checkedBy), at: c.checkedAt.toISOString() } : null,
        notes: sorted.filter((n) => n.question === q).map(toNote),
      };
    }),
    conclusion: sorted.filter((n) => n.question === CONCLUSION).map(toNote),
    orphans: sorted.filter((n) => n.question !== CONCLUSION && !known.has(n.question)).map((n) => ({ ...toNote(n), question: n.question })),
    orphanChecks: checks.filter((c) => !known.has(c.question)).map((c) => ({ question: c.question, by: nameOf(c.checkedBy), at: c.checkedAt.toISOString() })),
    started: notes.length > 0 || checks.length > 0,
  };
}

/**
 * Nachfrage-Vorschläge für das Gespräch aus der Bewerbung selbst:
 * falsch beantwortete Quizfragen und auffällig knappe Text-/Szenario-Antworten.
 * Bereits im Protokoll stehende Fragen werden nicht nochmal vorgeschlagen.
 */
export function suggestFollowUps(
  answers: { label: string; type: string; value: unknown; correct?: boolean | null; minLength?: number | null }[],
  existing: string[],
  max = 6,
): string[] {
  const have = new Set(existing.map((q) => q.trim().toLowerCase()));
  const out: string[] = [];
  const add = (q: string) => {
    const t = q.slice(0, MAX_QUESTION_LENGTH);
    if (!have.has(t.toLowerCase()) && out.length < max) {
      have.add(t.toLowerCase());
      out.push(t);
    }
  };
  for (const a of answers) {
    if (a.type === "QUIZ" && a.correct === false) add(`Quiz falsch: „${a.label}“ – Regel im Gespräch erklären lassen`);
  }
  for (const a of answers) {
    if (a.type !== "LONG_TEXT" && a.type !== "SCENARIO") continue;
    const len = typeof a.value === "string" ? a.value.trim().length : 0;
    const expected = Math.max(a.minLength ?? 0, a.type === "SCENARIO" ? 150 : 100);
    if (len < expected * 1.3) add(`Knapp beantwortet: „${a.label}“ – genauer ausführen lassen`);
  }
  return out;
}
