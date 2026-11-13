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

/**
 * Wann ein Tag veröffentlicht wird (Admin-Bereich → Discord → Changelog):
 *  - `time` „00:00“ (Standard): wenn der Tag vorbei ist, also um 0 Uhr am Folgetag
 *  - andere Uhrzeit, z. B. „20:00“: am selben Tag um diese Uhrzeit (deutsche Zeit)
 *  - `through`: Admin hat „jetzt veröffentlichen“ gedrückt – alles bis zu diesem Tag ist sofort öffentlich
 */
export interface PublishRule {
  time: string;
  through: string;
}
export const DEFAULT_PUBLISH_RULE: PublishRule = { time: "00:00", through: "" };

function berlinMinutesNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function isPublished(entry: Pick<ChangelogEntry, "date">, now = new Date(), rule: PublishRule = DEFAULT_PUBLISH_RULE) {
  if (rule.through && entry.date <= rule.through) return true;
  const today = todayBerlin(now);
  if (entry.date < today) return true;
  if (entry.date > today || rule.time === "00:00") return false;
  const [h, m] = rule.time.split(":").map(Number);
  return berlinMinutesNow(now) >= h * 60 + m;
}

export function publishedEntries(now = new Date(), rule: PublishRule = DEFAULT_PUBLISH_RULE) {
  return CHANGELOG.filter((e) => isPublished(e, now, rule));
}

/** Für Hinweise: „heute um 20:00 Uhr“ bzw. „heute um Mitternacht“ */
export const publishTimeLabel = (rule: PublishRule) => (rule.time === "00:00" ? "um Mitternacht (nach Ende des Tages)" : `um ${rule.time} Uhr`);

