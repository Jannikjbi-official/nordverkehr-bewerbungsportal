/**
 * Inhalte für den Seed. Positionstexte orientieren sich an nordverkehr.xyz/team.
 */
import type { PositionStatus, QuestionType, TemplateCategory } from "@prisma/client";

export interface SeedQuestion {
  key: string;
  label: string;
  type: QuestionType;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  options?: string[];
}

export interface SeedSection {
  key: string;
  title: string;
  description?: string;
  questions: SeedQuestion[];
}

export const GENERAL_SECTIONS: SeedSection[] = [
  {
    key: "about",
    title: "Über dich",
    description: "Ein paar Basics, damit wir wissen, mit wem wir es zu tun haben.",
    questions: [
      {
        key: "callname",
        label: "Wie sollen wir dich nennen?",
        type: "SHORT_TEXT",
        placeholder: "Rufname oder Spitzname",
        maxLength: 40,
      },
      {
        key: "hours",
        label: "Wie viele Stunden pro Woche kannst du realistisch fürs Team einplanen?",
        type: "SELECT",
        helpText: "Ehrlich bleiben – lieber weniger zusagen und dafür verlässlich sein.",
        options: ["unter 5 Stunden", "5–10 Stunden", "10–20 Stunden", "über 20 Stunden"],
      },
      {
        key: "availability",
        label: "Wann bist du meistens erreichbar?",
        type: "MULTI_SELECT",
        options: ["Wochentags vormittags", "Wochentags nachmittags", "Wochentags abends", "Am Wochenende"],
        minValue: 1,
      },
      {
        key: "intro",
        label: "Erzähl kurz etwas über dich.",
        type: "LONG_TEXT",
        placeholder: "Was machst du so, wie bist du zu RP gekommen, was ist dir wichtig?",
        minLength: 80,
        maxLength: 1500,
      },
    ],
  },
  {
    key: "experience",
    title: "Erfahrung & Motivation",
    description: "Kein Lebenslauf nötig. Uns interessiert, wie du tickst.",
    questions: [
      {
        key: "teams",
        label: "Welche Erfahrung hast du in anderen Teams oder Projekten?",
        type: "LONG_TEXT",
        helpText: "Server, Communities, Vereine, Projekte – alles zählt. Keine Erfahrung ist auch okay, dann sag das.",
        minLength: 40,
        maxLength: 2000,
      },
      {
        key: "motivation",
        label: "Warum willst du ausgerechnet bei Nordverkehr ins Team?",
        type: "LONG_TEXT",
        minLength: 120,
        maxLength: 2500,
      },
      {
        key: "strengths",
        label: "Was sind deine Stärken?",
        type: "LONG_TEXT",
        minLength: 40,
        maxLength: 1200,
      },
      {
        key: "weaknesses",
        label: "Woran arbeitest du noch?",
        type: "LONG_TEXT",
        helpText: "Jeder hat Baustellen. Wir finden es stark, wenn man sie kennt.",
        minLength: 40,
        maxLength: 1200,
      },
    ],
  },
  {
    key: "scenarios",
    title: "Szenarien",
    description: "Es gibt keine perfekte Antwort. Wir wollen sehen, wie du denkst.",
    questions: [
      {
        key: "insult",
        label: "Ein Spieler beleidigt dich im Support-Ticket. Wie reagierst du?",
        type: "SCENARIO",
        minLength: 80,
        maxLength: 2000,
      },
      {
        key: "friend",
        label: "Ein Freund von dir bricht eine Regel und du bekommst es mit. Was machst du?",
        type: "SCENARIO",
        minLength: 80,
        maxLength: 2000,
      },
      {
        key: "conflict",
        label: "Zwei Teammitglieder sind sich öffentlich uneinig über eine Entscheidung. Wie gehst du damit um?",
        type: "SCENARIO",
        minLength: 80,
        maxLength: 2000,
      },
    ],
  },
];

export interface SeedPosition {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  status: PositionStatus;
  tasks: string[];
  requirements: string[];
  sections: SeedSection[];
}

