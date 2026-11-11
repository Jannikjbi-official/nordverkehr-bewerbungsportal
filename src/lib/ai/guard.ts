/**
 * Schutz vor Prompt Injection & Missbrauch – rein und testbar.
 *
 * Mehrere Schichten (keine allein ist perfekt):
 *  1. Eingabe säubern & begrenzen (Steuerzeichen, unsichtbare Zeichen, Länge).
 *  2. Verdächtige Muster erkennen ("vergiss alle Anweisungen", Rollenwechsel,
 *     Prompt-Auslesen, Chat-Markup …) – inkl. Leetspeak und Zeichen-Tricks.
 *     Treffer → keine KI, feste Antwort, Markierung fürs Team.
 *  3. Nutzerinhalte nur in zufällig benannten Datenblöcken an die KI geben.
 *  4. Ausgabe filtern: keine Pings, nur erlaubte Links, Länge, kein Prompt-Leck.
 */
import { randomBytes } from "node:crypto";

const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿­]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Rohtext säubern und hart begrenzen. */
export function sanitizeInput(text: string, maxChars: number): { text: string; truncated: boolean } {
  let t = text.normalize("NFKC").replace(INVISIBLE, "").replace(CONTROL, "").replace(/\r\n?/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{3,}/g, "  ").trim();
  const truncated = t.length > maxChars;
  return { text: truncated ? t.slice(0, maxChars) : t, truncated };
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "€": "e", "|": "i" };

