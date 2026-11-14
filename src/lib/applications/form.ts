/**
 * Formular-Definition und Validierung – identisch im Browser (Schritt-Prüfung)
 * und auf dem Server (verbindliche Prüfung beim Absenden).
 */
import { z } from "zod";
import { kindOf, type ConfirmationKey, type KindKey } from "@/lib/kinds";
export type { ConfirmationKey };
import type { QuestionType } from "@prisma/client";
import { RULES_URL } from "@/lib/public-urls";

export interface FormQuestion {
  id: string;
  /** Eindeutiger Schlüssel (z. B. "about_me") – null bei alten/eigenen Fragen ohne Key */
  key: string | null;
  label: string;
  helpText: string | null;
  placeholder: string | null;
  type: QuestionType;
  required: boolean;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  options: string[];
  /** Nur im Team-Formularbaukasten gesetzt (QUIZ) – Bewerber bekommen das Feld nie */
  correctOption?: string | null;
}

export interface FormSectionDef {
  id: string;
  key: string | null;
  /** Allgemeiner Abschnitt (für alle Positionen, Antworten werden wiederverwendet) */
  general: boolean;
  title: string;
  description: string | null;
  questions: FormQuestion[];
}

export type AnswerValue = string | number | boolean | string[] | null;
export type AnswerMap = Record<string, AnswerValue>;

export const MAX_FILES_PER_QUESTION = 5;
export const DEFAULT_MAX_LENGTH: Partial<Record<QuestionType, number>> = {
  SHORT_TEXT: 200,
  LONG_TEXT: 4000,
  SCENARIO: 4000,
  URL: 500,
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SHORT_TEXT: "Kurzer Text",
  LONG_TEXT: "Langer Text",
  NUMBER: "Zahl",
  SELECT: "Auswahl (eine)",
  MULTI_SELECT: "Auswahl (mehrere)",
  CHECKBOX: "Bestätigung (Häkchen)",
  URL: "Link",
  FILE: "Bilder hochladen",
  SCENARIO: "Szenario-Frage",
  QUIZ: "Quiz (eine richtige Antwort)",
};

function isEmpty(v: AnswerValue | undefined) {
  return (
    v === undefined ||
    v === null ||
    (typeof v === "string" && v.trim() === "") ||
    (Array.isArray(v) && v.length === 0) ||
    v === false
  );
}

/** Gibt eine deutsche Fehlermeldung zurück oder null. */
export function validateAnswer(q: FormQuestion, value: AnswerValue | undefined): string | null {
  if (isEmpty(value)) {
    if (!q.required) return null;
    return q.type === "CHECKBOX" ? "Bitte bestätigen." : "Das ist ein Pflichtfeld.";
  }

  switch (q.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "SCENARIO": {
      if (typeof value !== "string") return "Ungültige Eingabe.";
      const len = value.trim().length;
      const max = q.maxLength ?? DEFAULT_MAX_LENGTH[q.type]!;
      if (q.minLength && len < q.minLength) return `Bitte mindestens ${q.minLength} Zeichen (aktuell ${len}).`;
      if (len > max) return `Bitte höchstens ${max} Zeichen.`;
      return null;
    }
    case "NUMBER": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "Bitte eine Zahl eingeben.";
      if (q.minValue !== null && n < q.minValue) return `Mindestens ${q.minValue}.`;
      if (q.maxValue !== null && n > q.maxValue) return `Höchstens ${q.maxValue}.`;
      return null;
    }
    case "SELECT":
    case "QUIZ":
      return typeof value === "string" && q.options.includes(value) ? null : "Bitte eine Option wählen.";
    case "MULTI_SELECT": {
      if (!Array.isArray(value) || !value.every((v) => q.options.includes(v))) return "Ungültige Auswahl.";
      if (q.minValue !== null && value.length < q.minValue) return `Bitte mindestens ${q.minValue} auswählen.`;
      if (q.maxValue !== null && value.length > q.maxValue) return `Bitte höchstens ${q.maxValue} auswählen.`;
      return null;
    }
    case "CHECKBOX":
      return value === true ? null : "Bitte bestätigen.";
    case "URL": {
      if (typeof value !== "string") return "Ungültiger Link.";
      const parsed = z.url({ protocol: /^https?$/ }).safeParse(value.trim());
      if (!parsed.success) return "Bitte einen gültigen Link (https://…) angeben.";
      if (value.length > (q.maxLength ?? 500)) return "Der Link ist zu lang.";
      return null;
    }
    case "FILE": {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return "Ungültige Dateien.";
      if (value.length > MAX_FILES_PER_QUESTION) return `Höchstens ${MAX_FILES_PER_QUESTION} Bilder.`;
      return null;
    }
  }
}

export function validateSection(section: FormSectionDef, answers: AnswerMap): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of section.questions) {
    const err = validateAnswer(q, answers[q.id]);
    if (err) errors[q.id] = err;
  }
  return errors;
}

