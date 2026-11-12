/**
 * Changelog des Bewerbungsportals – ein Eintrag pro Tag, neueste zuerst.
 *
 * Ablauf:
 *  - Alles, was an einem Tag geändert wird, kommt in DEN Eintrag dieses Tages.
 *  - Jeder Tag bekommt eine Version: 1.0 (Start), danach 1.1, 1.2, …
 *  - Veröffentlicht wird ein Tag um 0 Uhr (Europe/Berlin) des Folgetags:
 *    ab dann auf der Website sichtbar und per Cron einmal auf Discord gepostet.
 *    Der laufende Tag ist noch nicht öffentlich.
 *
 * Stil: kurze Punkte, vorne ein fettes Stichwort („**Claimen** – …“).
 * Die `id` nie ändern – daran wird erkannt, ob schon gepostet wurde.
 */
export type ChangeKind = "neu" | "besser" | "fix";

export interface ChangelogItem {
  kind: ChangeKind;
  /** Discord-Markdown erlaubt (**fett**) */
  text: string;
}

export interface ChangelogEntry {
  /** Eindeutig und unveränderlich, z. B. "v1.0" */
  id: string;
  /** Versionsnummer ohne "v" */
  version: string;
  /** Tag der Änderungen, ISO (YYYY-MM-DD) */
  date: string;
  /** Optionaler Untertitel */
  title?: string;
  items: ChangelogItem[];
}

export const CHANGE_GROUPS: { kind: ChangeKind; label: string; emoji: string }[] = [
  { kind: "neu", label: "Neu", emoji: "✨" },
  { kind: "besser", label: "Verbessert", emoji: "🛠️" },
  { kind: "fix", label: "Behoben", emoji: "🐛" },
];

/** Punkte eines Eintrags nach Art gruppiert (leere Gruppen fallen weg). */
export function groupItems(items: ChangelogItem[]) {
  return CHANGE_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.kind === g.kind) })).filter((g) => g.items.length > 0);
}

/** Heutiges Datum in Deutschland als YYYY-MM-DD. */
export function todayBerlin(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Veröffentlicht = der Tag ist vorbei (ab 0 Uhr deutscher Zeit am Folgetag). */
export function isPublished(entry: Pick<ChangelogEntry, "date">, now = new Date()) {
  return entry.date < todayBerlin(now);
}

export function publishedEntries(now = new Date()) {
  return CHANGELOG.filter((e) => isPublished(e, now));
}

export const versionLabel = (e: Pick<ChangelogEntry, "version">) => `Version ${e.version}`;

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "v1.1",
    version: "1.1",
    date: "2026-11-12",
    items: [
      {
        kind: "neu",
        text: "**Team-Übersicht** – jeden Morgen im Teamchat: Gespräche heute, unbeantwortete Nachrichten, liegengebliebene Bewerbungen und offene Rückzüge. Liegt etwas über eine Woche, bekommt die Leitung einen Hinweis.",
      },
      { kind: "besser", text: "**Bestätigungen** – eigene Abfrage-Fenster im Nordverkehr-Stil statt der grauen Browser-Boxen, mit rotem Knopf bei Löschen, Sperren & Co." },
    ],
  },
  {
    id: "v1.0",
    version: "1.0",
    date: "2026-11-11",
    title: "Das Bewerbungsportal ist da",
    items: [
      { kind: "neu", text: "**Bewerben in Schritten** – Login mit Discord, automatisches Speichern, Bestätigung per DM, Status im Dashboard." },
      { kind: "neu", text: "**Basis- & Fachfragen** – Basisfragen einmal für alle, pro Stelle eigene Fachfragen. Basisantworten werden beim nächsten Mal vorausgefüllt." },
      { kind: "neu", text: "**Szenarien pro Stelle** – jede Stelle hat eigene, passende Situationen statt für alle die gleichen." },
      { kind: "neu", text: "**Team-Bereich** – Tabelle & Board, Abstimmung, Kommentare, Notizen, Sperren, Statistiken, Audit-Log." },
      { kind: "neu", text: "**Claimen** – oben in jeder Bewerbung sehen, wer sie betreut. Übernehmen und Freigeben per Klick." },
      { kind: "neu", text: "**Nachrichten** – Bausteine mit Platzhaltern, Betreff aus dem Baustein, senden als du oder als Team." },
      { kind: "neu", text: "**Discord** – Bewerbungs-Kanal, Bot-Logs und Changelog, alle Bot-Nachrichten im Components-V2-Layout." },
      { kind: "neu", text: "**Zurückziehen** – vor der Bearbeitung ohne Grund, danach mit kurzem Grund und 14 Tagen für Rückfragen. Das Team bestätigt den Rückzug per Knopf." },
      { kind: "neu", text: "**KI (optional)** – Einordnung in Kategorien und Auto-Antwort, wenn niemand online ist – mit Schutz vor Manipulation." },
      { kind: "neu", text: "**Hilfe & Begriffe** – alle Begriffe erklärt, „Was heißt das?“-Links direkt an Hinweisen und Knöpfen." },
      { kind: "neu", text: "**Gefahrenzone** – Admins können alle Bewerbungen löschen, mit eingetipptem Bestätigungssatz." },
      { kind: "besser", text: "**Website** – zeigt nur noch offene Stellen. Geschlossene sind über alte Links weiter erreichbar, mit Hinweis." },
      { kind: "neu", text: "**Eigene Auswahlmenüs** – überall im Nordverkehr-Stil statt Browser-Dropdowns, voll per Tastatur bedienbar." },
      { kind: "neu", text: "**Stellenaufrufe** – „Wir suchen neue Teammitglieder!“ und Einzelaufrufe pro Stelle im Discord, automatisch aus den Positionen erzeugt und bei Änderungen aktualisiert." },
      { kind: "neu", text: "**Changelog** – jeden Tag um 0 Uhr eine neue Version im Team-Bereich und auf Discord. Admins sehen den laufenden Tag vorab als Vorschau." },
    ],
  },
];