export const versionLabel = (e: Pick<ChangelogEntry, "version">) => `Version ${e.version}`;

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "v1.3",
    version: "1.3",
    date: "2026-11-13",
    items: [
      { kind: "neu", text: "**Antworten aus Discord** – am Bot-Log „Neue Antwort von …“ hängt ein Knopf „Antworten“: Text eintippen, geht als deine Nachricht per DM und ins Portal." },
      { kind: "neu", text: "**Status per Knopf** – an neuen Bewerbungen im Bewerbungs-Kanal: „In Prüfung“ und „Zum Gespräch“ (3-Sterne-Hürde gilt auch hier)." },
      { kind: "neu", text: "**Sprachkanal-Erkennung** – mit laufendem Worker sieht das Team, wann der Bewerber im Gesprächskanal war; fehlt er 10 Minuten nach Beginn, kommt „Nicht erschienen?“." },
      { kind: "neu", text: "**Warteraum-Ping** – kommt ein Bewerber am Gesprächstag in den Warteraum, bekommt sein Betreuer eine DM." },
    ],
  },
  {
    id: "v1.2",
    version: "1.2",
    date: "2026-11-13",
    items: [
      { kind: "besser", text: "**Einarbeitung ohne TeamSpeak** – der Punkt „TeamSpeak-Rechte gesetzt“ entfällt, TeamSpeak ist nur noch fürs Ingame-Voice." },
      { kind: "besser", text: "**Gespräch im Sprachkanal** – Admins können einen Discord-Sprachkanal fürs Gespräch eintragen, das Server-Event hängt dann direkt daran. Bestehende Termine und Events zeigen jetzt Discord statt TeamSpeak." },
      { kind: "besser", text: "**Anforderungen** – Support und Moderator brauchen weiter TeamSpeak & SaltyChat fürs Ingame-Voice, Gespräch & Support laufen über Discord." },
      { kind: "fix", text: "**Richtigstellung zu 1.1** – bei einer Wiederbewerbung sehen Bewerber keinen Absagegrund (der ist intern), sondern einen Link zu ihrer alten Bewerbung und den Nachrichten von damals." },
    ],
  },
  {
    id: "v1.1",
    version: "1.1",
    date: "2026-11-12",
    items: [
      { kind: "besser", text: "**Gespräch auf Discord** – Bewerbungsgespräche und Support laufen über Discord, TeamSpeak & SaltyChat nur fürs Ingame-Voice. Stellenseite, Termine, Erinnerungen und Bausteine sind angepasst." },
      { kind: "besser", text: "**Ehrenamtlich** – Nordverkehr ist ein Hobby- und Community-Projekt: Auf jeder Stellenseite steht „derzeit keine Bezahlung“, beim Absenden wird es einmal bestätigt." },
      { kind: "neu", text: "**Phase 2 erst ab 3 Sternen** – ins Bewerbungsgespräch geht es nur mit einem Team-Schnitt von mindestens 3 Sternen im Bewertungsbogen. Grenze im Admin-Bereich einstellbar." },
      { kind: "neu", text: "**Gespräch absagen** – Bewerber sagen mit „Ich kann nicht“ direkt in der Erinnerungs-DM oder im Portal ab, das Team bekommt Bescheid." },
      { kind: "neu", text: "**/offen und /claim** – offene Bewerbungen deiner Stellen sehen und übernehmen, direkt in Discord." },
      { kind: "besser", text: "**Wiederbewerbung** – wer es nach einer Absage nochmal versucht, bekommt einen Hinweis mit Link zur alten Bewerbung und den Nachrichten von damals." },
      { kind: "besser", text: "**Einarbeitung sofort** – Haken in der Checkliste erscheinen ohne Wartezeit." },
      { kind: "neu", text: "**Bewertungsbogen pro Stelle** – Admins legen eigene Kriterien fest (z. B. Regelkenntnis), sonst gelten die Standard-Kriterien." },
      { kind: "neu", text: "**Freie Plätze** – jede Annahme belegt einen Platz, sind alle vergeben, schließt die Stelle automatisch. Bewerber sehen „Noch 2 Plätze frei“." },
      { kind: "neu", text: "**Annahme-Automatik** – zusätzliche Rollen, Namens-Präfix wie „[Support]“ und ein Willkommensgruß im Teamchat. Wird die Annahme zurückgenommen, verschwinden Rollen und Präfix wieder." },
      { kind: "neu", text: "**Claim-Erinnerung** – wer eine Bewerbung übernimmt und dann 3 Tage nichts macht, bekommt einmal eine DM." },
      { kind: "neu", text: "**Stummschalten** – neue Antworten eines Bewerbers für 1 Std. bis 3 Tage ohne Bot-Log, im Portal bleibt alles sichtbar." },
      { kind: "besser", text: "**Discord-Vorschau hell/dunkel** – sieh, wie die DM bei Bewerbern mit hellem Discord aussieht." },
      { kind: "neu", text: "**Team-Aktivität** (Admins) – unter Statistiken: pro Teammitglied Übernahmen, Nachrichten, Entscheidungen und wie schnell die erste Antwort kam." },
      { kind: "neu", text: "**Bewerbungsdaten sichern** (Admins) – alle Bewerbungen mit Antworten, Nachrichten und Bewertungen als Datei." },
      { kind: "neu", text: "**Vergleichen** – zwei oder drei Bewerbungen derselben Stelle nebeneinander, Antwort für Antwort, mit Sternen, Abstimmung und Quiz." },
      { kind: "besser", text: "**Gesprächsleitfaden** – schlägt Nachfragen zu knappen Antworten und falschen Quizfragen vor, mit einem Klick ins Protokoll." },
      { kind: "besser", text: "**Hilfe aufgeräumt** – Themen als Reiter, jeder Begriff erst mit einem Satz, Details per Klick. Neue Funktionen sind erklärt." },
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
      { kind: "neu", text: "**Testbewerbungen** – Admins legen pro Stelle Testbewerbungen mit realistischen Namen für typische Szenarien an (vorbildlich, knapp, beleidigend, Manipulationsversuch, kopiert, neuer Account, Grenzfall Alter, unpassender Name). Keine DMs, nicht in der Statistik, mit einem Klick wieder weg." },
      { kind: "neu", text: "**Nachtruhe** – von 22 bis 10 Uhr (für Admins einstellbar) antwortet der Bot auf Bewerber und sie sehen einen Hinweis. Wichtiges wie Bot-Logs, Infos und Nachrichten geht immer sofort raus; pro Nachrichtenart einstellbar, was bis morgens wartet." },
      { kind: "neu", text: "**Regel-Quiz für jede Stelle** – sechs passende Fragen pro Stelle (Support, Moderation, Entwicklung, Media, Mapping, Events), im Formularbaukasten anpassbar." },
      { kind: "neu", text: "**Du wirst betreut** – übernimmt jemand aus dem Team eine Bewerbung, erfährt der Bewerber per Portal und DM, wer sich kümmert." },
      { kind: "neu", text: "**Changelog steuern** – Admins legen fest, um wie viel Uhr der Changelog veröffentlicht wird, oder veröffentlichen ihn sofort." },
      { kind: "neu", text: "**Rückfrage mit Frist** – „Antwort erwartet“ beim Schreiben: Kommt nichts, erinnert der Bot den Bewerber, nach einer Woche schlägt das Portal vor, die Bewerbung zu schließen." },
      { kind: "neu", text: "**Gespräche** – auf Wunsch als Discord-Event, Erinnerungs-DM an den Betreuer kurz vorher, Kalender-Abo für jedes Teammitglied, Knopf „Nicht erschienen“." },
      { kind: "neu", text: "**Vier-Augen-Prinzip & Zuständigkeit** – pro Stelle: Annahme erst ab X Pro-Stimmen oder nur durch Admins; Bewerbungen nur für die zuständigen Discord-Rollen sichtbar." },
      { kind: "neu", text: "**Faire Verteilung** – Auslastung im Team-Dashboard, auf Wunsch automatische Zuteilung neuer Bewerbungen." },
      { kind: "neu", text: "**Für Bewerber** – Antworten nachreichen, bis jemand übernimmt; Position in der Warteschlange und aktuelle Bearbeitungszeit im Dashboard." },
      { kind: "neu", text: "**Für die Leitung** – Störungs-Alarm bei fehlgeschlagenen Zustellungen oder ausgefallenen Läufen, Wochenbericht montags, Sicherung aller Einstellungen als Datei." },
      { kind: "besser", text: "**Bann erkannt** – verlässt jemand den Discord per Bann, bekommt er keine „tritt wieder bei“-Nachricht, das Team sieht einen Hinweis." },
      { kind: "neu", text: "**Admin-Bereich** – alle Einstellungen aufgeteilt in Discord, Bewerbungen & Ablauf, Zustellung & Nachtruhe, KI sowie Daten & Tests, jeweils mit ausführlicher Erklärung und einer Übersicht mit Systemstatus." },
      { kind: "neu", text: "**Namens-Check** – unpassende Discord-Namen (Beleidigungen, extremistische Codes, „Admin“/„Support“/„Nordverkehr“ im Namen, Manipulationsversuche) erscheinen als Hinweis an der Bewerbung." },
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
