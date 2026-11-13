/**
 * Hilfe & Begriffe für das Team (/team/hilfe). Jeder Begriff hat eine feste
 * `id` – auf die verlinken die „Was heißt das?“-Links im Team-Bereich
 * (`/team/hilfe#<id>`). Neue Funktion → hier einen Eintrag ergänzen.
 *
 * Bezeichnungen aus dem Code (Status, KI-Kategorien, Zustellstatus,
 * Platzhalter) werden direkt übernommen, damit Hilfe und Oberfläche gleich heißen.
 */
import { STATUS_LABEL } from "@/lib/applications/status";
import { TAGS } from "@/lib/ai/tags";
import { PLACEHOLDERS } from "@/lib/messages/placeholders";

export interface HelpTerm {
  id: string;
  term: string;
  /** Ein Satz für die eingeklappte Ansicht (ohne Angabe: erster Satz von `text`) */
  short?: string;
  /** Erklärtext (Discord-Markdown: **fett**) */
  text: string;
  /** Optionale Liste (Begriff → Erklärung) */
  list?: { label: string; text: string }[];
}

export interface HelpSection {
  id: string;
  title: string;
  terms: HelpTerm[];
}

export const DELIVERY_HELP: { label: string; text: string }[] = [
  { label: "Wird zugestellt", text: "Liegt in der Warteschlange und geht gleich raus." },
  { label: "Per DM zugestellt", text: "Discord hat die DM angenommen." },
  { label: "DMs deaktiviert", text: "Der Bewerber lässt keine DMs zu (oder ist nicht auf dem Server). Die Nachricht steht trotzdem im Portal." },
  { label: "DM fehlgeschlagen", text: "Discord hat abgelehnt – „Erneut senden“ probieren, sonst in den Einstellungen die Zustellung prüfen." },
  { label: "Nur im Portal", text: "Wurde nicht per DM verschickt, der Bewerber sieht sie im Dashboard." },
];

const TAG_HELP: Record<keyof typeof TAGS, string> = {
  vollstaendig: "Alle Fragen sinnvoll beantwortet.",
  luecken: "Einige Antworten fehlen oder sind sehr knapp.",
  rueckfrage: "Etwas ist unklar – lohnt eine Nachfrage.",
  erfahren: "Bringt viel passende Erfahrung mit.",
  einsteiger: "Wenig Vorerfahrung – nicht schlecht, nur zur Einordnung.",
  viel_zeit: "Gibt viel verfügbare Zeit an.",
  wenig_zeit: "Gibt wenig verfügbare Zeit an.",
  generisch: "Antworten klingen austauschbar oder wie aus einer Vorlage.",
  manipulation: "Setzt nur der Schutzfilter, nie die KI selbst – siehe „Manipulationsversuch“.",
};

