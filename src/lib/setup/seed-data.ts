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
      "Funktionierendes Mikrofon – Discord (Gespräch & Support), TeamSpeak & SaltyChat (Ingame)",
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
      "Funktionierendes Mikrofon – Discord (Gespräch & Support), TeamSpeak & SaltyChat (Ingame)",
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
/** Alter Text (bis 15.11.2026) – nur für die Migration */
export const KI_CONSENT_TEMPLATE_BODY_V1 =
  "Moin {name},\n\nkurze Frage zu deiner Bewerbung {bewerbungs_id} als **{position}**:\n\nWir nutzen im Bewerbungsportal seit Kurzem eine KI, die Bewerbungen nach festen Kriterien einschätzt (z. B. Kommunikation, Erfahrung, Umgang mit Szenarien) und das kurz begründet. Deine Bewerbung kam kurz vor dieser Neuerung bei uns an – deshalb fragen wir dich vorher.\n\n**Was dabei passiert:**\n- Nur deine Antworten und die Stelle gehen an die KI (Claude von Anthropic) – nicht dein Name, deine Discord-ID oder Bilder.\n- Die Punkte sind nur eine Orientierung fürs Team. Entscheiden tun immer wir Menschen, im Gespräch und in der Abstimmung.\n- Die Daten werden nicht zum Training der KI genutzt.\n\n**Sagst du Nein, hat das keinerlei Nachteile** – dann bewerten wir deine Bewerbung ganz normal ohne KI.\n\nWenn du einverstanden bist, antworte einfach direkt im Portal unter „Meine Bewerbungen“ mit **„Ja“**. Mehr dazu steht in der Datenschutzerklärung im Portal.";
/** Neuer Text: Antwort per Knopf im Portal (Pop-up) statt „Ja“ schreiben */
export const KI_CONSENT_TEMPLATE_BODY =
  "Moin {name},\n\nkurze Frage zu deiner Bewerbung {bewerbungs_id} als **{position}**:\n\nWir nutzen im Bewerbungsportal seit Kurzem eine KI, die Bewerbungen nach festen Kriterien einschätzt (z. B. Kommunikation, Erfahrung, Umgang mit Szenarien) und das kurz begründet. Deine Bewerbung kam kurz vor dieser Neuerung bei uns an – deshalb fragen wir dich vorher.\n\n**Was dabei passiert:**\n- Nur deine Antworten und die Stelle gehen an die KI (Claude von Anthropic) – nicht dein Name, deine Discord-ID oder Bilder.\n- Die Punkte sind nur eine Orientierung fürs Team. Entscheiden tun immer wir Menschen, im Gespräch und in der Abstimmung.\n- Die Daten werden nicht zum Training der KI genutzt.\n\n**Sagst du Nein, hat das keinerlei Nachteile** – dann bewerten wir deine Bewerbung ganz normal ohne KI.\n\nIm Portal unter „Meine Bewerbungen“ ({dashboard_link}) erscheint dazu ein Fenster – tippe dort einfach auf **Erlauben** oder **Ablehnen**. Mehr dazu steht in der Datenschutzerklärung im Portal.";

/**
 * Mitgelieferte Team-Bausteine (Wortwahl „Bewerbung als {position}“, Gespräch,
 * Probezeit). Whitelist und Beta haben für jede Kategorie eigene (kinds-seed.ts).
 * Für alle Arten gelten die KI-Zustimmung und GLOBAL_TEMPLATES.
 */
export const TEAM_ONLY_TEMPLATE_TITLES = [
  "Bewerbung ist angekommen",
  "Kurzer Zwischenstand",
  "Rückfrage zu deinen Antworten",
  "Terminvorschlag gesucht",
  "Erinnerung an den Gesprächstermin",
  "Wir warten auf deine Antwort",
  "Tipps für die nächste Bewerbung",
  "Portfolio / Link fehlt",
  "Einladung zum Gespräch",
  "Willkommen im Team",
  "Probezeit-Infos",
  "Absage (freundlich)",
  "Absage – zu wenig Zeit",
  "Absage – Mindestalter",
];

/**
 * Weitere Team-Bausteine (kinds = team), damit jede Kategorie gut gefüllt ist.
 * Werden per Migration ergänzt, falls sie (nach Titel) fehlen.
 */
