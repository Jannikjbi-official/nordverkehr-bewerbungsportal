/**
 * Bewerberprofil: Antworten auf allgemeine Fragen werden per Fragen-Key
 * gespeichert und bei der nächsten Bewerbung vorausgefüllt. Rein (ohne DB).
 */
import { validateAnswer, validateSection, type AnswerMap, type AnswerValue, type FormSectionDef } from "@/lib/applications/form";

export type ProfileAnswers = Record<string, AnswerValue>;

const isEmpty = (v: AnswerValue | undefined) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Allgemeine Fragen mit Key, die sich für die Wiederverwendung eignen (keine Bilder). */
function reusableQuestions(sections: FormSectionDef[]) {
  return sections.filter((s) => s.general).flatMap((s) => s.questions.filter((q) => q.key && q.type !== "FILE"));
}

/** Antworten der allgemeinen Fragen als { key: Wert } – zum Speichern im Profil. */
export function profileAnswersFrom(sections: FormSectionDef[], answers: AnswerMap): ProfileAnswers {
  const out: ProfileAnswers = {};
  for (const q of reusableQuestions(sections)) {
    const v = answers[q.id];
    if (!isEmpty(v)) out[q.key!] = v as AnswerValue;
  }
  return out;
}

/**
 * Füllt leere allgemeine Antworten aus dem Profil vor. Werte, die zur aktuellen
 * Frage nicht mehr passen (z. B. gelöschte Auswahloption), werden übersprungen.
 */
export function prefillFromProfile(sections: FormSectionDef[], data: AnswerMap, profile: ProfileAnswers): { data: AnswerMap; prefilled: string[] } {
  const next: AnswerMap = { ...data };
  const prefilled: string[] = [];
  for (const q of reusableQuestions(sections)) {
    if (!isEmpty(next[q.id])) continue;
    const v = profile[q.key!];
    if (isEmpty(v) || validateAnswer(q, v) !== null) continue;
    next[q.id] = v;
    prefilled.push(q.id);
  }
  return { data: next, prefilled };
}

/** Sind alle allgemeinen Abschnitte gültig beantwortet? */
export function generalComplete(sections: FormSectionDef[], data: AnswerMap) {
  const general = sections.filter((s) => s.general);
  return general.length > 0 && general.every((s) => Object.keys(validateSection(s, data)).length === 0);
}

/**
 * Neues Profil nach dem Absenden: Werte der allgemeinen Fragen dieses Formulars
 * ersetzen die alten (auch geleerte), Keys anderer Fragen bleiben erhalten.
 */
export function mergeProfile(sections: FormSectionDef[], previous: ProfileAnswers, answers: AnswerMap): ProfileAnswers {
  const merged: ProfileAnswers = { ...previous };
  for (const q of reusableQuestions(sections)) delete merged[q.key!];
  return { ...merged, ...profileAnswersFrom(sections, answers) };
}