export const HELP: HelpSection[] = [
  {
    id: "ablauf",
    title: "Ablauf & Status",
    terms: [
      {
        id: "phase-2",
        term: "Phase 2: Bewerbungsgespräch",
        short: "Ins Gespräch geht es erst ab 3 Sternen im Team-Schnitt.",
        text: "Phase 1 ist die schriftliche Bewerbung, **Phase 2 das Bewerbungsgespräch**. Dorthin kommt eine Bewerbung nur mit einem Team-Schnitt von mindestens **3 Sternen** im Bewertungsbogen – ohne Bewertung oder darunter ist „Gespräch“ gesperrt (Status, Kanban und Termin setzen). Admins ändern die Grenze unter Einstellungen → Gesprächstermine, 0 schaltet sie ab.",
      },
      {
        id: "status",
        term: "Status einer Bewerbung",
        text: "Der Status zeigt, wo eine Bewerbung steht. Bewerber sehen ihn in ihrem Dashboard – mit einer kurzen Erklärung.",
        list: [
          { label: STATUS_LABEL.SUBMITTED, text: "Ist angekommen, noch niemand hat sie angefasst. Der Bewerber kann ohne Grund zurückziehen." },
          { label: STATUS_LABEL.IN_REVIEW, text: "Das Team liest und bewertet. Ab hier geht Zurückziehen nur noch mit kurzem Grund." },
          { label: STATUS_LABEL.INTERVIEW, text: "Einladung zum Gespräch. Den Termin trägst du unter „Gesprächstermin“ ein, er landet im Platzhalter {termin}." },
          { label: STATUS_LABEL.ACCEPTED, text: "Endgültig. Ist es eingestellt, vergibt der Bot automatisch die Discord-Rolle der Position." },
          { label: STATUS_LABEL.REJECTED, text: "Endgültig. Danach gilt die Sperrfrist, bis sich die Person für dieselbe Position erneut bewerben kann." },
          { label: STATUS_LABEL.WITHDRAWN, text: "Hat der Bewerber selbst zurückgezogen." },
          { label: STATUS_LABEL.DRAFT, text: "Noch nicht abgeschickt – das Team sieht Entwürfe nicht." },
        ],
      },
      {
        id: "bewerbungs-id",
        term: "Bewerbungs-ID",
        text: "Die Nummer einer Bewerbung, z. B. **NV-2026-0042**. Sie steht in jeder DM – damit lässt sich eine Bewerbung im Support schnell finden.",
      },
      {
        id: "rueckzug",
        term: "Zurückziehen während der Bearbeitung",
        text: "Wird eine Bewerbung schon bearbeitet (in Prüfung, im Gespräch oder geclaimt) und der Bewerber zieht zurück, muss er kurz begründen. Die Bewerbung erscheint dann oben im Team-Dashboard. **14 Tage** lang könnt ihr noch nachfragen und der Bewerber kann antworten – die KI antwortet in dieser Zeit nicht. Ist alles geklärt, klickt **„Rückzug bestätigen“**: Der Bewerber bekommt eine kurze Bestätigung (Portal + DM), die Bewerbung verschwindet aus dem Dashboard und Rückfragen sind beendet.",
      },
      {
        id: "fragen",
        term: "Basisfragen & Fachfragen",
        text: "**Basisfragen** (Über dich, Erfahrung & Motivation) beantworten alle einmal – bei der nächsten Bewerbung werden sie vorausgefüllt. **Fachfragen** und **Szenarien** gibt es pro Stelle, passend zu ihren Aufgaben. Admins pflegen beides unter „Positionen & Fragen“; der Builder warnt, wenn eine Frage schon ähnlich existiert.",
      },
    ],
  },
  {
    id: "bearbeiten",
    title: "Bearbeiten & Schreiben",
    terms: [
      {
        id: "claimen",
        term: "Claimen",
        text: "Wer eine Bewerbung **claimt**, betreut sie – die anderen sehen oben in der Bewerbung und in der Liste („Betreut von“), wer dran ist. **Übernehmen** kann jedes Teammitglied, **Freigeben** nur wer geclaimt hat oder ein Admin. Alles landet im Bot-Log. Passiert nach dem Claim ein paar Tage nichts (Standard 3), bekommt der Betreuer einmal eine **Erinnerung per DM**.",
      },
      {
        id: "absender",
        term: "Senden als ich / als Team",
        text: "Beim Schreiben wählst du, wer in der DM oben steht: **du** (Name und Profilbild) oder **Nordverkehr-Team**. Wer geclaimt hat, schreibt standardmäßig persönlich. Intern sieht das Team immer, wer geschrieben hat („als Team gesendet“).",
      },
      {
        id: "bausteine",
        term: "Bausteine & Betreff",
        text: "Bausteine sind fertige Textstücke nach Kategorie, die sich kombinieren lassen. Der **erste gewählte Baustein setzt den Betreff** der DM; hast du den Betreff selbst geändert, bleibt er. Pflege unter „Nachrichtenbausteine“.",
      },
      {
        id: "platzhalter",
        term: "Platzhalter",
        text: "Werden beim Senden automatisch ersetzt – im Text und im Betreff. Fehlt ein Wert, warnt die Vorschau vorher.",
        list: PLACEHOLDERS.map((p) => ({ label: `{${p.key}}`, text: p.label })),
      },
      {
        id: "abstimmung",
        term: "Abstimmung",
        text: "Pro, Contra oder Enthaltung – nur intern als Meinungsbild. Die Abstimmung entscheidet nichts automatisch, den Status setzt immer ein Mensch.",
      },
      {
        id: "bewertungsbogen",
        term: "Bewertungsbogen",
        text: "Jedes Teammitglied vergibt pro Kriterium 1–5 Sterne (Kommunikation, Erfahrung, Szenarien, Motivation, Verfügbarkeit, Teamfit). Ein Kriterium darf offen bleiben, ein zweiter Klick auf denselben Stern nimmt ihn zurück. Oben steht der **Schnitt des Teams**, unten der Schnitt jedes Einzelnen. Ist die KI aktiv, steht neben jedem Kriterium außerdem ein blaues **„KI 4“** – Maus drüber zeigt die Begründung, unter „KI-Einschätzung“ stehen alle Gründe und ein kurzes Fazit. Die KI-Punkte zählen **nicht** zum Team-Schnitt und gibt es nur für Bewerbungen ab dem 12.11.2026 (Einwilligung). Findet der Schutzfilter einen Manipulationsversuch, vergibt die KI keine Punkte. Admins können pro Stelle **eigene Kriterien** festlegen (Positionen → Stelle → „Eigener Bewertungsbogen“) – dann gibt es keine KI-Punkte. Alle Punkte sind eine Orientierung – entschieden wird im Gespräch und in der Abstimmung.",
      },
      {
        id: "gespraech",
        term: "Gesprächsprotokoll & Nachfragen",
        short: "Fragen fürs Gespräch auf Discord zum Abhaken, Notizen und Vorschläge aus der Bewerbung.",
        text: "Ab Phase 2 hat die Bewerbung den Reiter **Gespräch**: Fragen der Stelle zum Abhaken, Notizen pro Frage und ein Gesamtfazit. Darüber stehen **Nachfragen aus der Bewerbung** – knappe Antworten und falsch beantwortete Quizfragen. Mit **+** landen sie als eigene Frage im Protokoll.",
      },
      {
        id: "vergleichen",
        term: "Bewerbungen vergleichen",
        short: "Zwei oder drei Bewerbungen derselben Stelle nebeneinander.",
        text: "Oben in der Bewerbung über **Vergleichen** eine andere laufende Bewerbung derselben Stelle wählen. Die Ansicht zeigt Antwort für Antwort nebeneinander, dazu Sterne, Abstimmung, Quiz und Hinweise. Bis zu drei Bewerbungen gehen gleichzeitig.",
      },
      {
        id: "stummschalten",
        term: "Stummschalten",
        short: "Neue Antworten eines Bewerbers für eine Weile ohne Bot-Log.",
        text: "Rechts unter dem Status: **Neue Antworten stumm für** 1 Std., 8 Std., 24 Std. oder 3 Tage. Solange gibt es zu neuen Bewerber-Nachrichten keine Zeile im Bot-Log – im Portal steht trotzdem alles. „aufheben“ beendet es sofort.",
      },
      {
        id: "termine",
        term: "Gesprächstermine",
        text: "Unter **Termine** legt das Team freie Zeiten an (z. B. Donnerstag ab 19 Uhr, 4 × 30 Minuten). Steht eine Bewerbung auf „Gespräch“ und hat noch keinen festen Termin, sucht sich der Bewerber im Portal selbst einen aus – umbuchen geht bis 12 Stunden vorher. Am Tag des Gesprächs bekommt er morgens eine Erinnerung per DM. Trägst du in der Bewerbung selbst eine Uhrzeit ein, gilt die – ein gebuchter Termin wird dann wieder frei. Geht die Bewerbung aus dem Status „Gespräch“ raus, wird ihr künftiger Termin ebenfalls frei. Bewerber können selbst **absagen** – mit „Ich kann nicht“ in der Erinnerungs-DM oder im Portal; der Termin wird frei, das Bot-Log meldet es.",
      },
      {
        id: "einarbeitung",
        term: "Einarbeitung & Probezeit",
        text: "Bei angenommenen Bewerbungen erscheint rechts eine **Checkliste** (Regelwerk, Discord-Rolle, Team-Kanäle …) – wer etwas erledigt, hakt es ab, Name und Datum werden gespeichert. Mit der Annahme startet außerdem die **Probezeit** (Standard 14 Tage, das Ende lässt sich pro Person ändern). Endet sie in den nächsten Tagen, steht die Person in der Team-Übersicht im Teamchat. Die Punkte der Checkliste und die Länge der Probezeit stellen Admins in den Einstellungen ein. Am Ende entscheidet die Leitung: **Bestanden**, **+14 Tage** oder **Beenden** (Rollen und Präfix werden entfernt). Optional bekommt die Person einen **Paten**, der nach zwei Wochen kurz Rückmeldung gibt. Alle Teammitglieder stehen im **Team-Verzeichnis**.",
      },
      {
        id: "feedback",
        term: "Feedback der Bewerber",
        text: "Nach der Entscheidung können Bewerber freiwillig 1–5 Sterne und einen Kommentar zum Ablauf abgeben. Das Feedback steht in der Bewerbung und gesammelt unter „Statistiken“ – es fließt nicht in Entscheidungen ein.",
      },
      {
        id: "kommentare",
        term: "Kommentare & Notizen",
        text: "**Kommentare** gehören zu einer Bewerbung, **Notizen** zu einer Person (unter „Nutzer & Sperren“). Beides ist intern. Fordert ein Bewerber seine Daten an, sind sie im Export enthalten – ohne den Namen des Teammitglieds. Also sachlich formulieren.",
      },
    ],
  },
  {
    id: "hinweise",
    title: "Hinweise & KI",
    terms: [
      {
        id: "automatische-hinweise",
        term: "Automatische Hinweise (keine Bewertung)",
        text: "Das Portal markiert Auffälligkeiten, damit ihr genauer hinschaut. Es sind **Hinweise, keine Wertung** – niemand wird deswegen automatisch abgelehnt.",
        list: [
          { label: "Viele sehr kurze Antworten", text: "Viele Textantworten liegen deutlich unter der erwarteten Länge." },
          { label: "Identische Antwort", text: "Derselbe Text steht bei mehreren Fragen." },
          { label: "Sehr ähnlich zu Bewerbung …", text: "Starke Übereinstimmung mit einer anderen Bewerbung – evtl. kopiert." },
          { label: "Junger Discord-Account", text: "Der Discord-Account ist jünger als in den Einstellungen festgelegt." },
          { label: "Nicht zum Gespräch erschienen", text: "Ab dem zweiten verpassten Termin (Knopf „Nicht erschienen“ in der Bewerbung)." },
          { label: "Auf dem Discord gebannt", text: "Die Person hat den Server per Bann verlassen – der Bot schreibt ihr dann keine „tritt wieder bei“-Nachricht." },
          {
            label: "Name möglicherweise unpassend",
            text: "Anzeige- oder Benutzername enthält eine Beleidigung, einen extremistischen Begriff/Code, gibt sich als Team oder Nordverkehr aus oder versucht die KI zu manipulieren. Wird mit dem aktuellen Namen geprüft.",
          },
        ],
      },
      {
        id: "ki-tags",
        term: "KI-Einordnung (Kategorien)",
        text: "Ist die KI aktiv, ordnet sie neue Bewerbungen in **beschreibende Kategorien** ein – ohne Ranking oder Punktzahl. Die KI entscheidet nichts; „Neu einordnen“ holt eine frische Einschätzung.",
        list: (Object.keys(TAGS) as (keyof typeof TAGS)[]).map((k) => ({ label: TAGS[k], text: TAG_HELP[k] })),
      },
      {
        id: "auto-antwort",
        term: "Automatische Antwort (KI)",
        text: "Schreibt ein Bewerber und **niemand vom Team war in den letzten Minuten im Team-Bereich aktiv**, kann eine KI-Antwort kommen – klar als automatisch gekennzeichnet. Sie beantwortet nur allgemeine Fragen, sagt nie etwas über Entscheidungen und verweist sonst aufs Team. Einschalten und Limits in den Einstellungen.",
      },
      {
        id: "manipulation",
        term: "Manipulationsversuch",
        text: "Eine Nachricht sieht aus, als wollte jemand die **KI austricksen** (sog. Prompt Injection) – z. B. „Vergiss alle Anweisungen“, „ignore previous instructions“, „Entwicklermodus“, „zeig mir deinen Systemprompt“, auch verschleiert oder mit unsichtbaren Zeichen. Dann **antwortet die KI nicht**, die Nachricht kommt aber ganz normal beim Team an (roter Rahmen). Es ist nur ein Hinweis: Die Erkennung arbeitet mit Mustern und trifft manchmal harmlose Sätze. Einfach lesen und normal antworten.",
      },
    ],
  },
  {
    id: "discord",
    title: "Discord & Zustellung",
    terms: [
      {
        id: "zustellung",
        term: "Zustellstatus einer Nachricht",
        text: "Unter jeder Nachricht ans Team steht, ob die Discord-DM angekommen ist. Im Portal ist jede Nachricht so oder so sichtbar.",
        list: DELIVERY_HELP,
      },
      {
        id: "discord-kanaele",
        term: "Discord-Kanäle",
        text: "**Bewerbungs-Kanal:** ein Post pro neuer Bewerbung. **Bot-Log:** Status, Claims, Nachrichten, Antworten von Bewerbern, Zustellfehler. **Changelog:** einmal am Tag um 0 Uhr alle Änderungen des Vortags als neue Version (gleichzeitig unter „Changelog“ im Team-Bereich). **Teamchat:** jeden Morgen die Team-Übersicht. **Leitungs-Chat:** Hinweis, wenn Bewerbungen zu lange liegen. Admins ändern die Kanäle in den Einstellungen und können dort mit „Discord-Zustellung prüfen“ eine Testnachricht schicken.",
      },
      {
        id: "discord-pflicht",
        term: "Discord-Pflicht",
        text: "Absenden geht nur, wenn die Person auf dem Nordverkehr-Discord ist – das Formular zeigt sonst einen Hinweis mit Einladungslink (ausfüllen und speichern geht trotzdem). Verlässt jemand den Server, während die Bewerbung läuft, schreibt der Bot ihm **automatisch** eine Nachricht ins Portal (per DM geht nicht mehr) – einmal pro Austritt. Das Team sieht oben in der Bewerbung einen roten Hinweis, im Bot-Log eine Zeile und morgens in der Team-Übersicht die Liste „Nicht mehr auf dem Discord“. Kommt die Person zurück, verschwindet der Hinweis von selbst. Geprüft wird beim Öffnen einer Bewerbung, im Hintergrund höchstens alle 15 Minuten, wenn jemand das Team-Dashboard öffnet, nachts und morgens per Cron – Admins können unter Admin-Bereich → Discord → „Bewerber auf dem Discord prüfen“ sofort alle prüfen.",
      },
      {
        id: "discord-knoepfe",
        term: "Übernehmen in Discord",
        text: "An jeder neuen Bewerbung im Bewerbungs-Kanal hängt (wenn eingeschaltet) der Knopf **📌 Übernehmen**. Wer die Team-Rolle hat und schon einmal im Portal eingeloggt war, claimt die Bewerbung damit direkt – die Antwort sieht nur er selbst. Betreut schon jemand die Bewerbung, sagt der Bot wer; übernehmen geht dann nur im Portal. Einmalig einrichten: Admin-Bereich → Discord → „Knopf ‚Übernehmen‘ einrichten“.",
      },
      {
        id: "sprachkanal",
        term: "Sprachkanal, Warteraum & Vorbereitung",
        short: "Gesprächskanal und Warteraum eintragen – der Bot erkennt, wer wann da ist.",
        text: "Unter Einstellungen → Gesprächstermine: **Sprachkanal fürs Gespräch** (Server-Event hängt daran) und **Warteraum**. Mit laufendem Worker steht in der Bewerbung, wann der Bewerber im Gesprächskanal war; fehlt er 10 Minuten nach Beginn, kommt „Nicht erschienen?“. Kommt er am Gesprächstag in den Warteraum, bekommt der Betreuer eine DM. Bewerber finden unter /gespraech eine kurze Vorbereitung.",
      },
      {
        id: "antworten-discord",
        term: "Antworten & Status aus Discord",
        short: "Knöpfe „Antworten“, „In Prüfung“ und „Zum Gespräch“ direkt in Discord.",
        text: "Am Bot-Log „Neue Antwort von …“ öffnet **Antworten** ein Fenster – der Text geht als deine Nachricht per DM und ins Portal. An neuen Bewerbungen im Bewerbungs-Kanal setzen **In Prüfung** und **Zum Gespräch** den Status (Zuständigkeit und 3-Sterne-Hürde gelten). Juniors können die Knöpfe nicht nutzen.",
      },
      {
        id: "befehle",
        term: "Discord-Befehle",
        short: "/bewerbung für Bewerber, /offen und /claim fürs Team.",
        text: "**/bewerbung** zeigt Bewerbern ihren Stand. **/offen** listet dir die offenen Bewerbungen deiner Stellen, **/claim id:12** (oder NV-2026-0012) übernimmt eine. Antworten sieht nur, wer den Befehl nutzt. Einmalig einrichten: Admin-Bereich → Discord → „Befehle registrieren“.",
      },
      {
        id: "annahme-automatik",
        term: "Annahme: Rollen, Präfix, Willkommen",
        short: "Bei Annahme vergibt der Bot Rollen, setzt ein Namens-Präfix und grüßt im Teamchat.",
        text: "Ist „Rolle bei Annahme vergeben“ an, bekommt die Person die Rolle der Stelle plus die **zusätzlichen Rollen** aus den Einstellungen. Hat die Stelle ein **Namens-Präfix** (z. B. „[Support]“), steht es danach vor dem Server-Namen. Ist ein Kanal eingetragen, postet der Bot einen **Willkommensgruß**. Wird die Annahme zurückgenommen, nimmt der Bot Rollen und Präfix wieder weg.",
      },
      {
        id: "freie-plaetze",
        term: "Freie Plätze",
        short: "Jede Annahme belegt einen Platz – bei 0 schließt die Stelle.",
        text: "Pro Stelle lassen sich **freie Plätze** eintragen. Jede Annahme zieht einen ab, eine zurückgenommene Annahme gibt ihn zurück. Bei 0 schließt die Stelle automatisch und öffnet erst wieder, wenn du Plätze erhöhst. Bewerber sehen „Noch 2 Plätze frei“.",
      },
      {
        id: "stellen-automatisch",
        term: "Stellen automatisch öffnen & schließen",
        text: "Pro Stelle lassen sich ein **Startdatum**, ein **Enddatum** und eine **Höchstzahl** an Bewerbungen eintragen. Der Bot prüft die Daten jede Nacht um 0 Uhr; ist die Höchstzahl erreicht, schließt die Stelle sofort nach der letzten Bewerbung. Bei jeder Öffnung bekommen alle eine DM, die „Bei neuen Stellen benachrichtigen“ eingeschaltet haben – und der Stellenaufruf im Discord aktualisiert sich selbst.",
      },
      {
        id: "team-uebersicht",
        term: "Team-Übersicht",
        text: "Jeden Morgen gegen 8 Uhr postet der Bot in den Teamchat, was ansteht: **Gespräche heute**, Bewerbungen, bei denen der Bewerber zuletzt geschrieben hat (**wartet auf Antwort**), Bewerbungen, bei denen das Team seit ein paar Tagen nichts gemacht hat (**liegengeblieben** – kein Statuswechsel, keine Nachricht, kein Kommentar) und **noch nicht bestätigte Rückzüge**. Liegt etwas länger als eine Woche, bekommt der Leitungs-Chat einen kurzen Hinweis. Ist nichts zu tun, kommt kein Post. Die Tage stellen Admins in den Einstellungen ein.",
      },
      {
        id: "stellenaufruf",
        term: "Stellenaufruf",
        text: "Der Post „Wir suchen neue Teammitglieder!“ im Discord wird aus den Positionen erzeugt: offene Stellen mit Beschreibung und Aufgaben, gemeinsame Voraussetzungen, Statusübersicht der offenen Stellen (geschlossene tauchen nicht auf) und Knöpfe zur Bewerbung. Ändert ein Admin eine Position, **bearbeitet** der Bot den Post automatisch – es kommt kein neuer. Zusätzlich gibt es **Einzelaufrufe** „Wir suchen …!“ pro Stelle in einem eigenen Kanal. Posten, aktualisieren und Vorschau unter „Positionen & Fragen“.",
      },
      {
        id: "bestaetigung",
        term: "Bestätigungs-DM",
        text: "Geht direkt nach dem Absenden an den Bewerber. Hat er DMs zu, erscheint oben in der Bewerbung „Bestätigungs-DM konnte nicht zugestellt werden“ – er sieht alles trotzdem im Portal.",
      },
    ],
  },
  {
    id: "regeln",
    title: "Regeln & Daten",
    terms: [
      {
        id: "sperre",
        term: "Sperre",
        text: "Unter „Nutzer & Sperren“ kann eine Person befristet oder dauerhaft gesperrt werden. Gesperrte können sich nicht bewerben; eine Begründung ist Pflicht und bleibt intern.",
      },
      {
        id: "sperrfrist",
        term: "Sperrfrist nach Ablehnung",
        text: "So viele Tage nach einer Ablehnung kann sich jemand nicht erneut auf **dieselbe** Position bewerben. Standard in den Einstellungen, pro Position anpassbar. In Nachrichten: {sperrfrist_tage} (z. B. „45 Tage“) und {sperrfrist} (Datum, ab dem es wieder geht) – die Absage-Bausteine nutzen beide.",
      },
      {
        id: "mindestalter",
        term: "Mindestalter",
        text: "Team-Bewerbungen ab 18 Jahren (pro Position anpassbar). Jüngere können das Formular nicht abschicken.",
      },
      {
        id: "loeschfristen",
        term: "Löschfristen",
        text: "Alte Entwürfe, zurückgezogene, abgelehnte und angenommene Bewerbungen werden nach den Fristen aus den Einstellungen automatisch gelöscht – auch der Audit-Log. Steht so in den Datenschutzhinweisen.",
      },
      {
        id: "daten-zuruecksetzen",
        term: "Daten zurücksetzen",
        text: "Nur für Admins, unten in den Einstellungen („Gefahrenzone“). Löscht **alle Bewerbungen** samt Antworten, Bildern, Nachrichten, Abstimmungen, Kommentaren und gemerkten Basisantworten – zum Bestätigen muss ein Satz eingetippt werden. Konten, Positionen, Fragen, Bausteine, Einstellungen, Sperren und Notizen bleiben. Wird im Audit-Log und Bot-Log festgehalten. **Nicht umkehrbar.**",
      },
      {
        id: "audit",
        term: "Audit-Log",
        text: "Protokoll, wer wann was im Portal gemacht hat (Status, Nachrichten, Claims, Einstellungen …). Für Nachvollziehbarkeit, nicht zur Kontrolle einzelner.",
      },
      {
        id: "rechte",
        term: "Junior-Team & Abwesenheit",
        short: "Juniors lesen und bewerten nur; Abwesende bekommen nichts Neues.",
        text: "Admins tragen **Junior-Rollen** ein: diese Teammitglieder lesen, kommentieren, bewerten und stimmen ab, ändern aber keinen Status, claimen nicht und schreiben Bewerbern nicht. Unter **Konto** trägt jedes Teammitglied eine **Abwesenheit** ein – dann keine Zuteilung, keine Erinnerungen, und in der Übersicht steht „abwesend“. Bewerber können im Dashboard melden, dass sie eine Weile nicht erreichbar sind; Rückfrage-Fristen warten dann.",
      },
      {
        id: "runden",
        term: "Bewerbungsrunden",
        short: "Zeitraum mit Ziel – Eingänge, Annahmen und Dauer auf einen Blick.",
        text: "Unter **Bewerbungsrunden** legen Admins z. B. „Support-Runde Dezember, Ziel 3“ an. Gezählt werden alle Bewerbungen, die im Zeitraum eingegangen sind (ohne Testbewerbungen), mit Annahmen, Absagen, offenen und der Dauer bis zur Entscheidung.",
      },
      {
        id: "team-aktivitaet",
        term: "Team-Aktivität & Datensicherung",
        short: "Für Admins: wer was gemacht hat und alle Bewerbungen als Datei.",
        text: "Unter **Statistiken** sehen Admins pro Teammitglied Übernahmen, Nachrichten, Entscheidungen und wie schnell die erste Antwort kam – als Orientierung, kein Ranking. Im Admin-Bereich lädt **Bewerbungsdaten sichern** alle Bewerbungen samt Antworten und Nachrichten herunter (enthält personenbezogene Daten, steht im Audit-Log).",
      },
    ],
  },
];

export const HELP_IDS = HELP.flatMap((s) => s.terms.map((t) => t.id));