export const POSITIONS: SeedPosition[] = [
  {
    slug: "support",
    title: "Support",
    tagline: "Discord Tickets, Spielerhilfe.",
    icon: "headset",
    status: "OPEN",
    description:
      "Du bist die erste Anlaufstelle, wenn es hakt. Ob neue Spieler, technische Probleme oder Fragen zum Regelwerk – du bleibst ruhig, freundlich und findest eine Lösung.",
    tasks: [
      "Discord-Tickets beantworten und sauber dokumentieren",
      "Neuen Spielern beim Einstieg helfen",
      "Fragen zu Whitelist, TeamSpeak & SaltyChat klären",
      "Wiederkehrende Probleme ans Team weitergeben",
    ],
    requirements: [
      "Mindestalter 18 Jahre",
      "Geduld und ein freundlicher, klarer Ton",
      "Funktionierendes Mikrofon, TeamSpeak & SaltyChat",
      "Regelmäßige Verfügbarkeit (mind. 5 Std./Woche)",
    ],
    sections: [
      {
        key: "support",
        title: "Support",
        questions: [
          {
            key: "newbie",
            label: "Ein neuer Spieler hat noch nie RP gespielt. Wie erklärst du ihm den Einstieg?",
            type: "LONG_TEXT",
            minLength: 80,
            maxLength: 2000,
          },
          {
            key: "tickets",
            label: "Wie viel Support-Erfahrung hast du ungefähr?",
            type: "SELECT",
            options: ["Noch keine", "Ein paar Tickets", "Regelmäßig auf einem anderen Server", "Lead/Leitung im Support"],
          },
        ],
      },
    ],
  },
  {
    slug: "moderator",
    title: "Moderator",
    tagline: "Ingame Verwaltung, Regelkontrolle.",
    icon: "shield",
    status: "OPEN",
    description:
      "Du sorgst ingame dafür, dass Roleplay fair bleibt. Du greifst ein, wenn es nötig ist – und hältst dich zurück, wenn RP einfach gut läuft.",
    tasks: [
      "Situationen ingame bewerten und fair moderieren",
      "Regelverstöße aufnehmen und nachvollziehbar dokumentieren",
      "Mit Support und Leitung eng abstimmen",
      "Spielern Entscheidungen ruhig erklären",
    ],
    requirements: [
      "Mindestalter 18 Jahre",
      "Sehr gute Kenntnis des Regelwerks",
      "Neutralität – auch bei Freunden",
      "Funktionierendes Mikrofon, TeamSpeak & SaltyChat",
    ],
    sections: [
      {
        key: "mod",
        title: "Moderation",
        questions: [
          {
            key: "powergaming",
            label: "Während einer Verfolgungsjagd fällt dir Powergaming auf. Wann und wie greifst du ein?",
            type: "SCENARIO",
            minLength: 100,
            maxLength: 2000,
          },
          {
            key: "rules_knowledge",
            label: "Wie gut kennst du unser Regelwerk?",
            type: "SELECT",
            options: ["Einmal überflogen", "Gelesen und verstanden", "Kenne ich sehr genau"],
          },
        ],
      },
    ],
  },
  {
    slug: "entwickler",
    title: "Entwickler",
    tagline: "Scripts, Systeme, Backend.",
    icon: "code",
    status: "OPEN",
    description:
      "Du baust mit an den Systemen, die Nordverkehr ausmachen – erst auf GTA 5, danach beim Umzug auf GTA 6. Sauberer Code ist dir wichtiger als schnelle Hacks.",
    tasks: [
      "Scripts und Systeme entwickeln und pflegen",
      "Bugs analysieren und nachhaltig beheben",
      "Code-Reviews und Absprachen im Dev-Team",
      "Den Umzug auf GTA 6 mit vorbereiten",
    ],
    requirements: [
      "Mindestalter 18 Jahre",
      "Erfahrung mit Lua und/oder JavaScript/TypeScript",
      "Git-Grundlagen",
      "Portfolio oder GitHub-Profil",
    ],
    sections: [
      {
        key: "dev",
        title: "Entwicklung",
        questions: [
          {
            key: "stack",
            label: "Mit welchen Sprachen und Technologien arbeitest du?",
            type: "MULTI_SELECT",
            options: ["Lua", "JavaScript / TypeScript", "C#", "SQL", "React / Vue", "Andere"],
            minValue: 1,
          },
          {
            key: "github",
            label: "Link zu deinem GitHub oder Portfolio",
            type: "URL",
            placeholder: "https://github.com/…",
          },
          {
            key: "project",
            label: "Beschreib ein Projekt, auf das du stolz bist.",
            type: "LONG_TEXT",
            helpText: "Was war die Herausforderung, was war dein Teil, was hast du gelernt?",
            minLength: 100,
            maxLength: 2500,
          },
          {
            key: "fivem",
            label: "Hast du schon für FiveM oder andere Multiplayer-Plattformen entwickelt?",
            type: "LONG_TEXT",
            required: false,
            maxLength: 1500,
          },
        ],
      },
    ],
  },
  {
    slug: "media",
    title: "Media",
    tagline: "Content, Clips, Social Media.",
    icon: "camera",
    status: "OPEN",
    description:
      "Du zeigst, wie sich Nordverkehr anfühlt: Clips, Bilder, Posts. Ehrlich und ohne Showbusiness – so wie der Server selbst.",
    tasks: [
      "Clips und Screenshots aufnehmen und schneiden",
      "Social-Media-Kanäle mit Content versorgen",
      "Updates und Events ankündigen",
      "Ideen für Formate entwickeln",
    ],
    requirements: [
      "Mindestalter 18 Jahre",
      "Erfahrung mit Schnitt oder Bildbearbeitung",
      "Gespür für Stil und Timing",
      "Beispiele deiner Arbeit",
    ],
    sections: [
      {
        key: "media",
        title: "Content",
        questions: [
          {
            key: "platforms",
            label: "Auf welchen Plattformen kennst du dich aus?",
            type: "MULTI_SELECT",
            options: ["TikTok", "Instagram", "YouTube", "Twitch", "X / Twitter"],
            minValue: 1,
          },
          {
            key: "portfolio",
            label: "Link zu deinen Arbeiten",
            type: "URL",
            placeholder: "https://…",
          },
          {
            key: "idea",
            label: "Welche Content-Idee würdest du als Erstes für Nordverkehr umsetzen?",
            type: "LONG_TEXT",
            minLength: 80,
            maxLength: 2000,
          },
          {
            key: "samples",
            label: "Screenshots oder Thumbnails (optional)",
            type: "FILE",
            required: false,
            helpText: "Bis zu 5 Bilder (JPG, PNG, WebP), je max. 8 MB.",
          },
        ],
      },
    ],
  },
  {
    slug: "mapper",
    title: "Mapper / Builder",
    tagline: "Interiors, MLOs, Hamburg-Atmosphäre.",
    icon: "cube",
    status: "OPEN",
    description:
      "Hamburg-Atmosphäre entsteht nicht von allein. Du baust Orte, an denen gutes RP passiert – stimmig, performant und mit Liebe zum Detail.",
    tasks: [
      "Interiors und MLOs bauen und optimieren",
      "Bestehende Maps anpassen und pflegen",
      "Auf Performance und Streaming achten",
      "Mit Entwicklern Abläufe abstimmen",
    ],
    requirements: [
      "Mindestalter 18 Jahre",
      "Erfahrung mit CodeWalker, Blender o. Ä.",
      "Screenshots bisheriger Arbeiten",
      "Geduld für Details",
    ],
    sections: [
      {
        key: "mapping",
        title: "Mapping",
        questions: [
          {
            key: "tools",
            label: "Mit welchen Tools arbeitest du?",
            type: "MULTI_SELECT",
            options: ["CodeWalker", "Blender", "Sollumz", "3ds Max", "ZModeler", "Andere"],
            minValue: 1,
          },
          {
            key: "screenshots",
            label: "Screenshots deiner Arbeiten",
            type: "FILE",
            helpText: "Bis zu 5 Bilder (JPG, PNG, WebP), je max. 8 MB. Metadaten werden automatisch entfernt.",
          },
          {
            key: "portfolio",
            label: "Portfolio-Link (optional)",
            type: "URL",
            required: false,
            placeholder: "https://…",
          },
        ],
      },
    ],
  },
  {
    slug: "eventteam",
    title: "Eventteam",
    tagline: "Events planen, Community bewegen.",
    icon: "confetti",
    status: "CLOSED",
    description:
      "Du denkst dir Events aus, die Leute zusammenbringen – vom kleinen Treffen am Hafen bis zum großen Server-Event. Und du sorgst dafür, dass sie auch funktionieren.",
    tasks: [
      "Events planen, ankündigen und durchführen",
      "Mit Moderation und Support abstimmen",
      "Feedback einsammeln und auswerten",
    ],
    requirements: ["Mindestalter 18 Jahre", "Organisationstalent", "Kreativität und Zuverlässigkeit"],
    sections: [
      {
        key: "events",
        title: "Events",
        questions: [
          {
            key: "event_idea",
            label: "Beschreib ein Event, das du gern auf Nordverkehr veranstalten würdest.",
            type: "LONG_TEXT",
            minLength: 120,
            maxLength: 2500,
          },
          {
            key: "event_experience",
            label: "Hast du schon Events organisiert? Erzähl kurz.",
            type: "LONG_TEXT",
            required: false,
            maxLength: 1500,
          },
        ],
      },
    ],
  },
];

