/**
 * Namens-Check für Bewerber (Discord-Anzeigename und Benutzername).
 * Nur ein HINWEIS fürs Team – kein Ausschluss, kein Score. Erkennt:
 *  - Beleidigungen/Vulgäres (auch mit Leetspeak und Zeichen dazwischen)
 *  - Extremistische Begriffe und Codes
 *  - Namen, die sich als Team/Nordverkehr ausgeben
 *  - Manipulationsversuche (Prompt Injection) im Namen
 *
 * Bewusst vorsichtig gegen Fehlalarme: kurze Begriffe zählen nur als ganzes Wort
 * (z. B. „Nazir“ oder „Hessen“ sind kein Treffer), lange auch als Teil des Namens.
 */
import { detectInjection, normalizeForDetection } from "@/lib/ai/guard";

export type NameIssue = "beleidigend" | "extremistisch" | "gibt sich als Team aus" | "Manipulationsversuch";

/** Treffer auch als Teil eines Wortes (lang genug, kaum Fehlalarme) */
const OFFENSIVE_PART = [
  "hurensohn", "hurenson", "wichser", "fotze", "missgeburt", "spast", "schwuchtel", "arschloch", "arschgeige", "hackfresse",
  "fickdich", "ficker", "motherfucker", "fuckyou", "bitch", "nigger", "nigga", "kanake", "behindert", "vollidiot",
  "pisser", "schlampe", "nutte", "kinderficker", "faggot", "dickhead", "pimmel", "vagina",
];
/** Nur als ganzes Wort (zu kurz/mehrdeutig als Teilstring) */
const OFFENSIVE_WORD = ["fick", "fickt", "fuck", "hure", "opfer", "lappen", "idiot", "arsch", "kys", "neger", "porn", "porno", "cunt", "pedo", "mongo", "retard", "penis"];

const EXTREMIST_PART = ["hitler", "heilhitler", "siegheil", "holocaust", "auschwitz", "judenhass", "whitepower", "reichsburger", "reichsbuerger", "kukluxklan"];
const EXTREMIST_WORD = ["nazi", "nazis", "nsdap", "kkk", "ss", "hh88"];

/** Team-Begriffe – als ganzes Wort, Nordverkehr auch als Teil */
const STAFF_WORD = ["admin", "administrator", "moderator", "mod", "support", "supporter", "team", "staff", "owner", "leitung", "projektleitung", "teamleitung", "official", "offiziell", "bot", "system"];
const STAFF_PART = ["nordverkehr", "nvteam", "nvsupport", "nvadmin"];

const hasWord = (tokens: string[], list: string[]) => tokens.some((t) => list.includes(t));
const hasPart = (squashed: string, list: string[]) => list.some((w) => squashed.includes(w));

/**
 * Wörter eines Namens: an Sonderzeichen und Buchstaben/Ziffer-Grenzen getrennt.
 * Leetspeak nur innerhalb von Wörtern mit Buchstaben („H1tler“ → „hitler“) –
 * reine Zahlen bleiben Zahlen („lukas_55“ ist kein „ss“).
 */
export function nameTokens(name: string): string[] {
  const raw = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}@$€|]+/u)
    .filter(Boolean);
  return raw.flatMap((t) => {
    const word = /^\d+$/.test(t) ? t : normalizeForDetection(t).squashed;
    return word.replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").split(" ").filter(Boolean);
  });
}

/** Prüft einen Namen. Leere Liste = unauffällig. */
export function checkName(name: string): NameIssue[] {
  if (!name.trim()) return [];
  const { squashed } = normalizeForDetection(name);
  const tokens = nameTokens(name);
  // Ziffern im Original (vor Leetspeak) – für Zahlencodes wie 1488
  const digitTokens = name.toLowerCase().split(/[^0-9]+/).filter(Boolean);
  const issues: NameIssue[] = [];
  if (hasPart(squashed, OFFENSIVE_PART) || hasWord(tokens, OFFENSIVE_WORD)) issues.push("beleidigend");
  // Zahlencodes nur eindeutig („1488“, „HH88“) – ein bloßes „88“ ist oft nur das Geburtsjahr
  if (hasPart(squashed, EXTREMIST_PART) || hasWord(tokens, EXTREMIST_WORD) || digitTokens.some((d) => d.includes("1488")) || /hh\W*88/i.test(name)) {
    issues.push("extremistisch");
  }
  if (hasPart(squashed, STAFF_PART) || hasWord(tokens, STAFF_WORD)) issues.push("gibt sich als Team aus");
  if (detectInjection(name).suspicious) issues.push("Manipulationsversuch");
  return issues;
}

/** Alle Namen einer Person prüfen (Anzeigename + Benutzername). Gibt den ersten auffälligen mit Gründen zurück. */
export function checkNames(names: (string | null | undefined)[]): { name: string; issues: NameIssue[] } | null {
  for (const n of names) {
    if (!n) continue;
    const issues = checkName(n);
    if (issues.length) return { name: n, issues };
  }
  return null;
}