export const TEAM_EXTRA_TEMPLATES: { category: TemplateCategory; title: string; body: string }[] = [
  {
    category: "EINGANG",
    title: "Bewerbung wird geprüft",
    body: "Moin {name},\n\nkurzes Update: Deine Bewerbung als **{position}** ({bewerbungs_id}) liegt jetzt bei {teammitglied} auf dem Tisch. Wir schauen sie uns in Ruhe an und melden uns – {bearbeitungszeit}.",
  },
  {
    category: "RUECKFRAGE",
    title: "Rückfrage zur Verfügbarkeit",
    body: "Moin {name},\n\neine Frage zu deiner Bewerbung als {position}: Wie viele Stunden pro Woche kannst du ungefähr einplanen, und an welchen Tagen bzw. Uhrzeiten bist du meistens online?\n\nAntworte einfach direkt im Portal unter „Meine Bewerbungen“.",
  },
  {
    category: "RUECKFRAGE",
    title: "Rückfrage zu einem Szenario",
    body: "Moin {name},\n\nbei einem Szenario aus deiner Bewerbung würden wir gern noch genauer verstehen, wie du vorgehen würdest:\n\n{grund}\n\nBeschreib uns bitte Schritt für Schritt, was du machen würdest – einfach im Portal antworten.",
  },
  {
    category: "EINLADUNG",
    title: "Termin bitte selbst buchen",
    body: "Moin {name},\n\ndeine Bewerbung als **{position}** hat uns überzeugt – wir möchten dich gern kennenlernen.\n\nSuch dir im Portal unter „Meine Bewerbungen“ einen freien Termin fürs Gespräch aus: {dashboard_link}\n\nDas Gespräch läuft auf unserem Discord im Sprachkanal, plan etwa 20–30 Minuten ein.",
  },
  {
    category: "EINLADUNG",
    title: "Gespräch verschoben",
    body: "Moin {name},\n\nbei uns ist leider etwas dazwischengekommen – wir müssen euer Gespräch verschieben. Neuer Termin: **{termin}**.\n\nPasst das nicht, sag kurz im Portal Bescheid, dann finden wir einen anderen.",
  },
  {
    category: "ANNAHME",
    title: "Probezeit bestanden",
    body: "Moin {name},\n\ngute Nachrichten: Deine Probezeit als **{position}** ist vorbei – und du bleibst fest im Team. Danke für deinen Einsatz in den letzten Wochen, schön, dass du dabei bist!",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage nach dem Gespräch",
    body: "Moin {name},\n\ndanke für das Gespräch und deine Zeit. Wir haben uns intensiv beraten und uns diesmal für andere Bewerber entschieden.\n\n{grund}\n\nDu kannst dich für {position} ab dem **{sperrfrist}** wieder bewerben – wir freuen uns, wenn du es nochmal versuchst.",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage – Stelle besetzt",
    body: "Moin {name},\n\ndanke für deine Bewerbung als {position}. Wir haben die freien Plätze inzwischen besetzt und können deshalb gerade niemanden mehr aufnehmen – an dir lag es nicht.\n\nWenn die Stelle wieder öffnet, steht das im Portal. Du kannst dich dort auch per DM benachrichtigen lassen.",
  },
  {
    category: "ERINNERUNG",
    title: "Erinnerung: Termin buchen",
    body: "Moin {name},\n\nkurze Erinnerung: Für deine Bewerbung als {position} fehlt noch ein Gesprächstermin. Such dir bitte in den nächsten Tagen einen freien Termin im Portal aus: {dashboard_link}",
  },
  {
    category: "SONSTIGES",
    title: "Danke fürs Gespräch",
    body: "Moin {name},\n\ndanke für das angenehme Gespräch! Wir besprechen uns jetzt im Team und melden uns {bearbeitungszeit} mit einer Entscheidung.",
  },
];

/**
 * Globale Bausteine – erscheinen bei jeder Bewerbungsart (kinds leer).
 * Neutral formuliert („deine Bewerbung“), ohne Gespräch, Probezeit o. Ä.
 */
