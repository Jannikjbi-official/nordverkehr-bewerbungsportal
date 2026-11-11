/**
 * Changelog des Bewerbungsportals – neueste Einträge zuerst.
 *
 * Bei JEDER Änderung am Portal hier einen Eintrag ergänzen (eindeutige `id`).
 * Neue Einträge erscheinen im Team-Bereich (/team/changelog) und werden nach
 * dem Deployment genau einmal in den Changelog-Kanal auf Discord gepostet.
 */
export interface ChangelogEntry {
  /** Eindeutig und unveränderlich – daran wird erkannt, ob schon gepostet wurde */
  id: string;
  /** ISO-Datum (YYYY-MM-DD) */
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-11-11-team-workflow",
    date: "2026-11-11",
    title: "Claimen, Discord-Kanäle, Components V2, Rückzug & Changelog",
    items: [
      "Bewerbungen claimen: Wer eine Bewerbung betreut, steht in der Detailansicht und in der Liste („Betreut von“). Freigeben, Übernehmen per Klick.",
      "Beim Schreiben wählbar: als du selbst (Name + Profilbild in der Discord-DM) oder als „Nordverkehr-Team“. Wer geclaimt hat, schreibt standardmäßig persönlich.",
      "Chat-Verlauf zeigt Discord-Profilbilder und kennzeichnet Antworten als „Admin“ oder „Team“.",
      "Neue Bewerbungen landen im Bewerbungs-Kanal, alles andere (Status, Claims, Nachrichten, Antworten, Zustellfehler) im Bot-Log-Kanal. Kanäle in den Einstellungen änderbar.",
      "Zurückziehen: vor der Bearbeitung ohne Grund. Wird schon bearbeitet, fragt das Portal nach einem kurzen Grund – der Rückzug erscheint im Team-Dashboard, Rückfragen sind noch 14 Tage möglich.",
      "Alle Discord-Nachrichten des Bots (DMs, Bewerbungs-Kanal, Bot-Logs, Changelog) im neuen Discord-Layout (Components V2) – die Vorschau im Portal zeigt es genauso.",
      "Fehler behoben: Sperren, „ungelesen“-Zähler und das Aufräumen alter Uploads griffen bei manchen Einträgen nicht (MongoDB-Eigenheit bei leeren Feldern).",
      "Dieses Changelog: im Team-Bereich und automatisch im Changelog-Kanal.",
      "Einstellungen → „Discord-Zustellung prüfen“: Testnachricht pro Kanal mit genauer Fehlermeldung, Changelog erneut posten, Liste fehlgeschlagener Zustellungen.",
    ],
  },
  {
    id: "2026-11-11-fragen",
    date: "2026-11-11",
    title: "Fragen bereinigt",
    items: [
      "Allgemeine Fragen gibt es nur noch einmal, Positionen haben nur noch Fachfragen – keine doppelten Fragen mehr im Formular.",
      "„Support // Support“ heißt jetzt „Fachfragen“, Szenario-Fragen sind einheitlich gekennzeichnet.",
      "Allgemeine Antworten werden bei der nächsten Bewerbung vorausgefüllt („Deine Angaben“, mit Anpassen).",
      "Formular-Builder: eindeutige Keys pro Frage, Warnung bei gleichen oder sehr ähnlichen Fragen.",
      "Bestehende Duplikate wurden automatisch zusammengeführt – ohne dass Antworten verloren gehen.",
    ],
  },
  {
    id: "2026-11-11-start",
    date: "2026-11-11",
    title: "Bewerbungsportal gestartet",
    items: [
      "Login mit Discord, Team-Bereich nur mit Team-Rolle, Admin-Funktionen mit Admin-Rolle.",
      "Bewerbungsformular in Schritten mit automatischem Speichern, Status im Dashboard, Bestätigung per Discord-DM.",
      "Team-Bereich mit Tabelle und Board, Abstimmung, Kommentaren, Nachrichtenbausteinen, Statistiken und Audit-Log.",
    ],
  },
];
