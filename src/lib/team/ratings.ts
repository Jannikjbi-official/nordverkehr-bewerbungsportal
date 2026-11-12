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
export type Scores = Partial<Record<string, number>>;

/** Ein Kriterium des Bewertungsbogens (Standard oder pro Stelle). */
export interface Criterion {
  key: string;
  label: string;
  hint: string;
}

export const STANDARD_CRITERIA: readonly Criterion[] = RATING_CRITERIA;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

/**
 * Kriterien einer Stelle: eigene Zeilen „Kriterium | Hinweis“ oder der Standard.
 * Der Schlüssel hängt am Text (`p_<slug>`) – umbenennen beginnt das Kriterium neu.
 */
export function criteriaFor(position: { ratingCriteria?: string[] | null } | null | undefined): readonly Criterion[] {
  const lines = position?.ratingCriteria ?? [];
  const out: Criterion[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const [label, ...hint] = line.split("|");
    const l = label.trim().slice(0, 80);
    const key = `p_${slug(l)}`;
    if (!l || key === "p_" || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: l, hint: hint.join("|").trim().slice(0, 120) });
    if (out.length >= 10) break;
  }
  return out.length ? out : STANDARD_CRITERIA;
}

/** Nur bekannte Kriterien mit ganzen Punkten 1–5 übernehmen. */
export function cleanScores(input: unknown, criteria: readonly Criterion[] = STANDARD_CRITERIA): Scores {
  const keys = new Set(criteria.map((c) => c.key));
  const out: Scores = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (keys.has(k) && typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) out[k] = v;
  }
  return out;
}

export interface RatingSummary {
  /** Anzahl Teammitglieder mit mindestens einem Punkt */
  raters: number;
  perCriterion: Record<string, { avg: number | null; count: number }>;
  /** Durchschnitt über alle vergebenen Punkte */
  overall: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeRatings(ratings: { scores: unknown }[], criteria: readonly Criterion[] = STANDARD_CRITERIA): RatingSummary {
  const perCriterion: RatingSummary["perCriterion"] = Object.fromEntries(criteria.map((c) => [c.key, { avg: null, count: 0 }]));
  const sums: Record<string, number> = {};
  let total = 0;
  let n = 0;
  let raters = 0;
  for (const r of ratings) {
    const sc = cleanScores(r.scores, criteria);
    const entries = Object.entries(sc);
    if (entries.length) raters++;
    for (const [k, v] of entries) {
      sums[k] = (sums[k] ?? 0) + v!;
      perCriterion[k].count++;
      total += v!;
      n++;
    }
  }
  for (const c of criteria) {
    const pc = perCriterion[c.key];
    pc.avg = pc.count ? round1(sums[c.key] / pc.count) : null;
  }
  return { raters, perCriterion, overall: n ? round1(total / n) : null };
}

export const formatScore = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
