/** KI-Kategorien (beschreibend, kein Ranking). Rein – auch im Browser nutzbar. */
export const TAGS = {
  vollstaendig: "Vollständig",
  luecken: "Lückenhaft",
  rueckfrage: "Rückfrage nötig",
  erfahren: "Viel Erfahrung",
  einsteiger: "Einsteiger",
  viel_zeit: "Viel Zeit",
  wenig_zeit: "Wenig Zeit",
  generisch: "Wirkt generisch",
  manipulation: "Manipulationsversuch",
} as const;
export type TagKey = keyof typeof TAGS;
export const TAG_KEYS = Object.keys(TAGS) as TagKey[];
/** Diese Tags darf die KI vergeben ("manipulation" setzt nur der Schutzfilter). */
export const AI_TAGS = TAG_KEYS.filter((t) => t !== "manipulation");

export function tagLabel(t: string) {
  return (TAGS as Record<string, string>)[t] ?? t;
}
