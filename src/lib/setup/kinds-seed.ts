/**
 * Startinhalte für die Bewerbungsarten Whitelist und Beta: Bewerbungsart,
 * eine „Stelle“ je Art (startet geschlossen – Admins öffnen sie, sobald Rolle
 * und Fragen passen), Abschnitte mit Fragen und passende Nachrichtenbausteine.
 * Alles im Formularbaukasten frei änderbar.
 */
import type { PositionStatus, TemplateCategory } from "@prisma/client";
import type { SeedSection } from "@/lib/setup/questions";
import { quiz } from "@/lib/setup/quiz-questions";
import type { KindKey } from "@/lib/kinds";

export interface KindSeed {
  type: { key: KindKey; name: string; description: string };
  position: {
    slug: string;
    title: string;
    tagline: string;
    description: string;
    icon: string;
    status: PositionStatus;
    cooldownDays: number;
    tasks: string[];
    requirements: string[];
    sections: SeedSection[];
  };
  templates: { category: TemplateCategory; title: string; body: string }[];
}

const RP_EXPERIENCE = ["Noch keine – ich will es lernen", "Ein paar Monate", "1–2 Jahre", "Mehr als 2 Jahre"];

export const WHITELIST_SEED: KindSeed = {
  type: { key: "whitelist", name: "Whitelist-Bewerbung", description: "Einreise auf den Nordverkehr-Server" },
  position: {
    slug: "whitelist",
    title: "Whitelist",
    tagline: "Spiel mit auf Nordverkehr – ehrliches Hamburg-RP mit Voice-Pflicht.",
    description:
      "Nordverkehr ist ein Whitelist-Server: Bevor du einreist, möchten wir dich und deinen Charakter kennenlernen. Füll das Formular in Ruhe aus – danach melden wir uns für ein kurzes Gespräch auf Discord.",
    icon: "id",
    status: "CLOSED",
    cooldownDays: 7,
    tasks: [
      "Formular ausfüllen: über dich, deine RP-Erfahrung und deinen Charakter",
      "Kurzes Regel-Quiz mit Grundbegriffen aus dem RP",
      "Das Team liest deine Bewerbung und meldet sich per DM",
      "Kurzes Whitelist-Gespräch auf Discord (Sprachkanal)",
      "Freigabe: Du bekommst die Whitelist-Rolle und kannst einreisen",
    ],
    requirements: [
      "Funktionierendes Mikrofon – auf dem Server gilt Voice-Pflicht",
      "Eine eigene, legale Kopie von GTA V und FiveM",
      "Du hast das Regelwerk gelesen",
      "Lust auf ernsthaftes, ehrliches Roleplay",
    ],
    sections: [
      {
        key: "whitelist.about",
        title: "Über dich",
        description: "Ein paar Basics zu dir und deiner Erfahrung.",
        questions: [
          { key: "whitelist.rp_experience", label: "Wie viel RP-Erfahrung hast du?", type: "SELECT", options: RP_EXPERIENCE },
          {
            key: "whitelist.previous_servers",
            label: "Auf welchen Servern hast du schon gespielt?",
            type: "SHORT_TEXT",
            required: false,
            maxLength: 300,
            placeholder: "Optional – z. B. Servername, ungefähr wie lange",
          },
          {
            key: "whitelist.playtime",
            label: "Wie oft wirst du voraussichtlich spielen?",
            type: "SELECT",
            options: ["Ab und zu", "Ein paar Mal pro Woche", "Fast täglich"],
          },
          {
            key: "whitelist.why",
            label: "Warum möchtest du auf Nordverkehr spielen?",
            type: "LONG_TEXT",
            minLength: 80,
            placeholder: "Was reizt dich an Hamburg-RP und an Nordverkehr?",
          },
        ],
      },
      {
        key: "whitelist.character",
        title: "Dein Charakter",
        description: "Kein Roman nötig – aber wir wollen ein Gefühl dafür bekommen, wen du spielen möchtest.",
        questions: [
          { key: "whitelist.char_name", label: "Name deines Charakters", type: "SHORT_TEXT", placeholder: "Vor- und Nachname", maxLength: 80 },
          { key: "whitelist.char_age", label: "Alter deines Charakters", type: "NUMBER", minValue: 16, maxValue: 99 },
          {
            key: "whitelist.char_story",
            label: "Hintergrundgeschichte",
            type: "LONG_TEXT",
            minLength: 300,
            helpText: "Woher kommt dein Charakter, was hat ihn geprägt und warum ist er in Hamburg?",
          },
          {
            key: "whitelist.char_traits",
            label: "Stärken und Schwächen deines Charakters",
            type: "LONG_TEXT",
            minLength: 60,
            helpText: "Ein Charakter mit Ecken und Kanten ist spannender als ein perfekter.",
          },
          { key: "whitelist.char_goals", label: "Was hat dein Charakter in Hamburg vor?", type: "LONG_TEXT", minLength: 80 },
        ],
      },
      {
        key: "whitelist.quiz",
        title: "Regel-Quiz",
        description: "Pro Frage ist genau eine Antwort richtig. Das Team sieht nur, wie viele du richtig hast.",
        questions: [
          quiz("whitelist.quiz_metagaming", "Was bedeutet „Metagaming“?", "Wissen von außerhalb des Spiels (z. B. aus Discord oder einem Stream) im RP nutzen", [
            "Mehrere Charaktere gleichzeitig spielen",
            "Eine Situation besonders lange ausspielen",
            "Im Spiel über das Wetter reden",
          ]),
          quiz("whitelist.quiz_powergaming", "Was ist „Powergaming“?", "Aktionen erzwingen, auf die das Gegenüber keine faire Chance hat zu reagieren", [
            "Sehr viele Stunden am Stück spielen",
            "Das eigene Fahrzeug voll tunen",
            "Mit vielen Leuten gleichzeitig spielen",
          ]),
          quiz("whitelist.quiz_rdm", "Was ist „RDM“ (Random Deathmatch)?", "Jemanden ohne RP-Grund angreifen oder töten", [
            "Ein Rennen ohne festgelegte Strecke",
            "Eine erlaubte Schießerei bei einem Event",
            "Ein zufälliger Server-Neustart",
          ]),
          quiz("whitelist.quiz_vdm", "Was ist „VDM“?", "Ein Fahrzeug als Waffe benutzen, um andere ohne RP-Grund umzufahren", [
            "Ein Fahrzeug ohne Erlaubnis tunen",
            "Mit dem Fahrzeug zu schnell fahren",
            "Ein Fahrzeug im Parkverbot abstellen",
          ]),
          quiz("whitelist.quiz_ooc", "Wann ist OOC (Out of Character) im Spiel in Ordnung?", "Nur im Notfall, z. B. bei technischen Problemen – sonst bleibt man im RP", [
            "Immer, wenn eine Situation langweilig wird",
            "Wenn man einen Streit gewinnen möchte",
            "Grundsätzlich jederzeit über Voice",
          ]),
          quiz("whitelist.quiz_fear", "Du wirst mit einer Waffe bedroht. Was erwartet man im RP?", "Angst um das Leben deines Charakters ausspielen (Fear RP)", [
            "Sofort weglaufen, weil man schneller ist",
            "Die Situation ignorieren",
            "Den Server verlassen",
          ]),
        ],
      },
      {
        key: "whitelist.scenarios",
        title: "Szenarien",
        description: "Es gibt kein „richtig“ oder „falsch“ – wir wollen sehen, wie du denkst.",
        questions: [
          {
            key: "whitelist.scenario_meta",
            label: "Dein Charakter wird ausgeraubt. Parallel schreibt dir ein Freund auf Discord, wer es war. Wie gehst du damit um?",
            type: "SCENARIO",
            minLength: 80,
          },
          {
            key: "whitelist.scenario_unfair",
            label: "Ein anderer Spieler verhält sich im RP unfair (z. B. Powergaming). Was tust du – im Spiel und danach?",
            type: "SCENARIO",
            minLength: 80,
          },
        ],
      },
    ],
  },
  templates: [
    {
      category: "EINGANG",
      title: "Whitelist – Bewerbung angekommen",
      body: "Moin {name},\n\ndeine Whitelist-Bewerbung ({bewerbungs_id}) ist bei uns angekommen. Wir lesen sie uns in Ruhe durch – {bearbeitungszeit}. Den Stand siehst du jederzeit im Portal.",
    },
    {
      category: "EINGANG",
      title: "Whitelist – Zwischenstand",
      body: "Moin {name},\n\nkurzer Zwischenstand zu deiner Whitelist-Bewerbung {bewerbungs_id}: Gerade kommen viele Bewerbungen rein, deshalb dauert es etwas länger. Du hast nichts falsch gemacht – wir melden uns.",
    },
    {
      category: "RUECKFRAGE",
      title: "Whitelist – Rückfrage zum Charakter",
      body: "Moin {name},\n\ndanke für deine Whitelist-Bewerbung! Zu deinem Charakter haben wir noch eine Frage:\n\n{grund}\n\nAntworte einfach direkt im Portal – ein paar Sätze reichen.",
    },
    {
      category: "RUECKFRAGE",
      title: "Whitelist – Rückfrage zum Regelwerk",
      body: "Moin {name},\n\nbei ein paar Fragen zum Regelwerk sind wir noch nicht sicher, ob alles klar ist:\n\n{grund}\n\nLies dir die Stellen im Regelwerk gern nochmal durch und antworte uns im Portal in deinen eigenen Worten.",
    },
    {
      category: "EINLADUNG",
      title: "Whitelist – Terminvorschlag gesucht",
      body: "Moin {name},\n\ndeine Whitelist-Bewerbung hat uns gefallen – als Nächstes steht ein kurzes Gespräch auf Discord an. Schreib uns im Portal zwei, drei Zeiten, an denen du in den nächsten Tagen kannst.",
    },
    {
      category: "ERINNERUNG",
      title: "Whitelist – Erinnerung an das Gespräch",
      body: "Moin {name},\n\nkurze Erinnerung: Dein Whitelist-Gespräch ist am **{termin}** auf unserem Discord. Mikrofon bereithalten – bis dann!",
    },
    {
      category: "ERINNERUNG",
      title: "Whitelist – Wir warten auf deine Antwort",
      body: "Moin {name},\n\nwir hatten dir zu deiner Whitelist-Bewerbung {bewerbungs_id} eine Frage gestellt und noch nichts gehört. Melde dich gern in den nächsten Tagen im Portal – sonst schließen wir die Bewerbung.",
    },
    {
      category: "SONSTIGES",
      title: "Whitelist – Infos zur Einreise",
      body: "**So geht's los:**\n- Auf Discord findest du im Info-Bereich alles zum Verbinden.\n- Voice ist Pflicht – teste dein Mikrofon vorher.\n- Bei Fragen im Spiel hilft dir der Support über das Ticket-System.",
    },
    {
      category: "SONSTIGES",
      title: "Whitelist – Tipps für die nächste Bewerbung",
      body: "**Ein paar Tipps fürs nächste Mal:**\n- Gib deinem Charakter Ecken und Kanten – perfekte Helden sind langweilig.\n- Schreib die Hintergrundgeschichte in eigenen Worten.\n- Lies das Regelwerk vor dem Quiz einmal in Ruhe durch.",
    },
    {
      category: "EINLADUNG",
      title: "Whitelist – Einladung zum Gespräch",
      body: "Moin {name},\n\ndanke für deine Whitelist-Bewerbung ({bewerbungs_id}) – sie hat uns gefallen! Als Nächstes lernen wir uns kurz im Sprachkanal auf Discord kennen.\n\n**Termin:** {termin}\n**Mit:** {teammitglied}\n\nPlan etwa 15 Minuten ein und halt dein Mikrofon bereit.",
    },
    {
      category: "ANNAHME",
      title: "Whitelist – Freigegeben",
      body: "Moin {name},\n\nwillkommen in Hamburg! 🎉 Deine Whitelist ist freigegeben – du hast auf Discord jetzt die passende Rolle und kannst einreisen.\n\nAlle Infos zum Verbinden findest du auf unserem Discord. Viel Spaß beim Spielen!",
    },
    {
      category: "ABLEHNUNG",
      title: "Whitelist – Absage",
      body: "Moin {name},\n\ndanke für deine Whitelist-Bewerbung. Diesmal hat es leider nicht gepasst:\n\n{grund}\n\nDu kannst dich ab **{sperrfrist}** erneut bewerben – wir freuen uns, wenn du es nochmal versuchst.",
    },
    {
      category: "ABLEHNUNG",
      title: "Whitelist – Absage nach dem Gespräch",
      body: "Moin {name},\n\ndanke für das Gespräch und deine Zeit! Nach dem Gespräch haben wir uns entschieden, dir die Whitelist noch nicht zu geben:\n\n{grund}\n\nAb **{sperrfrist}** kannst du es erneut versuchen – nimm unsere Hinweise gern mit.",
    },
  ],
};

