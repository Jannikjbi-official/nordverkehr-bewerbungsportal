/**
 * Bewertungsbogen: Jedes Teammitglied vergibt pro Kriterium 1–5 Punkte
 * (einzelne Kriterien dürfen offen bleiben). Angezeigt wird der Durchschnitt
 * pro Kriterium und insgesamt – als Orientierung, die Entscheidung bleibt beim Team.
 */
export const RATING_CRITERIA = [
  { key: "kommunikation", label: "Kommunikation & Auftreten", hint: "Klar, freundlich, verständlich?" },
  { key: "erfahrung", label: "Erfahrung & Wissen", hint: "Kennt sich aus, passende Vorerfahrung?" },
  { key: "szenarien", label: "Umgang mit Szenarien", hint: "Ruhig, fair, regelkonform gelöst?" },
  { key: "motivation", label: "Motivation", hint: "Will wirklich mitmachen, nicht nur den Rang?" },
  { key: "zeit", label: "Verfügbarkeit", hint: "Hat realistisch genug Zeit?" },
  { key: "teamfit", label: "Passt ins Team", hint: "Ton, Haltung, Zusammenarbeit" },
] as const;

export type CriterionKey = (typeof RATING_CRITERIA)[number]["key"];
export type Scores = Partial<Record<CriterionKey, number>>;

const KEYS = new Set<string>(RATING_CRITERIA.map((c) => c.key));

/** Nur bekannte Kriterien mit ganzen Punkten 1–5 übernehmen. */
export function cleanScores(input: unknown): Scores {
  const out: Scores = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (KEYS.has(k) && typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) out[k as CriterionKey] = v;
  }
  return out;
}

export interface RatingSummary {
  /** Anzahl Teammitglieder mit mindestens einem Punkt */
  raters: number;
  perCriterion: Record<CriterionKey, { avg: number | null; count: number }>;
  /** Durchschnitt über alle vergebenen Punkte */
  overall: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeRatings(ratings: { scores: unknown }[]): RatingSummary {
  const perCriterion = Object.fromEntries(RATING_CRITERIA.map((c) => [c.key, { avg: null, count: 0 }])) as RatingSummary["perCriterion"];
  const sums: Record<string, number> = {};
  let total = 0;
  let n = 0;
  let raters = 0;
  for (const r of ratings) {
    const s = cleanScores(r.scores);
    const entries = Object.entries(s);
    if (entries.length) raters++;
    for (const [k, v] of entries) {
      sums[k] = (sums[k] ?? 0) + v!;
      perCriterion[k as CriterionKey].count++;
      total += v!;
      n++;
    }
  }
  for (const c of RATING_CRITERIA) {
    const pc = perCriterion[c.key];
    pc.avg = pc.count ? round1(sums[c.key] / pc.count) : null;
  }
  return { raters, perCriterion, overall: n ? round1(total / n) : null };
}

export const formatScore = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
