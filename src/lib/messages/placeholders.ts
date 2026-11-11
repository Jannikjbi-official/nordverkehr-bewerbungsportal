/**
 * Platzhalter in Nachrichtenbausteinen. Rein, ohne Server-Abhängigkeiten –
 * wird auch im Browser für die Live-Vorschau verwendet.
 */
export const PLACEHOLDERS = [
  { key: "name", label: "Anzeigename des Bewerbers" },
  { key: "discord_tag", label: "Discord-Benutzername (@name)" },
  { key: "position", label: "Position" },
  { key: "bewerbungs_id", label: "Bewerbungs-ID" },
  { key: "datum", label: "Eingangsdatum" },
  { key: "termin", label: "Gesprächstermin" },
  { key: "teammitglied", label: "Dein Name" },
  { key: "grund", label: "Begründung (frei)" },
  { key: "sperrfrist", label: "Sperrfrist / erneut bewerben ab" },
  { key: "bearbeitungszeit", label: "Ungefähre Bearbeitungszeit" },
  { key: "dashboard_link", label: "Link zum Status" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];
export type TemplateVars = Partial<Record<PlaceholderKey, string | null | undefined>>;

const KNOWN = new Set<string>(PLACEHOLDERS.map((p) => p.key));
const PATTERN = /\{([a-z_]+)\}/g;

export interface RenderResult {
  text: string;
  /** Bekannte Platzhalter ohne Wert – bleiben sichtbar stehen. */
  missing: PlaceholderKey[];
}

export function renderTemplate(text: string, vars: TemplateVars): RenderResult {
  const missing = new Set<PlaceholderKey>();
  const out = text.replace(PATTERN, (match, key: string) => {
    if (!KNOWN.has(key)) return match; // unbekannte Klammern unangetastet lassen
    const value = vars[key as PlaceholderKey];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.add(key as PlaceholderKey);
      return match;
    }
    return String(value);
  });
  return { text: out, missing: [...missing] };
}

/** Mehrere Bausteine zu einem Text kombinieren (Absatz dazwischen). */
export function combineTemplates(bodies: string[]): string {
  return bodies
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function findPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PATTERN)].map((m) => m[1]).filter((k) => KNOWN.has(k)))];
}

const TZ = "Europe/Berlin";

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: TZ }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date(d)) + " Uhr";
}

export interface VarsInput {
  applicant: { username: string; globalName: string | null };
  positionTitle: string;
  publicId: string | null;
  submittedAt: Date | string | null;
  interviewAt?: Date | string | null;
  teamMemberName?: string | null;
  reason?: string | null;
  cooldownUntil?: Date | string | null;
  processingTime?: string | null;
  dashboardUrl?: string | null;
}

export function buildTemplateVars(input: VarsInput): TemplateVars {
  return {
    name: input.applicant.globalName || input.applicant.username,
    discord_tag: `@${input.applicant.username}`,
    position: input.positionTitle,
    bewerbungs_id: input.publicId ?? undefined,
    datum: formatDate(input.submittedAt),
    termin: input.interviewAt ? formatDateTime(input.interviewAt) : undefined,
    teammitglied: input.teamMemberName ?? undefined,
    grund: input.reason ?? undefined,
    sperrfrist: input.cooldownUntil ? formatDate(input.cooldownUntil) : undefined,
    bearbeitungszeit: input.processingTime ?? undefined,
    dashboard_link: input.dashboardUrl ?? undefined,
  };
}
