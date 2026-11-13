/** Beschriftungen der Ideen-Sammlung – ohne Server-Abhängigkeiten (auch im Browser nutzbar). */
import type { SuggestionKind, SuggestionStatus } from "@prisma/client";

export const KIND_LABEL: Record<SuggestionKind, string> = { IDEA: "Idee", FEEDBACK: "Feedback", BUG: "Fehler" };
export const KIND_EMOJI: Record<SuggestionKind, string> = { IDEA: "💡", FEEDBACK: "💬", BUG: "🐞" };
export const KIND_HINT: Record<SuggestionKind, string> = {
  IDEA: "Was fehlt dir im Portal oder auf dem Discord? Was würde dir oder dem Team helfen?",
  FEEDBACK: "Was läuft gut, was nervt? Ehrlich und gern konkret.",
  BUG: "Was ist passiert, was hättest du erwartet? Je genauer, desto schneller finden wir es.",
};

export const STATUS_LABEL: Record<SuggestionStatus, string> = {
  NEW: "Neu",
  REVIEWING: "Wird geprüft",
  PLANNED: "Geplant",
  DONE: "Umgesetzt",
  DECLINED: "Nicht geplant",
};
export const STATUS_TONE: Record<SuggestionStatus, "muted" | "info" | "warn" | "success" | "danger"> = {
  NEW: "muted",
  REVIEWING: "info",
  PLANNED: "warn",
  DONE: "success",
  DECLINED: "danger",
};
/** Reihenfolge in Auswahl und Filter */
export const STATUSES: SuggestionStatus[] = ["NEW", "REVIEWING", "PLANNED", "DONE", "DECLINED"];
export const OPEN_STATUSES: SuggestionStatus[] = ["NEW", "REVIEWING", "PLANNED"];
