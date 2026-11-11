/**
 * Zentrale Fragen-Definition.
 *
 * - Allgemeine Fragen sind EINMAL definiert (positionId = null) und werden für
 *   jede Position automatisch vorangestellt – nie pro Position kopiert.
 * - Positionsspezifische Abschnitte enthalten nur Fachfragen.
 * - Jede Frage und jeder Abschnitt hat einen eindeutigen Key. Über den Key
 *   werden Duplikate entfernt und allgemeine Antworten wiederverwendet.
 */
import type { QuestionType } from "@prisma/client";

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
        key: "availability_hours",
        label: "Wie viele Stunden pro Woche kannst du realistisch fürs Team einplanen?",
        type: "SELECT",
        helpText: "Ehrlich bleiben – lieber weniger zusagen und dafür verlässlich sein.",
        options: ["unter 5 Stunden", "5–10 Stunden", "10–20 Stunden", "über 20 Stunden"],
      },
      {
        key: "availability_times",
        label: "Wann bist du meistens erreichbar?",
        type: "MULTI_SELECT",
        options: ["Wochentags vormittags", "Wochentags nachmittags", "Wochentags abends", "Am Wochenende"],
        minValue: 1,
      },
      {
        key: "about_me",
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
        key: "experience_teams",
        label: "Welche Erfahrung hast du in anderen Teams oder Projekten?",
        type: "LONG_TEXT",
        helpText:
          "Server, Communities, Events, Vereine, Projekte – alles zählt. Keine Erfahrung ist auch okay, dann sag das.",
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
      { key: "strengths", label: "Was sind deine Stärken?", type: "LONG_TEXT", minLength: 40, maxLength: 1200 },
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
        key: "scenario_insult",
        label: "Jemand beleidigt dich – im Ticket, im Voice oder ingame. Wie reagierst du?",
        type: "SCENARIO",
        minLength: 80,
        maxLength: 2000,
      },
      {
        key: "scenario_rule_friend",
        label: "Ein Freund von dir bricht eine Regel und du bekommst es mit. Was machst du?",
        type: "SCENARIO",
        minLength: 80,
        maxLength: 2000,
      },
      {
        key: "scenario_team_conflict",
        label: "Zwei Teammitglieder sind sich öffentlich uneinig über eine Entscheidung. Wie gehst du damit um?",
        type: "SCENARIO",
        minLength: 80,
        maxLength: 2000,
      },
    ],
  },
];

/** Fachfragen je Position (Slug → Abschnitte). Keine Wiederholung allgemeiner Fragen! */
export const POSITION_SECTIONS: Record<string, SeedSection[]> = {
  support: [
    {
      key: "support.fach",
      title: "Fachfragen",
      questions: [
        {
          key: "support.newbie",
          label: "Ein neuer Spieler hat noch nie RP gespielt. Wie erklärst du ihm den Einstieg?",
          type: "LONG_TEXT",
          minLength: 80,
          maxLength: 2000,
        },
        {
          key: "support.tickets",
          label: "Wie viele Support-Tickets hast du ungefähr schon bearbeitet?",
          type: "SELECT",
          options: ["Noch keine", "Unter 50", "50–500", "Über 500"],
        },
      ],
    },
  ],
  moderator: [
    {
      key: "moderator.fach",
      title: "Moderation",
      questions: [
        {
          key: "moderator.powergaming",
          label: "Während einer Verfolgungsjagd fällt dir Powergaming auf. Wann und wie greifst du ein?",
          type: "SCENARIO",
          minLength: 100,
          maxLength: 2000,
        },
        {
          key: "moderator.rules_knowledge",
          label: "Wie gut kennst du unser Regelwerk?",
          type: "SELECT",
          options: ["Einmal überflogen", "Gelesen und verstanden", "Kenne ich sehr genau"],
        },
      ],
    },
  ],
  entwickler: [
    {
      key: "entwickler.fach",
      title: "Entwicklung",
      questions: [
        {
          key: "entwickler.stack",
          label: "Mit welchen Sprachen und Technologien arbeitest du?",
          type: "MULTI_SELECT",
          options: ["Lua", "JavaScript / TypeScript", "C#", "SQL", "React / Vue", "Andere"],
          minValue: 1,
        },
        {
          key: "entwickler.platforms",
          label: "Für welche Plattformen hast du schon entwickelt?",
          type: "MULTI_SELECT",
          options: ["FiveM", "RageMP", "alt:V", "Andere", "Noch keine"],
          minValue: 1,
        },
        { key: "entwickler.github", label: "Link zu deinem GitHub oder Portfolio", type: "URL", placeholder: "https://github.com/…" },
        {
          key: "entwickler.project",
          label: "Beschreib ein technisches Projekt (Code), auf das du stolz bist – deine Rolle und was du gelernt hast.",
          type: "LONG_TEXT",
          minLength: 100,
          maxLength: 2500,
        },
      ],
    },
  ],
  media: [
    {
      key: "media.fach",
      title: "Content",
      questions: [
        {
          key: "media.platforms",
          label: "Auf welchen Plattformen kennst du dich aus?",
          type: "MULTI_SELECT",
          options: ["TikTok", "Instagram", "YouTube", "Twitch", "X / Twitter"],
          minValue: 1,
        },
        { key: "media.portfolio", label: "Link zu deinen Arbeiten", type: "URL", placeholder: "https://…" },
        {
          key: "media.idea",
          label: "Welche Content-Idee würdest du als Erstes für Nordverkehr umsetzen?",
          type: "LONG_TEXT",
          minLength: 80,
          maxLength: 2000,
        },
        {
          key: "media.samples",
          label: "Screenshots oder Thumbnails (optional)",
          type: "FILE",
          required: false,
          helpText: "Bis zu 5 Bilder (JPG, PNG, WebP), je max. 8 MB.",
        },
      ],
    },
  ],
  mapper: [
    {
      key: "mapper.fach",
      title: "Mapping",
      questions: [
        {
          key: "mapper.tools",
          label: "Mit welchen Tools arbeitest du?",
          type: "MULTI_SELECT",
          options: ["CodeWalker", "Blender", "Sollumz", "3ds Max", "ZModeler", "Andere"],
          minValue: 1,
        },
        {
          key: "mapper.screenshots",
          label: "Screenshots deiner Arbeiten",
          type: "FILE",
          helpText: "Bis zu 5 Bilder (JPG, PNG, WebP), je max. 8 MB. Metadaten werden automatisch entfernt.",
        },
        { key: "mapper.portfolio", label: "Portfolio-Link (optional)", type: "URL", required: false, placeholder: "https://…" },
      ],
    },
  ],
  eventteam: [
    {
      key: "eventteam.fach",
      title: "Events",
      questions: [
        {
          key: "eventteam.idea",
          label: "Beschreib ein Event, das du gern auf Nordverkehr veranstalten würdest.",
          type: "LONG_TEXT",
          minLength: 120,
          maxLength: 2500,
        },
      ],
    },
  ],
};

