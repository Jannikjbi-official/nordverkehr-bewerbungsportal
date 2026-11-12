/**
 * KI-Text-Check – feste Regeln (laufen ohne KI, nichts verlässt den Server).
 * Ergebnis ist IMMER nur ein Hinweis fürs Team: Erkennung von KI-Texten ist
 * unsicher, gute Schreiber und Nicht-Muttersprachler werden leicht falsch
 * eingeschätzt. Das stärkste Signal ist, ob lange Antworten eingefügt statt
 * getippt wurden.
 */

export type TextCheckLevel = "niedrig" | "mittel" | "hoch";

export interface TextCheckSignal {
  source: "einfuegen" | "regel" | "ki";
  text: string;
}

export interface TextCheckResult {
  level: TextCheckLevel;
  signals: TextCheckSignal[];
  /** KI-Einschätzung lief (sonst nur Regeln) */
  aiUsed: boolean;
}

export interface CheckAnswer {
  questionId: string;
  label: string;
  text: string;
}

/** Typische Floskeln von KI-Chatbots (deutsch, klein geschrieben) */
export const AI_PHRASES = [
  "als ki",
  "als künstliche intelligenz",
  "als sprachmodell",
  "hier ist eine",
  "hier ist ein",
  "gerne helfe ich",
  "ich hoffe, das hilft",
  "zusammenfassend lässt sich",
  "zusammenfassend kann man",
  "in der heutigen",
  "darüber hinaus",
  "des weiteren",
  "nicht zuletzt",
  "ich bin fest davon überzeugt",
  "facettenreich",
  "von entscheidender bedeutung",
  "ein wichtiger aspekt",
  "abschließend möchte ich",
  "eine bereicherung für",
  "mit leidenschaft und engagement",
  "[dein name]",
  "[name]",
];

const MIN_PASTE = 150;

export function ruleSignals(answers: CheckAnswer[], pastes: Record<string, number>): { signals: TextCheckSignal[]; score: number } {
  const signals: TextCheckSignal[] = [];
  let score = 0;

  // 1) Eingefügt statt getippt
  let pastedAnswers = 0;
  for (const a of answers) {
    const pasted = pastes[a.questionId] ?? 0;
    if (pasted >= MIN_PASTE && a.text.length >= MIN_PASTE && pasted >= a.text.length * 0.6) {
      pastedAnswers++;
      signals.push({ source: "einfuegen", text: `„${a.label}“: ${pasted} Zeichen eingefügt statt getippt (Antwort hat ${a.text.length}).` });
    }
  }
  score += Math.min(pastedAnswers, 3) * 2;

  const all = answers.map((a) => a.text).join("\n");
  const lower = all.toLowerCase();

  // 2) Chatbot-Floskeln
  const hits = [...new Set(AI_PHRASES.filter((p) => lower.includes(p)))];
  if (hits.length >= 2 || hits.some((h) => h.startsWith("als ") || h.startsWith("["))) {
    signals.push({ source: "regel", text: `Typische Chatbot-Formulierungen: ${hits.slice(0, 5).map((h) => `„${h}“`).join(", ")}.` });
    score += hits.length >= 4 || hits.some((h) => h.startsWith("als ") || h.startsWith("[")) ? 2 : 1;
  }

  // 3) Formatierung wie aus einem Chat (Markdown)
  const markdown = (all.match(/\*\*[^*\n]+\*\*/g)?.length ?? 0) + (all.match(/^#{1,4} /gm)?.length ?? 0);
  if (markdown >= 2) {
    signals.push({ source: "regel", text: "Formatierung wie aus einem Chatbot (fett gedruckte Überschriften/Markdown)." });
    score += 1;
  }

  // 4) Viele lange Gedankenstriche (—), im normalen Tippen selten
  const dashes = all.match(/—/g)?.length ?? 0;
  if (dashes >= 3) {
    signals.push({ source: "regel", text: `${dashes} lange Gedankenstriche (—) – beim Tippen auf der Tastatur ungewöhnlich.` });
    score += 1;
  }

  return { signals, score };
}

export function levelFromScore(score: number): TextCheckLevel {
  return score >= 3 ? "hoch" : score >= 1 ? "mittel" : "niedrig";
}

const RANK: Record<TextCheckLevel, number> = { niedrig: 0, mittel: 1, hoch: 2 };

/**
 * Regeln + KI zusammenführen. Die KI allein kann höchstens „mittel“ ergeben –
 * „hoch“ braucht mindestens ein hartes Signal (Einfügen oder klare Floskeln).
 */
export function combineLevels(rules: TextCheckLevel, ai: TextCheckLevel | null): TextCheckLevel {
  if (!ai) return rules;
  const aiCapped: TextCheckLevel = ai === "hoch" && rules === "niedrig" ? "mittel" : ai;
  return RANK[aiCapped] > RANK[rules] ? aiCapped : rules;
}

/** KI-Antwort {"stufe":"…","gruende":["…"]} lesen. */
export function parseAiTextCheck(output: string): { level: TextCheckLevel; reasons: string[] } | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const p = JSON.parse(output.slice(start, end + 1)) as { stufe?: unknown; gruende?: unknown };
    if (p.stufe !== "niedrig" && p.stufe !== "mittel" && p.stufe !== "hoch") return null;
    const reasons = Array.isArray(p.gruende) ? p.gruende.filter((g): g is string => typeof g === "string" && !!g.trim()).map((g) => g.trim().slice(0, 360)).slice(0, 4) : [];
    return { level: p.stufe, reasons };
  } catch {
    return null;
  }
}

export function readTextCheck(value: unknown): TextCheckResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<TextCheckResult>;
  if (v.level !== "niedrig" && v.level !== "mittel" && v.level !== "hoch") return null;
  return { level: v.level, signals: Array.isArray(v.signals) ? v.signals : [], aiUsed: !!v.aiUsed };
}