export const GLOBAL_TEMPLATES: { category: TemplateCategory; title: string; body: string }[] = [
  {
    category: "EINGANG",
    title: "Danke für deine Geduld",
    body: "Moin {name},\n\ngerade kommen bei uns sehr viele Bewerbungen rein – deshalb dauert es bei {bewerbungs_id} etwas länger. Du musst nichts weiter tun, wir melden uns hier im Portal und per DM. Den aktuellen Stand siehst du jederzeit unter {dashboard_link}.",
  },
  {
    category: "RUECKFRAGE",
    title: "Antworten etwas ausführlicher",
    body: "Moin {name},\n\neinige deiner Antworten waren uns noch etwas zu knapp, um dich richtig einschätzen zu können:\n\n{grund}\n\nSchreib uns gern ein paar Sätze mehr dazu – einfach direkt im Portal unter „Meine Bewerbungen“ antworten.",
  },
  {
    category: "RUECKFRAGE",
    title: "Bitte dem Discord beitreten",
    body: "Moin {name},\n\nwir haben gesehen, dass du gerade nicht auf unserem Discord bist. Alles Weitere zu deiner Bewerbung läuft aber über Discord – tritt bitte wieder bei: {discord_link}",
  },
  {
    category: "RUECKFRAGE",
    title: "Discord-DMs öffnen",
    body: "Moin {name},\n\nunser Bot konnte dir keine Direktnachricht schicken. Damit du nichts verpasst: In Discord auf den Nordverkehr-Server rechtsklicken → „Privatsphäre-Einstellungen“ → „Direktnachrichten“ einschalten. Bis dahin findest du alles unter {dashboard_link}.",
  },
  {
    category: "ERINNERUNG",
    title: "Letzte Erinnerung",
    body: "Moin {name},\n\nwir haben zu deiner Bewerbung {bewerbungs_id} noch nichts von dir gehört. Wenn bis in ein paar Tagen keine Antwort kommt, schließen wir sie. Du kannst dich danach natürlich jederzeit neu bewerben.",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage – Angaben unvollständig",
    body: "Moin {name},\n\ndanke für deine Bewerbung als {position}. Leider fehlen uns zu viele Angaben, um sie fair zu bewerten – auch auf Nachfrage kam nichts mehr.\n\nDu kannst dich ab dem **{sperrfrist}** gern nochmal bewerben, dann am besten mit ausführlicheren Antworten.",
  },
  {
    category: "ABLEHNUNG",
    title: "Absage – kopierte Antworten",
    body: "Moin {name},\n\nbei deiner Bewerbung als {position} sind uns Antworten aufgefallen, die nicht in deinen eigenen Worten geschrieben sind. Uns ist wichtig, dich kennenzulernen – nicht einen fertigen Text.\n\nDeshalb können wir die Bewerbung so nicht annehmen. Ab dem **{sperrfrist}** kannst du dich wieder bewerben.",
  },
  {
    category: "SONSTIGES",
    title: "Danke für deine Nachricht",
    body: "Moin {name},\n\ndanke für deine Nachricht – ist angekommen. Wir schauen sie uns an und melden uns hier im Portal.",
  },
  {
    category: "SONSTIGES",
    title: "Zurückziehen bestätigt",
    body: "Moin {name},\n\nwir haben gesehen, dass du deine Bewerbung {bewerbungs_id} zurückgezogen hast – alles gut. Wenn du es dir anders überlegst, kannst du dich jederzeit wieder bewerben.",
  },
  {
    category: "SONSTIGES",
    title: "Stelle gerade geschlossen",
    body: "Moin {name},\n\nfür {position} nehmen wir gerade keine neuen Bewerbungen an. Sobald die Stelle wieder offen ist, steht das im Portal – dort kannst du dich auch per DM benachrichtigen lassen.",
  },
];

export const TEMPLATES: { category: TemplateCategory; title: string; body: string; kinds?: string[] }[] = [
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
    body: "Moin {name},\n\ndeine Bewerbung als **{position}** hat uns gefallen – wir wollen dich kennenlernen.\n\n**Termin:** {termin}\n**Wo:** Discord, Sprachkanal „Bewerbungsgespräche“\n**Mit:** {teammitglied}\n\nPlan etwa 20–30 Minuten ein. Passt der Termin nicht, sag einfach kurz Bescheid.",
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
    body: "Moin {name},\n\nkurze Erinnerung: Dein Gespräch ist am **{termin}** auf unserem Discord. Bis dann!",
  },
  {
    category: "ERINNERUNG",
    title: "Wir warten auf deine Antwort",
    body: "Moin {name},\n\nwir hatten dir zu deiner Bewerbung {bewerbungs_id} eine Frage gestellt und noch nichts gehört. Melde dich gern in den nächsten Tagen im Portal – sonst schließen wir die Bewerbung.",
  },
];