export const TEMPLATES: { category: TemplateCategory; title: string; body: string }[] = [
  {
    category: "EINGANG",
    title: "Bewerbung ist angekommen",
    body: "Moin {name},\n\ndeine Bewerbung als **{position}** ({bewerbungs_id}) ist bei uns angekommen. Wir schauen sie uns in Ruhe an und melden uns – {bearbeitungszeit}.",
  },
  {
    category: "EINGANG",
    title: "Kurzer Zwischenstand",
    body: "Moin {name},\n\nkurzer Zwischenstand zu deiner Bewerbung {bewerbungs_id}: Wir sind dran, es dauert nur etwas länger als gedacht. Du hast nichts falsch gemacht – wir melden uns.",
  },
  {
    category: "RUECKFRAGE",
    title: "Rückfrage zu deinen Antworten",
    body: "Moin {name},\n\nwir haben uns deine Bewerbung als {position} angeschaut und noch eine Rückfrage:\n\n{grund}\n\nAntworte einfach direkt im Portal unter „Meine Bewerbungen“.",
  },
  {
    category: "RUECKFRAGE",
    title: "Portfolio / Link fehlt",
    body: "Moin {name},\n\nbei deiner Bewerbung fehlt uns noch ein Blick auf deine bisherigen Arbeiten. Schick uns gern einen Link oder ein paar Screenshots – einfach im Portal antworten.",
  },
  {
    category: "EINLADUNG",
    title: "Einladung zum Gespräch",
    body: "Moin {name},\n\ndeine Bewerbung als **{position}** hat uns gefallen – wir wollen dich kennenlernen.\n\n**Termin:** {termin}\n**Wo:** TeamSpeak, Warteraum Bewerbungsgespräche\n**Mit:** {teammitglied}\n\nPlan etwa 20–30 Minuten ein. Passt der Termin nicht, sag einfach kurz Bescheid.",
  },
  {
    category: "EINLADUNG",
    title: "Terminvorschlag gesucht",
    body: "Moin {name},\n\nwir würden gern ein kurzes Gespräch mit dir führen. Schreib uns im Portal zwei, drei Zeiten, an denen du diese Woche kannst – dann machen wir was fest.",
  },
  {
    category: "ANNAHME",
    title: "Willkommen im Team",
    body: "Moin {name},\n\nwillkommen im Team! Du bist ab sofort Teil von Nordverkehr als **{position}**.\n\nDu bekommst gleich deine Rolle auf dem Discord. {teammitglied} meldet sich bei dir für die Einarbeitung. Bis dahin: lies dir das Team-Regelwerk im Team-Channel durch.\n\nSchön, dass du dabei bist.",
  },
  {
    category: "ANNAHME",
    title: "Probezeit-Infos",
    body: "Die ersten vier Wochen sind deine Probezeit. Das ist kein Test, sondern Zeit zum Ankommen: Frag viel, schau dir Abläufe an, und sag Bescheid, wenn dir etwas komisch vorkommt.",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage (freundlich)",
    body: "Moin {name},\n\ndanke für deine Bewerbung als {position} und die Zeit, die du reingesteckt hast. Diesmal hat es leider nicht gepasst.\n\n{grund}\n\nDu kannst dich ab dem {sperrfrist} wieder bewerben. Wir freuen uns, wenn du weiter auf Nordverkehr spielst.",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage – zu wenig Zeit",
    body: "Moin {name},\n\nehrlich gesagt: Für {position} brauchen wir gerade Leute, die regelmäßig mehr Zeit mitbringen, als du angegeben hast. Das ist keine Kritik an dir – es passt nur aktuell nicht.\n\nWenn sich bei dir etwas ändert, bewirb dich gern ab dem {sperrfrist} nochmal.",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage – Mindestalter",
    body: "Moin {name},\n\nfür Team-Positionen gilt bei uns ein Mindestalter von 18 Jahren. Deshalb können wir deine Bewerbung leider nicht annehmen. Danke trotzdem für dein Interesse – und viel Spaß weiterhin auf dem Server.",
  },
  {
    category: "SONSTIGES",
    title: "Tipps für die nächste Bewerbung",
    body: "**Ein paar Tipps fürs nächste Mal:**\n- Schreib in deinen eigenen Worten – kopierte Texte fallen auf.\n- Bei Szenario-Fragen zählt dein Weg, nicht die perfekte Antwort.\n- Lieber konkret als allgemein: Beispiele helfen uns sehr.",
  },
  {
    category: "ERINNERUNG",
    title: "Erinnerung an den Gesprächstermin",
    body: "Moin {name},\n\nkurze Erinnerung: Dein Gespräch ist am **{termin}** auf TeamSpeak. Bis dann!",
  },
  {
    category: "ERINNERUNG",
    title: "Wir warten auf deine Antwort",
    body: "Moin {name},\n\nwir hatten dir zu deiner Bewerbung {bewerbungs_id} eine Frage gestellt und noch nichts gehört. Melde dich gern in den nächsten Tagen im Portal – sonst schließen wir die Bewerbung.",
  },
];
