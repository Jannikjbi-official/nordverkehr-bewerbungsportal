/**
 * Absagegründe als feste Kategorien – damit sich in den Statistiken zählen lässt,
 * woran Bewerbungen am häufigsten scheitern (Stellenbeschreibungen nachschärfen).
 * Gewählt beim Statuswechsel auf „Abgelehnt“, nur intern sichtbar.
 */
export const REJECTION_CATEGORIES = [
  { key: "ZEIT", label: "Zu wenig Zeit / Verfügbarkeit" },
  { key: "ERFAHRUNG", label: "Zu wenig Erfahrung" },
  { key: "ALTER", label: "Alter / Mindestalter" },
  { key: "VERHALTEN", label: "Verhalten / Vorgeschichte" },
  { key: "QUALITAET", label: "Bewerbung zu knapp / Qualität" },
  { key: "GESPRAECH", label: "Gespräch nicht überzeugend" },
  { key: "PASSUNG", label: "Passt nicht ins Team" },
  { key: "KAPAZITAET", label: "Stelle schon besetzt" },
  { key: "SONSTIGES", label: "Sonstiges" },
] as const;

export type RejectionCategory = (typeof REJECTION_CATEGORIES)[number]["key"];
export const REJECTION_KEYS = REJECTION_CATEGORIES.map((c) => c.key) as [RejectionCategory, ...RejectionCategory[]];
export const REJECTION_LABEL = Object.fromEntries(REJECTION_CATEGORIES.map((c) => [c.key, c.label])) as Record<RejectionCategory, string>;

export const isRejectionCategory = (v: unknown): v is RejectionCategory => typeof v === "string" && (REJECTION_KEYS as string[]).includes(v);

export interface RejectionStats {
  total: number;
  /** Ohne gewählte Kategorie (z. B. Absagen vor Einführung) */
  uncategorized: number;
  /** Absteigend nach Anzahl, nur Kategorien mit Treffern */
  byCategory: { key: RejectionCategory; label: string; count: number }[];
  /** Pro Stelle: Anzahl je Kategorie */
  byPosition: { positionId: string; total: number; counts: Partial<Record<RejectionCategory, number>> }[];
}

export function aggregateRejections(apps: { status: string; positionId: string; rejectionCategory: string | null }[]): RejectionStats {
  const rejected = apps.filter((a) => a.status === "REJECTED");
  const counts = new Map<RejectionCategory, number>();
  const perPos = new Map<string, { total: number; counts: Partial<Record<RejectionCategory, number>> }>();
  let uncategorized = 0;
  for (const a of rejected) {
    const p = perPos.get(a.positionId) ?? { total: 0, counts: {} };
    p.total++;
    perPos.set(a.positionId, p);
    if (!isRejectionCategory(a.rejectionCategory)) {
      uncategorized++;
      continue;
    }
    counts.set(a.rejectionCategory, (counts.get(a.rejectionCategory) ?? 0) + 1);
    p.counts[a.rejectionCategory] = (p.counts[a.rejectionCategory] ?? 0) + 1;
  }
  return {
    total: rejected.length,
    uncategorized,
    byCategory: REJECTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: counts.get(c.key) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count),
    byPosition: [...perPos.entries()].map(([positionId, v]) => ({ positionId, ...v })).sort((a, b) => b.total - a.total),
  };
}