/** Für die Erkennung normalisieren: klein, ohne Akzente, Leetspeak aufgelöst. */
export function normalizeForDetection(text: string) {
  const base = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(INVISIBLE, "")
    .toLowerCase()
    .replace(/[013457@$€|]/g, (c) => LEET[c] ?? c);
  const spaced = base.replace(/[^\p{L}\p{N}<>/[\]#|]+/gu, " ").replace(/\s+/g, " ").trim();
  // "i g n o r e  a l l" → "ignoreall"
  const squashed = base.replace(/[^\p{L}\p{N}]+/gu, "");
  return { spaced, squashed };
}

// Imperativ + Bezug auf "deine/alle/vorherigen" + Anweisungs-Begriff. Bewusst eng gefasst,
// damit normale Antworten ("Spieler, die Regeln umgehen …") keinen Fehlalarm auslösen.
const VERB = String.raw`(ignorier(e|en|t)?|ignore|vergiss|vergesst|vergessen sie|missachte|disregard|forget|verwirf|uberschreibe|ueberschreibe|override)`;
const SCOPE = String.raw`(deine[nrs]?|ihre|alle[ns]?|samtliche|vorherig\w*|bisherig\w*|obig\w*|vorangegangen\w*|your|all|any|previous|prior|earlier|above|the above|system)`;
const NOUN = String.raw`(anweisung\w*|instruktion\w*|vorgab\w*|prompts?|systemprompt|befehl\w*|regeln|richtlinie\w*|instructions?|rules|guidelines|directives?)`;

const PATTERNS: { reason: string; re: RegExp }[] = [
  { reason: "Anweisungen ignorieren/vergessen", re: new RegExp(String.raw`\b${VERB}\b.{0,25}\b${SCOPE}\b.{0,25}\b${NOUN}\b`) },
  { reason: "Anweisungen ignorieren/vergessen", re: new RegExp(String.raw`\b${VERB} (alles|everything|that)\b`) },
  { reason: "System-Prompt / Modus-Wechsel", re: /\b(system ?prompt|systemnachricht|system message|developer mode|entwicklermodus|admin(istrator)? (modus|mode|override)|jailbreak|do anything now|god ?mode)\b/ },
  { reason: "DAN-Jailbreak", re: /\bdan\b.{0,20}\b(mode|modus|prompt)\b/ },
  {
    reason: "Rollenwechsel",
    re: /\b(du bist (jetzt|ab sofort|nun|ab heute) (ein|eine|der|die|mein)|ab (jetzt|sofort) bist du|you are now|from now on you|act as (a|an|my)|tu so als (ob|wärst|warst)|pretend (to be|you are)|roleplay as|verhalte dich (ab jetzt )?wie|antworte (nur|ab jetzt) als)\b/,
  },
  {
    reason: "Anweisungen auslesen",
    re: /\b(zeig\w*|gib\w*|nenn\w*|print\w*|reveal\w*|show\w*|repeat\w*|wiederhol\w*|verrat\w*|output|leak\w*)\b.{0,30}\b(deine[nrs]? (anweisung\w*|regeln|instruktion\w*|prompt\w*|konfiguration)|your (instructions|rules|prompt|configuration)|system ?prompt|initial prompt|ersten? nachricht)\b/,
  },
  { reason: "Neue Anweisung", re: /\b(neue anweisung\w*|new instructions?|updated instructions?|geanderte anweisung\w*)\b/ },
  { reason: "Chat-Markup", re: /(<\/?\s*(system|assistant|user|instructions?|prompt)\s*>|\[\/?\s*(system|inst|instructions?)\s*\]|#{2,}\s*(system|instruction|anweisung)|<\|im_(start|end)\|>|\bhuman:|\bassistant:)/ },
];

const SQUASHED = ["ignoreallprevious", "ignoreprevious", "ignoriereallevorherigen", "ignorierealle", "vergissalle", "vergissallesvorherige", "vergissdeineanweisungen", "systemprompt", "jailbreak", "developermode", "doanythingnow", "promptinjection"];

export interface InjectionCheck {
  suspicious: boolean;
  reasons: string[];
}

export function detectInjection(text: string): InjectionCheck {
  const { spaced, squashed } = normalizeForDetection(text);
  const reasons = new Set<string>();
  for (const p of PATTERNS) if (p.re.test(spaced)) reasons.add(p.reason);
  if (SQUASHED.some((s) => squashed.includes(s))) reasons.add("Verschleierte Anweisung");
  return { suspicious: reasons.size > 0, reasons: [...reasons] };
}

/** Grobe Token-Schätzung (Deutsch ≈ 3,5 Zeichen/Token) für Vorab-Limits. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.5);
}

/**
 * Nutzerinhalt in einen Datenblock mit zufälligem Namen packen. Der Inhalt
 * kann den Block nicht "schließen", weil er den Namen nicht kennt.
 */
export function wrapUntrusted(content: string, label = "daten") {
  const tag = `${label}-${randomBytes(6).toString("hex")}`;
  const safe = content.replace(new RegExp(`</?${label}-[a-f0-9]*>`, "gi"), "");
  return { tag, block: `<${tag}>\n${safe}\n</${tag}>` };
}

export interface OutputPolicy {
  maxChars: number;
  allowedHosts: string[];
}

/** KI-Ausgabe entschärfen, bevor sie Menschen (oder Discord) erreicht. */
export function sanitizeOutput(text: string, policy: OutputPolicy): string {
  let t = text.replace(CONTROL, "").replace(INVISIBLE, "");
  // Keine Pings: @everyone/@here, Nutzer-, Rollen- und Kanal-Erwähnungen
  t = t.replace(/@(everyone|here)/gi, "@​$1").replace(/<@[!&]?\d+>/g, "").replace(/<#\d+>/g, "");
  // Links nur auf erlaubte Hosts
  t = t.replace(/\bhttps?:\/\/[^\s<>()]+/gi, (url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return policy.allowedHosts.some((h) => host === h || host.endsWith(`.${h}`)) ? url : "[Link entfernt]";
    } catch {
      return "[Link entfernt]";
    }
  });
  t = t.replace(/\b(discord\.gg|discord(app)?\.com\/invite)\/[\w-]+/gi, (m) =>
    policy.allowedHosts.some((h) => m.toLowerCase().includes(h)) ? m : "[Einladung entfernt]",
  );
  t = t.trim();
  if (t.length > policy.maxChars) t = t.slice(0, policy.maxChars - 1).trimEnd() + "…";
  return t;
}

/** Erkennt, ob die Ausgabe größere Teile des System-Prompts enthält. */
export function leaksPrompt(output: string, ...secrets: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const out = norm(output);
  for (const secret of secrets) {
    const parts = norm(secret)
      .split(/(?<=[.!?:])\s+|\n/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 40);
    if (parts.some((p) => out.includes(p.slice(0, 60)))) return true;
  }
  return false;
}

/** Anrede/Gruß am Anfang und Ende entfernen (das System ergänzt beides selbst). */
export function stripGreetings(text: string): string {
  return text
    // Nur Gruß + höchstens ein Name, danach Satzzeichen – nie den eigentlichen Satz
    .replace(/^\s*(moin( moin)?|hallo|hi|hey|servus|guten (tag|morgen|abend))(\s+[\p{L}\p{N}_.-]{1,24})?\s*[!,.]\s*/iu, "")
    .replace(/\n+\s*(viele|liebe|beste|freundliche) gr(u|ü)(ß|ss)e[\s\S]{0,60}$/i, "")
    .replace(/\n+\s*(gru(ß|ss)|moin|dein nordverkehr-team|euer nordverkehr-team)[^\n]{0,40}$/i, "")
    .trim();
}
