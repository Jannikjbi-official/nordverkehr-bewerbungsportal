/**
 * „Welche Stelle passt zu mir?“ – kurzer Selbsttest vor dem Bewerben.
 * Jede Antwort gibt Punkte für passende Stellen (per Slug). Rein, nichts wird gespeichert.
 */
export interface MatchQuestion {
  key: string;
  label: string;
  options: { label: string; points: Record<string, number> }[];
}

export const MATCH_QUESTIONS: MatchQuestion[] = [
  {
    key: "ort",
    label: "Wo bist du am liebsten unterwegs?",
    options: [
      { label: "Im Discord – Tickets, Fragen, Leuten helfen", points: { support: 3 } },
      { label: "Ingame – mitten im Geschehen", points: { moderator: 3, eventteam: 2 } },
      { label: "Hinter den Kulissen – bauen, basteln, gestalten", points: { entwickler: 2, mapper: 2, media: 2 } },
    ],
  },
  {
    key: "staerke",
    label: "Was liegt dir am meisten?",
    options: [
      { label: "Ruhig erklären, auch zum dritten Mal", points: { support: 3, moderator: 1 } },
      { label: "Fair durchgreifen, wenn es nötig ist", points: { moderator: 3 } },
      { label: "Etwas organisieren und Leute zusammenbringen", points: { eventteam: 3, support: 1 } },
      { label: "Kreativ sein – Bilder, Videos, Texte", points: { media: 3 } },
      { label: "Technik und Logik – Probleme lösen", points: { entwickler: 3, mapper: 1 } },
    ],
  },
  {
    key: "technik",
    label: "Welche Technik kannst du schon?",
    options: [
      { label: "Programmieren (z. B. Lua, JavaScript)", points: { entwickler: 3 } },
      { label: "Maps/3D (z. B. CodeWalker, Blender)", points: { mapper: 3 } },
      { label: "Grafik oder Videoschnitt", points: { media: 3 } },
      { label: "Nichts davon – ich bin eher für Menschen da", points: { support: 2, moderator: 1, eventteam: 1 } },
    ],
  },
  {
    key: "zeit",
    label: "Wie viel Zeit hast du pro Woche?",
    options: [
      { label: "Bis 5 Stunden", points: { media: 1, mapper: 1, entwickler: 1 } },
      { label: "5–10 Stunden", points: { support: 1, eventteam: 1, media: 1, mapper: 1, entwickler: 1 } },
      { label: "Mehr als 10 Stunden", points: { support: 2, moderator: 2, eventteam: 1 } },
    ],
  },
  {
    key: "stress",
    label: "Ein Spieler ist richtig sauer. Du …",
    options: [
      { label: "… hörst zu und suchst eine Lösung", points: { support: 2, moderator: 1 } },
      { label: "… klärst die Situation nach Regelwerk", points: { moderator: 2 } },
      { label: "… holst lieber jemanden dazu, das ist nicht so meins", points: { media: 1, mapper: 1, entwickler: 1 } },
    ],
  },
];

/** Stellen, die der Test kennt – alle anderen (neu angelegt) bekommen einen neutralen Punkt und erscheinen hinten. */
const KNOWN = new Set(MATCH_QUESTIONS.flatMap((q) => q.options.flatMap((o) => Object.keys(o.points))));

/** Punkte je Slug; Reihenfolge absteigend, nur Stellen mit Punkten. */
export function scorePositions(answers: Record<string, number>, slugs: string[]): { slug: string; points: number }[] {
  const score = new Map<string, number>(slugs.map((s) => [s, KNOWN.has(s) ? 0 : 1]));
  for (const q of MATCH_QUESTIONS) {
    const opt = q.options[answers[q.key]];
    if (!opt) continue;
    for (const [slug, p] of Object.entries(opt.points)) if (score.has(slug)) score.set(slug, score.get(slug)! + p);
  }
  return [...score.entries()]
    .map(([slug, points]) => ({ slug, points }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points);
}