/** Normalisiert Werte (trim, Zahl) und verwirft unbekannte Keys. */
export function normalizeAnswers(sections: FormSectionDef[], answers: AnswerMap): AnswerMap {
  const out: AnswerMap = {};
  for (const s of sections) {
    for (const q of s.questions) {
      let v = answers[q.id];
      if (v === undefined) continue;
      if (typeof v === "string") v = v.trim();
      if (q.type === "NUMBER" && typeof v === "string" && v !== "") v = Number(v);
      out[q.id] = v;
    }
  }
  return out;
}

export function validateAll(sections: FormSectionDef[], answers: AnswerMap) {
  const errors: Record<string, string> = {};
  for (const s of sections) Object.assign(errors, validateSection(s, answers));
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Entwurfsdaten: nur grob prüfen (Größe, Typen), keine Pflichtfelder. */
export const draftDataSchema = z
  .record(
    z.string().max(40),
    z.union([z.string().max(10_000), z.number(), z.boolean(), z.array(z.string().max(500)).max(20), z.null()]),
  )
  .refine((r) => Object.keys(r).length <= 200, "Zu viele Felder.");

interface ConfirmationDef {
  key: ConfirmationKey;
  label: string;
  link?: { href: string; label: string };
}

const VOICE_LABEL: Record<KindKey, string> = {
  team: "Ich habe ein funktionierendes Mikrofon und bin für Gespräch und Support auf Discord erreichbar.",
  whitelist: "Ich habe ein funktionierendes Mikrofon – für das Whitelist-Gespräch auf Discord und im Spiel (Voice-Pflicht).",
  beta: "Ich habe ein funktionierendes Mikrofon und spiele mit Voice (Voice-Pflicht).",
};

const CONFIRMATION_DEFS: Record<Exclude<ConfirmationKey, "voice">, Omit<ConfirmationDef, "key">> = {
  rules: { label: "Ich habe das Regelwerk gelesen und halte mich daran.", link: { href: RULES_URL, label: "Regelwerk" } },
  unpaid: {
    label: "Mir ist klar, dass Nordverkehr ein Hobby- und Community-Projekt ist und die Mitarbeit im Team ehrenamtlich ist – derzeit gibt es keine Bezahlung.",
  },
  betaTest: {
    label: "Mir ist klar, dass die Beta ein Test ist: Fehler, Neustarts und zurückgesetzte Spielstände sind möglich – und ich melde Fehler, die mir auffallen.",
  },
  truth: { label: "Meine Angaben sind ehrlich und von mir selbst geschrieben." },
  privacy: {
    label: "Ich habe die Datenschutzhinweise gelesen und willige in die Verarbeitung meiner Bewerbungsdaten ein.",
    link: { href: "/datenschutz", label: "Datenschutzhinweise" },
  },
};

/** Bestätigungen im letzten Schritt – je nach Bewerbungsart. */
export function confirmationsFor(kind: string | null | undefined): ConfirmationDef[] {
  const k = kindOf(kind);
  return k.confirmations.map((key) => (key === "voice" ? { key, label: VOICE_LABEL[k.key] } : { key, ...CONFIRMATION_DEFS[key] }));
}

/** Alle bestätigten Punkte müssen `true` sein – welche, hängt von der Art ab. */
export function confirmationsSchemaFor(kind: string | null | undefined) {
  const shape = Object.fromEntries(kindOf(kind).confirmations.map((key) => [key, z.literal(true, { error: "Bitte bestätigen." })]));
  return z.object(shape);
}

/** Team-Bewerbung (Standard, für bestehende Aufrufe) */
export const CONFIRMATIONS = confirmationsFor("team");
export const confirmationsSchema = confirmationsSchemaFor("team");

/** v2: KI-Punkte im Bewertungsbogen (Datenschutzerklärung entsprechend ergänzt) */
/** v3: Datenschutzerklärung überarbeitet (KI-Text-Check wieder entfernt) */
export const CONSENT_VERSION = "2026-11-v3";
/** Ab dieser Einwilligung dürfen KI-Punkte vergeben werden */
export const AI_SCORE_CONSENT = "2026-11-v2";
export const allowsAiScore = (consentVersion: string | null | undefined) => !!consentVersion && consentVersion >= AI_SCORE_CONSENT;
/** KI-Punkte erlaubt: passende Einwilligung oder Admin-Freigabe (Zustimmung des Bewerbers) */
export const aiScoreAllowed = (app: { consentVersion: string | null; aiConsentOverrideAt?: Date | null }) => allowsAiScore(app.consentVersion) || !!app.aiConsentOverrideAt;


export function formatAnswerForDisplay(type: QuestionType, value: AnswerValue): string {
  if (value === null || value === undefined) return "–";
  if (type === "CHECKBOX") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** Quiz auswerten: richtige Antworten pro Frage-ID (Lösung kommt aus der DB, nie vom Browser). */
export function scoreQuiz(questions: { id: string; type: QuestionType }[], correct: Map<string, string | null>, answers: AnswerMap) {
  const quiz = questions.filter((q) => q.type === "QUIZ" && correct.get(q.id));
  const perQuestion = new Map<string, boolean>();
  for (const q of quiz) perQuestion.set(q.id, answers[q.id] === correct.get(q.id));
  return { total: quiz.length, correct: [...perQuestion.values()].filter(Boolean).length, perQuestion };
}
