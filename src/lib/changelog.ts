/**
 * Changelog des Bewerbungsportals – neueste Einträge zuerst.
 *
 * Bei JEDER Änderung am Portal hier einen Eintrag ergänzen (eindeutige `id`,
 * nie umbenennen – sonst wird er erneut gepostet). Neue Einträge erscheinen im
 * Team-Bereich (/team/changelog) und werden nach dem Deployment genau einmal
 * in den Changelog-Kanal auf Discord gepostet.
 *
 * Stil: kurze Punkte, vorne ein fettes Stichwort („**Claimen** – …“).
 * Details gehören nicht hierher.
 */
export type ChangeKind = "neu" | "besser" | "fix";

export interface ChangelogItem {
  kind: ChangeKind;
  /** Discord-Markdown erlaubt (**fett**) */
  text: string;
}

export interface ChangelogEntry {
  /** Eindeutig und unveränderlich – daran wird erkannt, ob schon gepostet wurde */
  id: string;
  /** ISO-Datum (YYYY-MM-DD) */
  date: string;
  title: string;
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

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-11-11-reset",
    date: "2026-11-11",
    title: "Daten zurücksetzen",
    items: [
      { kind: "neu", text: "**Gefahrenzone** – Admins können in den Einstellungen alle Bewerbungen löschen, mit eingetipptem Bestätigungssatz. Konten, Positionen, Fragen und Einstellungen bleiben." },
      { kind: "besser", text: "**Mobil** – alle Seiten auf Handy-Breite geprüft, nichts läuft über." },
    ],
  },
  {
    id: "2026-11-11-hilfe",
    date: "2026-11-11",
    title: "Hilfe & Begriffe",
    items: [
      { kind: "neu", text: "**Hilfe & Begriffe** – neue Seite im Team-Bereich: Status, Claimen, Hinweise, KI-Kategorien, Manipulationsversuch, Zustellstatus, Sperren und mehr kurz erklärt, mit Suche." },
      { kind: "neu", text: "**„Was heißt das?“** – kleine Links direkt an Hinweisen, Status und Knöpfen führen zur passenden Erklärung." },
    ],
  },
  {
    id: "2026-11-11-claim-betreff",
    date: "2026-11-11",
    title: "Claimen sichtbarer, Betreff aus Bausteinen",
    items: [
      { kind: "besser", text: "**Claimen** – direkt oben in jeder Bewerbung statt versteckt in der Seitenleiste." },
      { kind: "neu", text: "**Betreff aus Baustein** – der erste gewählte Baustein setzt den Betreff der DM." },
    ],
  },
  {
    id: "2026-11-11-discord-design",
    date: "2026-11-11",
    title: "Aufgeräumte Discord-Posts",
    items: [
      { kind: "besser", text: "**Changelog** – sortiert nach Neu, Verbessert und Behoben, kurze Punkte statt Textblock." },
      { kind: "besser", text: "**Bot-Nachrichten** – ruhigeres Layout, Profilbild nur dort, wo eine Person schreibt." },
    ],
  },
  {
    id: "2026-11-11-fachfragen",
    date: "2026-11-11",
    title: "Mehr Fachfragen",
    items: [
      { kind: "neu", text: "**Support** – Fehlersuche bei SaltyChat, wann ein Ticket weitergeht, TeamSpeak & SaltyChat." },
      { kind: "neu", text: "**Moderator** – Verstöße dokumentieren, Entscheidungen erklären, nicht unnötig eingreifen." },
      { kind: "neu", text: "**Eventteam** – Event vorbereiten, Chaos am Eventabend, Feedback & Kritik." },
    ],
  },
  {
    id: "2026-11-11-team-workflow",
    date: "2026-11-11",
    title: "Claimen, Discord-Kanäle & mehr",
    items: [
      { kind: "neu", text: "**Claimen** – sehen, wer eine Bewerbung betreut. Übernehmen und Freigeben per Klick." },
      { kind: "neu", text: "**Absender wählen** – Nachrichten mit eigenem Namen oder als Nordverkehr-Team." },
      { kind: "neu", text: "**Discord-Kanäle** – neue Bewerbungen, Bot-Logs und Changelog getrennt." },
      { kind: "neu", text: "**Changelog** – im Team-Bereich und hier im Kanal." },
      { kind: "besser", text: "**Zurückziehen** – vor der Bearbeitung ohne Grund, danach mit kurzem Grund. Rückfragen bis 14 Tage." },
      { kind: "besser", text: "**Chat** – Discord-Profilbilder, Kennzeichnung als Admin oder Team." },
      { kind: "besser", text: "**Discord** – alle Bot-Nachrichten im Components-V2-Layout." },
      { kind: "besser", text: "**Diagnose** – Testnachricht pro Kanal in den Einstellungen." },
      { kind: "fix", text: "**Sperren & Zähler** – griffen bei manchen Einträgen nicht." },
    ],
  },
  {
    id: "2026-11-11-fragen",
    date: "2026-11-11",
    title: "Fragen bereinigt",
    items: [
      { kind: "besser", text: "**Keine Doppelungen** – Basisfragen gibt es einmal, pro Stelle nur Fachfragen." },
      { kind: "neu", text: "**Vorausfüllen** – Basisantworten werden bei der nächsten Bewerbung übernommen." },
      { kind: "neu", text: "**Formular-Builder** – eindeutige Keys, Warnung bei ähnlichen Fragen." },
      { kind: "besser", text: "**Fachfragen** statt „Support // Support“, einheitliche Szenario-Kennzeichnung." },
      { kind: "fix", text: "**Duplikate** zusammengeführt – keine Antwort ging verloren." },
    ],
  },
  {
    id: "2026-11-11-start",
    date: "2026-11-11",
    title: "Bewerbungsportal gestartet",
    items: [
      { kind: "neu", text: "**Login mit Discord** – Team-Bereich mit Team-Rolle, Admin-Funktionen mit Admin-Rolle." },
      { kind: "neu", text: "**Bewerben in Schritten** – automatisch gespeichert, Bestätigung per DM, Status im Dashboard." },
      { kind: "neu", text: "**Team-Bereich** – Tabelle & Board, Abstimmung, Kommentare, Bausteine, Statistiken, Audit-Log." },
    ],
  },
];