/** Allgemeine Abschnitts-Keys (für Wiederverwendung). */
export const GENERAL_SECTION_KEYS = GENERAL_SECTIONS.map((s) => s.key);

/**
 * Migration: alte Fragetexte (normalisiert) → neuer Key. Fragen ohne Treffer
 * und ohne Key bleiben unverändert (z. B. eigene Fragen aus dem Builder).
 */
export const LEGACY_LABELS: Record<string, string> = {
  "wie sollen wir dich nennen": "callname",
  "wie viele stunden pro woche kannst du realistisch furs team einplanen": "availability_hours",
  "wann bist du meistens erreichbar": "availability_times",
  "erzahl kurz etwas uber dich": "about_me",
  "welche erfahrung hast du in anderen teams oder projekten": "experience_teams",
  "warum willst du ausgerechnet bei nordverkehr ins team": "motivation",
  "was sind deine starken": "strengths",
  "woran arbeitest du noch": "weaknesses",
  "ein spieler beleidigt dich im support ticket wie reagierst du": "scenario_insult",
  "jemand beleidigt dich im ticket im voice oder ingame wie reagierst du": "scenario_insult",
  "ein freund von dir bricht eine regel und du bekommst es mit was machst du": "scenario_rule_friend",
  "zwei teammitglieder sind sich offentlich uneinig uber eine entscheidung wie gehst du damit um": "scenario_team_conflict",
  "ein neuer spieler hat noch nie rp gespielt wie erklarst du ihm den einstieg": "support.newbie",
  "wie viel support erfahrung hast du ungefahr": "support.tickets",
  "wie viele support tickets hast du ungefahr schon bearbeitet": "support.tickets",
  "wahrend einer verfolgungsjagd fallt dir powergaming auf wann und wie greifst du ein": "moderator.powergaming",
  "wie gut kennst du unser regelwerk": "moderator.rules_knowledge",
  "mit welchen sprachen und technologien arbeitest du": "entwickler.stack",
  "link zu deinem github oder portfolio": "entwickler.github",
  "beschreib ein projekt auf das du stolz bist": "entwickler.project",
  "hast du schon fur fivem oder andere multiplayer plattformen entwickelt": "entwickler.platforms",
  "fur welche plattformen hast du schon entwickelt": "entwickler.platforms",
  "auf welchen plattformen kennst du dich aus": "media.platforms",
  "link zu deinen arbeiten": "media.portfolio",
  "welche content idee wurdest du als erstes fur nordverkehr umsetzen": "media.idea",
  "screenshots oder thumbnails optional": "media.samples",
  "mit welchen tools arbeitest du": "mapper.tools",
  "screenshots deiner arbeiten": "mapper.screenshots",
  "portfolio link optional": "mapper.portfolio",
  "beschreib ein event das du gern auf nordverkehr veranstalten wurdest": "eventteam.idea",
  "hast du schon events organisiert erzahl kurz": "eventteam.experience",
};

/** Diese Fragen entfallen (werden archiviert, Antworten bleiben erhalten). */
export const RETIRED_KEYS = ["callname", "eventteam.experience"];

/** Alte Abschnittstitel → Key (für Migration). */
export const LEGACY_SECTION_TITLES: Record<string, string> = {
  "uber dich": "about",
  "erfahrung motivation": "experience",
  szenarien: "scenarios",
};

/** Normalisierung für Text-Vergleiche (Groß/Klein, Umlaute, Satzzeichen). */
export function normalizeLabel(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
