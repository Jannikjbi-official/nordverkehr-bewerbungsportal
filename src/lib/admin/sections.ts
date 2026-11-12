/**
 * Admin-Bereich: Unterseiten mit kurzer und ausführlicher Beschreibung.
 * Reihenfolge = Navigation.
 */
export const ADMIN_SECTIONS = [
  {
    key: "discord",
    label: "Discord",
    short: "Kanäle, Bot-Funktionen, Knöpfe und Zustellung prüfen.",
    intro:
      "Hier legst du fest, in welche Kanäle der Bot schreibt (Stellenaufrufe, neue Bewerbungen, Bot-Log, Changelog, Teamchat, Leitung) und welche Bot-Funktionen aktiv sind: Knopf „Übernehmen“, Thread pro Bewerbung, automatische Rolle bei Annahme. Oben kannst du jeden Kanal mit einer Testnachricht prüfen, ausstehende Zustellungen anstoßen und den Befehl /bewerbung registrieren. Kanal leer lassen = diese Posts sind aus.",
  },
  {
    key: "bewerbungen",
    label: "Bewerbungen & Ablauf",
    short: "Regeln, Bestätigungstext, Einarbeitung, Gesprächsprotokoll.",
    intro:
      "Allgemeine Regeln für alle Stellen (Mindestalter, Sperrfrist, Spam-Schutz), der Text der automatischen Bestätigung nach dem Absenden, die Checkliste für die Einarbeitung samt Probezeit und die Standard-Fragen fürs Gesprächsprotokoll. Stellen, Formularfragen, Quizfragen und stellenspezifische Vorlagen bearbeitest du unter „Positionen & Fragen“.",
  },
  {
    key: "zustellung",
    label: "Zustellung & Nachtruhe",
    short: "Team-Übersicht, Erinnerungen und was nachts wartet.",
    intro:
      "Was der Bot morgens ans Team schickt (Team-Übersicht, Hinweis an die Leitung, persönliche Morgen-DM), wann er an Liegengebliebenes erinnert und wie sich das Portal in der Nachtruhe verhält: Der Bot antwortet Bewerbern, und du entscheidest pro Nachrichtenart, ob sie nachts sofort rausgeht oder bis morgens wartet. Wichtiges (Bot-Log, Infos, Nachrichten vom Team) geht standardmäßig immer sofort raus.",
  },
  {
    key: "ki",
    label: "KI",
    short: "Claude: Modelle, Budget, Einordnung, Punkte, Auto-Antwort.",
    intro:
      "Die KI schreibt nur Entwürfe, Einordnungen und Einschätzungen – sie entscheidet und sendet nie selbst etwas im Namen des Teams. Hier stellst du Modelle, Monatsbudget und Limits ein, ob neue Bewerbungen automatisch eingeordnet und bepunktet werden und wie die Auto-Antwort an Bewerber arbeitet (tagsüber, wenn niemand online ist; nachts siehe „Zustellung & Nachtruhe“).",
  },
  {
    key: "daten",
    label: "Daten & Tests",
    short: "Löschfristen, Testbewerbungen, Daten zurücksetzen.",
    intro:
      "Wie lange Bewerbungen und das Audit-Log gespeichert bleiben, bevor sie automatisch gelöscht werden. Darunter kannst du Testbewerbungen für jede Stelle und jedes Szenario anlegen (keine echten Bewerber, keine DMs) und wieder löschen – und ganz unten alle Bewerbungen zurücksetzen.",
  },
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number]["key"];
export const adminSection = (key: string) => ADMIN_SECTIONS.find((s) => s.key === key) ?? null;
