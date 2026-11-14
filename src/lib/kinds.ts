/**
 * Bewerbungsarten: Team, Whitelist, Beta. Jede Art ist ein ApplicationType
 * (key) mit eigenen Stellen, Abschnitten und Fragen. Hier steht, was pro Art
 * dazugehört – ohne Server-Abhängigkeiten (auch im Browser nutzbar).
 *
 *  - team:      Formular → Gespräch → Annahme, danach Einarbeitung/Probezeit/Pate
 *  - whitelist: Formular (Regel-Quiz, RP) → Whitelist-Gespräch → Annahme (Rolle)
 *  - beta:      kurzes Formular → Annahme (Rolle), kein Gespräch, begrenzte Plätze
 */
export type KindKey = "team" | "whitelist" | "beta";

export type ConfirmationKey = "voice" | "rules" | "unpaid" | "truth" | "privacy" | "betaTest";

export interface KindConfig {
  key: KindKey;
  /** Kurzname, z. B. für Filter und Abzeichen */
  label: string;
  /** „Team-Bewerbung“, „Whitelist-Bewerbung“ … */
  noun: string;
  /** Gibt es die Phase „Gespräch“? */
  interview: boolean;
  /** Einarbeitung, Probezeit, Pate, Team-Verzeichnis, Begrüßung im Teamchat, Zusatzrollen/Präfix */
  teamFeatures: boolean;
  /** Bestätigungen vor dem Absenden */
  confirmations: ConfirmationKey[];
  /** Status-Hinweis nach der Annahme (Bewerber-Dashboard) */
  acceptedHint: string;
  /** Kurzbeschreibung für Startseite und Übersicht */
  teaser: string;
  /** Öffentliche Seite (Kurz-Link) */
  path: string;
  /** Eigene Eingangsbestätigung (DM + Portal); ohne Angabe: Text aus dem Admin-Bereich */
  confirmationTemplate?: string;
}

export const KINDS: Record<KindKey, KindConfig> = {
  team: {
    key: "team",
    label: "Team",
    noun: "Team-Bewerbung",
    interview: true,
    teamFeatures: true,
    confirmations: ["voice", "rules", "unpaid", "truth", "privacy"],
    acceptedHint: "Willkommen im Team! Alles Weitere bekommst du per Nachricht.",
    teaser: "Support, Moderation, Entwicklung & mehr – bau Nordverkehr mit auf. Ehrenamtlich, mit Gespräch auf Discord.",
    path: "/#positionen",
  },
  whitelist: {
    key: "whitelist",
    label: "Whitelist",
    noun: "Whitelist-Bewerbung",
    interview: true,
    teamFeatures: false,
    confirmations: ["voice", "rules", "truth", "privacy"],
    acceptedHint: "Du bist gewhitelistet – willkommen in Hamburg! Alles Weitere bekommst du per Nachricht.",
    teaser: "Du willst auf Nordverkehr spielen? Erzähl uns von dir und deinem Charakter – danach kurzes Gespräch auf Discord.",
    path: "/whitelist",
    confirmationTemplate: `Moin {name},

danke für deine Whitelist-Bewerbung bei Nordverkehr – sie ist am {datum} bei uns eingegangen.

**Bewerbungs-ID:** {bewerbungs_id}

**So geht's weiter:**
1. Das Team liest sich deine Bewerbung in Ruhe durch.
2. Bei Rückfragen melden wir uns hier per DM oder im Portal.
3. Passt es, laden wir dich zu einem kurzen Whitelist-Gespräch auf unserem Discord ein.

Die Bearbeitung dauert {bearbeitungszeit}. Den aktuellen Stand siehst du jederzeit in deinem Dashboard.

Moin, dein Nordverkehr-Team`,
  },
  beta: {
    key: "beta",
    label: "Beta",
    noun: "Beta-Bewerbung",
    interview: false,
    teamFeatures: false,
    confirmations: ["voice", "rules", "betaTest", "truth", "privacy"],
    acceptedHint: "Du bist in der Beta dabei – danke fürs Testen! Alles Weitere bekommst du per Nachricht.",
    teaser: "Teste den Server vor dem Start, finde Fehler und gib Feedback. Begrenzte Plätze, kein Gespräch.",
    path: "/beta",
    confirmationTemplate: `Moin {name},

danke für deine Bewerbung zum Beta-Test – sie ist am {datum} bei uns eingegangen.

**Bewerbungs-ID:** {bewerbungs_id}

Die Plätze sind begrenzt: Das Team stellt eine gute Mischung an Testern zusammen und meldet sich per DM – ein Gespräch gibt es nicht. Den aktuellen Stand siehst du jederzeit in deinem Dashboard.

Moin, dein Nordverkehr-Team`,
  },
};

export const KIND_KEYS = Object.keys(KINDS) as KindKey[];

/** Konfiguration zu einem ApplicationType-Key (unbekannt → wie Team). */
export function kindOf(key: string | null | undefined): KindConfig {
  return KINDS[(key ?? "team") as KindKey] ?? KINDS.team;
}

/** Feste Stellen der Arten Whitelist/Beta (je eine). */
export const KIND_POSITION_SLUG: Partial<Record<KindKey, string>> = { whitelist: "whitelist", beta: "beta" };
