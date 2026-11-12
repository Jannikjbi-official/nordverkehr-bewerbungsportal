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
      { kind: "neu", text: "**Bewertungsbogen** – pro Kriterium 1–5 Sterne (Kommunikation, Erfahrung, Szenarien, Motivation, Verfügbarkeit, Teamfit), mit Schnitt des Teams." },
      { kind: "neu", text: "**Discord-Pflicht** – absenden nur mit Mitgliedschaft auf dem Discord. Verlässt jemand den Server während der Bewerbung, schreibt ihm der Bot automatisch im Portal, das Team sieht es in der Bewerbung und in der Team-Übersicht." },
      { kind: "besser", text: "**Live-Aktualisierung** – neue Nachrichten, Status, Kommentare und Bewertungen erscheinen von selbst, ohne die Seite neu zu laden." },
      { kind: "besser", text: "**Schnellere Nachrichten** – DMs und Bot-Logs gehen sofort und gleichzeitig raus, der Zustellstatus steht direkt nach dem Senden." },
      { kind: "besser", text: "**Sperrfristen pro Stelle** – Support & Eventteam 30 Tage, Media & Mapper 45, Entwickler & Moderator 60. Steht auf jeder Stellenseite und in den Absage-Bausteinen ({sperrfrist_tage} und {sperrfrist})." },
      { kind: "neu", text: "**KI-Punkte** – die KI bewertet neue Bewerbungen nach denselben Kriterien, mit Begründung. Getrennt vom Team-Schnitt, entscheiden tut das Team." },
      { kind: "neu", text: "**Gesprächstermine** – das Team legt freie Zeiten an, Bewerber buchen selbst und bekommen am Tag morgens eine Erinnerung per DM." },
      { kind: "neu", text: "**Übernehmen in Discord** – Knopf 📌 an neuen Bewerbungen im Bewerbungs-Kanal." },
      { kind: "neu", text: "**Stellen automatisch öffnen & schließen** – nach Datum oder Höchstzahl an Bewerbungen. Wer möchte, bekommt bei neuen Stellen eine DM." },
      { kind: "neu", text: "**Einarbeitung** – Checkliste und Probezeit für neue Teammitglieder, Ende der Probezeit steht in der Team-Übersicht." },
      { kind: "neu", text: "**Feedback** – Bewerber bewerten nach der Entscheidung den Ablauf, gesammelt unter Statistiken." },
      { kind: "neu", text: "**PDF** – Druckansicht jeder Bewerbung, mit oder ohne interne Infos." },
      {
        kind: "neu",
        text: "**Team-Übersicht** – jeden Morgen im Teamchat: Gespräche heute, unbeantwortete Nachrichten, liegengebliebene Bewerbungen und offene Rückzüge. Liegt etwas über eine Woche, bekommt die Leitung einen Hinweis.",
      },
      { kind: "besser", text: "**Bestätigungen** – eigene Abfrage-Fenster im Nordverkehr-Stil statt der grauen Browser-Boxen, mit rotem Knopf bei Löschen, Sperren & Co." },
      { kind: "neu", text: "**/bewerbung in Discord** – Bewerber sehen ihren Stand direkt in Discord, nur für sie sichtbar." },
      { kind: "neu", text: "**Erinnerung an Entwürfe** – wer einen angefangenen Entwurf liegen lässt, bekommt einmal eine DM mit Link zum Weitermachen." },
      { kind: "neu", text: "**Morgen-DM für Betreuer** – wer Bewerbungen geclaimt hat, bekommt morgens kurz seine offenen Punkte (abschaltbar unter „Konto“)." },
      { kind: "neu", text: "**Thread pro Bewerbung** – auf Wunsch startet der Bot im Bewerbungs-Kanal einen Thread zum Diskutieren, Kommentare aus dem Portal landen dort mit." },
      { kind: "neu", text: "**Suche in Antworten** – z. B. „Wer hat schon mal Moderation gemacht?“, mit hervorgehobenen Ausschnitten." },
      { kind: "neu", text: "**Absagegründe** – beim Ablehnen eine Kategorie wählen, die Statistik zeigt pro Stelle, woran es am häufigsten scheitert." },
      { kind: "neu", text: "**Regel-Quiz** – Quizfragen mit einer richtigen Antwort, das Team sieht direkt „8 von 10 richtig“. Die Lösungen bleiben auf dem Server." },
      { kind: "neu", text: "**Gesprächsprotokoll** – Fragen zum Abhaken und Notizen pro Frage im Reiter „Gespräch“, mit Gesamtfazit und in der PDF." },
      { kind: "fix", text: "**Termine** – ein zweites Gespräch zeigt nicht mehr den alten Termin, gerade gebuchte Termine können nicht versehentlich gelöscht werden, die Terminauswahl zeigt immer deutsche Zeit." },
      { kind: "fix", text: "**Stellen** – geplante Start-/Enddaten greifen nach einem Statuswechsel von Hand oder bei Höchstzahl nicht mehr ungewollt, Benachrichtigungen gehen an alle sofort raus." },
      { kind: "fix", text: "**Nachts & morgens** – Zustellung und Team-Übersicht kommen auch in der Sommerzeit pünktlich und vor den langsamen Prüfungen." },
      { kind: "fix", text: "**KI-Punkte** – keine doppelte Bewertung mehr, und „bewertet gerade …“ hängt nicht mehr, wenn das Budget aufgebraucht ist." },
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