export const BETA_SEED: KindSeed = {
  type: { key: "beta", name: "Beta-Bewerbung", description: "Beta-Test vor dem Serverstart" },
  position: {
    slug: "beta",
    title: "Beta-Test",
    tagline: "Teste Nordverkehr vor dem Start und hilf uns, Fehler zu finden.",
    description:
      "Bevor Nordverkehr startet, testen wir den Server mit einer kleinen Gruppe. Als Beta-Tester spielst du früh mit, probierst Systeme aus und meldest Fehler – damit zum Start alles rund läuft. Die Plätze sind begrenzt, ein Gespräch gibt es nicht.",
    icon: "flask",
    status: "CLOSED",
    cooldownDays: 7,
    tasks: [
      "Kurzes Formular ausfüllen",
      "Das Team wählt die Tester aus – ohne Gespräch",
      "Zusage per DM und Beta-Rolle auf Discord",
      "Testen, Fehler melden und Feedback geben",
    ],
    requirements: [
      "Zeit, in der Testphase regelmäßig online zu sein",
      "Funktionierendes Mikrofon (Voice-Pflicht)",
      "Geduld mit Fehlern und Neustarts",
      "Lust, Fehler genau zu beschreiben",
    ],
    sections: [
      {
        key: "beta.about",
        title: "Über dich",
        description: "Damit wir eine gute Mischung an Testern zusammenstellen können.",
        questions: [
          { key: "beta.rp_experience", label: "Wie viel RP-Erfahrung hast du?", type: "SELECT", options: RP_EXPERIENCE },
          {
            key: "beta.hours",
            label: "Wie viele Stunden pro Woche kannst du in der Testphase spielen?",
            type: "SELECT",
            options: ["unter 3 Stunden", "3–6 Stunden", "6–10 Stunden", "über 10 Stunden"],
          },
          {
            key: "beta.times",
            label: "Wann kannst du meistens spielen?",
            type: "MULTI_SELECT",
            options: ["Wochentags nachmittags", "Wochentags abends", "Am Wochenende"],
            minValue: 1,
          },
          { key: "beta.why", label: "Warum möchtest du beim Beta-Test dabei sein?", type: "LONG_TEXT", minLength: 60 },
        ],
      },
      {
        key: "beta.testing",
        title: "Testen & Fehler melden",
        description: "Gute Fehlermeldungen sind das Wichtigste an einem Beta-Test.",
        questions: [
          {
            key: "beta.test_experience",
            label: "Hast du schon einmal Spiele oder Server getestet?",
            type: "SELECT",
            options: ["Nein, das wäre das erste Mal", "Ja, ein bisschen", "Ja, regelmäßig"],
          },
          {
            key: "beta.bug_report",
            label: "Nach einem Server-Neustart ist dein Fahrzeug aus der Garage verschwunden. Wie würdest du den Fehler melden?",
            type: "SCENARIO",
            minLength: 80,
            helpText: "Schreib so, wie du es uns tatsächlich melden würdest.",
          },
          {
            key: "beta.setup",
            label: "Mit welchem System spielst du?",
            type: "SHORT_TEXT",
            required: false,
            maxLength: 200,
            placeholder: "Optional – z. B. Windows 11, RTX 3060, 16 GB RAM",
          },
        ],
      },
    ],
  },
  templates: [
    {
      category: "EINGANG",
      title: "Beta – Bewerbung angekommen",
      body: "Moin {name},\n\ndeine Bewerbung zum Beta-Test ({bewerbungs_id}) ist angekommen. Wir stellen eine gute Mischung an Testern zusammen und melden uns per DM – ein Gespräch gibt es nicht.",
    },
    {
      category: "EINGANG",
      title: "Beta – Zwischenstand",
      body: "Moin {name},\n\nkurzer Zwischenstand zum Beta-Test: Wir sind noch dabei, die Tester auszuwählen. Sobald es Neuigkeiten gibt, melden wir uns hier.",
    },
    {
      category: "RUECKFRAGE",
      title: "Beta – Rückfrage zur Verfügbarkeit",
      body: "Moin {name},\n\nkurze Frage zu deiner Beta-Bewerbung: Wie oft kannst du in der Testphase realistisch online sein?\n\n{grund}\n\nAntworte einfach im Portal.",
    },
    {
      category: "RUECKFRAGE",
      title: "Beta – Rückfrage zum System",
      body: "Moin {name},\n\nfür den Test wäre es gut zu wissen, mit welchem System du spielst (Betriebssystem, Grafikkarte, Arbeitsspeicher). Schreib es uns gern im Portal – das hilft beim Eingrenzen von Fehlern.",
    },
    {
      category: "EINLADUNG",
      title: "Beta – Einladung zum Start der Testphase",
      body: "Moin {name},\n\ndie Testphase startet am **{termin}**! Komm kurz vorher auf unseren Discord – dort bekommst du alle Infos zum Verbinden und wie du Fehler meldest.\n\nWir freuen uns auf dein Feedback.",
    },
    {
      category: "ERINNERUNG",
      title: "Beta – Erinnerung: Testphase startet",
      body: "Moin {name},\n\nkurze Erinnerung: Die Testphase startet am **{termin}**. Schau vorher auf Discord vorbei, damit beim Verbinden alles klappt.",
    },
    {
      category: "ERINNERUNG",
      title: "Beta – Wir warten auf deine Antwort",
      body: "Moin {name},\n\nwir hatten dir zu deiner Beta-Bewerbung {bewerbungs_id} eine Frage gestellt und noch nichts gehört. Melde dich gern in den nächsten Tagen im Portal – sonst vergeben wir den Platz weiter.",
    },
    {
      category: "SONSTIGES",
      title: "Beta – So meldest du Fehler",
      body: "**So meldest du Fehler am besten:**\n- Was hast du gemacht? (Schritte zum Nachstellen)\n- Was ist passiert, was hättest du erwartet?\n- Wann ungefähr (Uhrzeit) und – wenn möglich – ein Screenshot oder Clip.",
    },
    {
      category: "SONSTIGES",
      title: "Beta – Danke fürs Testen",
      body: "Moin {name},\n\ndanke, dass du beim Beta-Test dabei warst! Deine Rückmeldungen haben uns sehr geholfen. Wir sehen uns zum Start auf dem Server.",
    },
    {
      category: "ANNAHME",
      title: "Beta – Zusage",
      body: "Moin {name},\n\ndu bist beim Beta-Test dabei! 🎉 Du hast auf Discord jetzt die Beta-Rolle – dort findest du alle Infos zum Verbinden und wie du Fehler meldest.\n\nDanke, dass du uns hilfst, Nordverkehr startklar zu machen.",
    },
    {
      category: "ABLEHNUNG",
      title: "Beta – Absage",
      body: "Moin {name},\n\ndanke für deine Bewerbung zum Beta-Test! Die Plätze sind leider begrenzt und diesmal hat es nicht geklappt. Wir sehen uns spätestens zum Serverstart – die Whitelist öffnet rechtzeitig.",
    },
    {
      category: "ABLEHNUNG",
      title: "Beta – Warteliste",
      body: "Moin {name},\n\ndanke für deine Bewerbung zum Beta-Test! Gerade sind alle Plätze vergeben – du stehst aber auf unserer Warteliste. Wird ein Platz frei, melden wir uns bei dir.",
    },
  ],
};

export const KIND_SEEDS: KindSeed[] = [WHITELIST_SEED, BETA_SEED];
