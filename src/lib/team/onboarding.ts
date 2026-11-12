/**
 * Einarbeitung nach der Annahme: Checkliste (Punkte aus den Einstellungen)
 * und Probezeit. Abgehakte Punkte liegen in `Application.onboarding`
 * als { [Punkt]: { at, by } } – benannt nach dem Text, damit spätere
 * Änderungen an der Liste alte Häkchen nicht verschieben.
 */
export interface OnboardingCheck {
  at: string;
  by: string;
}
export type OnboardingState = Record<string, OnboardingCheck>;

export function onboardingItems(setting: string) {
  return [...new Set(setting.split("\n").map((l) => l.trim()).filter(Boolean))].slice(0, 20);
}

export function readOnboarding(value: unknown): OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: OnboardingState = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v && typeof v === "object" && typeof (v as OnboardingCheck).at === "string") out[k] = { at: (v as OnboardingCheck).at, by: String((v as OnboardingCheck).by ?? "") };
  }
  return out;
}

export function onboardingProgress(items: string[], state: OnboardingState) {
  const done = items.filter((i) => state[i]).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}
