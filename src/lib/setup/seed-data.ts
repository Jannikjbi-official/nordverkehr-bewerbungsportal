/**
 * Inhalte für den Seed. Positionstexte orientieren sich an nordverkehr.xyz/team.
 */
import type { PositionStatus, TemplateCategory } from "@prisma/client";
import { GENERAL_SECTIONS, POSITION_SECTIONS, type SeedQuestion, type SeedSection } from "@/lib/setup/questions";
import { POSITION_QUIZ } from "@/lib/setup/quiz-questions";

export { GENERAL_SECTIONS, POSITION_SECTIONS, type SeedQuestion, type SeedSection };

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

/**
 * Sperrfrist nach einer Absage (Tage) je Stelle – je mehr Vertrauen oder
 * Können die Stelle braucht, desto länger, damit sich bis zur nächsten
 * Bewerbung wirklich etwas ändern kann.
 */
export const POSITION_COOLDOWNS: Record<string, number> = {
  support: 30, // Einstieg ins Team, schnell dazulernbar
  eventteam: 30, // Ideen & Engagement, schnell nachweisbar
  media: 45, // Portfolio ausbauen braucht etwas Zeit
  mapper: 45, // neue Builds/Projekte zeigen
  entwickler: 60, // Fachwissen & Projekte brauchen Zeit
  moderator: 60, // Vertrauensposition – Verhalten über längere Zeit zählt
};

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
    sections: [...(POSITION_SECTIONS["support"] ?? []), ...(POSITION_QUIZ["support"] ? [POSITION_QUIZ["support"]] : [])],
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
    sections: [...(POSITION_SECTIONS["moderator"] ?? []), ...(POSITION_QUIZ["moderator"] ? [POSITION_QUIZ["moderator"]] : [])],
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
    sections: [...(POSITION_SECTIONS["entwickler"] ?? []), ...(POSITION_QUIZ["entwickler"] ? [POSITION_QUIZ["entwickler"]] : [])],
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
    sections: [...(POSITION_SECTIONS["media"] ?? []), ...(POSITION_QUIZ["media"] ? [POSITION_QUIZ["media"]] : [])],
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
    sections: [...(POSITION_SECTIONS["mapper"] ?? []), ...(POSITION_QUIZ["mapper"] ? [POSITION_QUIZ["mapper"]] : [])],
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
    sections: [...(POSITION_SECTIONS["eventteam"] ?? []), ...(POSITION_QUIZ["eventteam"] ? [POSITION_QUIZ["eventteam"]] : [])],
  },
];

/** Zustimmung zu KI-Punkten bei älteren Bewerbungen (siehe Admin-Freigabe im Bewertungsbogen) */
export const KI_CONSENT_TEMPLATE_TITLE = "KI-Einschätzung – Zustimmung";
export const KI_CONSENT_TEMPLATE_BODY =
  "Moin {name},\n\nkurze Frage zu deiner Bewerbung {bewerbungs_id} als **{position}**:\n\nWir nutzen im Bewerbungsportal seit Kurzem eine KI, die Bewerbungen nach festen Kriterien einschätzt (z. B. Kommunikation, Erfahrung, Umgang mit Szenarien) und das kurz begründet. Deine Bewerbung kam kurz vor dieser Neuerung bei uns an – deshalb fragen wir dich vorher.\n\n**Was dabei passiert:**\n- Nur deine Antworten und die Stelle gehen an die KI (Claude von Anthropic) – nicht dein Name, deine Discord-ID oder Bilder.\n- Die Punkte sind nur eine Orientierung fürs Team. Entscheiden tun immer wir Menschen, im Gespräch und in der Abstimmung.\n- Die Daten werden nicht zum Training der KI genutzt.\n\n**Sagst du Nein, hat das keinerlei Nachteile** – dann bewerten wir deine Bewerbung ganz normal ohne KI.\n\nWenn du einverstanden bist, antworte einfach direkt im Portal unter „Meine Bewerbungen“ mit **„Ja“**. Mehr dazu steht in der Datenschutzerklärung im Portal.";

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
    category: "RUECKFRAGE",
    title: KI_CONSENT_TEMPLATE_TITLE,
    body: KI_CONSENT_TEMPLATE_BODY,
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
    body: "Moin {name},\n\ndanke für deine Bewerbung als {position} und die Zeit, die du reingesteckt hast. Diesmal hat es leider nicht gepasst.\n\n{grund}\n\nFür {position} gilt nach einer Absage eine Sperrfrist von **{sperrfrist_tage}** – du kannst dich also ab dem **{sperrfrist}** wieder bewerben. Wir freuen uns, wenn du weiter auf Nordverkehr spielst.",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage – zu wenig Zeit",
    body: "Moin {name},\n\nehrlich gesagt: Für {position} brauchen wir gerade Leute, die regelmäßig mehr Zeit mitbringen, als du angegeben hast. Das ist keine Kritik an dir – es passt nur aktuell nicht.\n\nWenn sich bei dir etwas ändert, bewirb dich gern nochmal: Die Sperrfrist für {position} beträgt **{sperrfrist_tage}**, also ab dem **{sperrfrist}**.",
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
