/**
 * Nachtruhe (Admin-Bereich → Zustellung & Nachtruhe): Im Zeitfenster (Standard
 * 22:00–10:00, deutsche Zeit) schläft das Team. Dann …
 *  - antwortet die KI auf Bewerber-Nachrichten (auch wenn jemand „online“ wirkt),
 *  - warten ausgewählte Zustellarten bis zum Ende der Nachtruhe (Standard: nur
 *    Unwichtiges – Bot-Logs, Infos und Nachrichten gehen immer sofort raus),
 *  - sehen Bewerber im Portal einen Hinweis.
 * Rein und testbar: alle Funktionen bekommen „jetzt“ übergeben.
 */
import type { Settings } from "@/lib/settings";

export type NightSettings = Pick<Settings, "night.enabled" | "night.start" | "night.end" | "night.aiReply" | "night.held" | "night.portalNotice">;

const TZ = "Europe/Berlin";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Uhrzeit in Deutschland als Minuten seit Mitternacht. */
export function berlinMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Liegt `now` in der Nachtruhe? (Fenster darf über Mitternacht gehen) */
export function isNight(s: NightSettings, now = new Date()) {
  if (!s["night.enabled"]) return false;
  const start = toMinutes(s["night.start"]);
  const end = toMinutes(s["night.end"]);
  if (start === end) return false;
  const m = berlinMinutes(now);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** Abstand Berlin ↔ UTC in Minuten zu einem Zeitpunkt (Sommer-/Winterzeit). */
function berlinOffsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Nächstes Ende der Nachtruhe (erstes „HH:MM deutscher Zeit“ nach `now`). */
export function nightEndsAt(s: NightSettings, now = new Date()) {
  const end = toMinutes(s["night.end"]);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  for (let addDays = 0; addDays <= 1; addDays++) {
    // Berliner Ortszeit → UTC (zweimal angleichen, falls an dem Tag umgestellt wird)
    const local = Date.UTC(parts[0], parts[1] - 1, parts[2] + addDays, Math.floor(end / 60), end % 60);
    let t = local - berlinOffsetMinutes(new Date(local)) * 60_000;
    t = local - berlinOffsetMinutes(new Date(t)) * 60_000;
    if (t > now.getTime()) return new Date(t);
  }
  return new Date(now.getTime() + 24 * 3_600_000);
}

/** „10:00“ – für Hinweise. */
export const nightEndLabel = (s: Pick<Settings, "night.end">) => s["night.end"];

/**
 * Arten von Zustellungen. Pro Art legt der Admin fest, ob sie in der Nachtruhe
 * wartet (`night.held`). Standard: alles Wichtige geht immer sofort raus –
 * nur Changelog, Entwurfs-Erinnerungen und Rundmails „Stelle offen“ warten.
 * Immer sofort (nicht einstellbar): Bestätigung nach dem Absenden, Auto-Antworten, Rollen.
 */
export const DELIVERY_KINDS = [
  { key: "botlog", label: "Bot-Log", desc: "Protokoll im Bot-Log-Kanal: Statuswechsel, Claims, Nachrichten, Zustellfehler.", to: "team" },
  { key: "applications", label: "Neue Bewerbungen", desc: "Post im Bewerbungs-Kanal mit Knopf „Übernehmen“.", to: "team" },
  { key: "threads", label: "Threads", desc: "Gespiegelte Kommentare und Abschluss-Hinweise im Thread der Bewerbung.", to: "team" },
  { key: "summary", label: "Team-Übersicht & Leitung", desc: "Morgendliche Übersicht im Teamchat und Hinweis an die Leitung.", to: "team" },
  { key: "digest", label: "Morgen-DM an Betreuer", desc: "Persönliche DM mit den eigenen offenen Punkten.", to: "team" },
  { key: "changelog", label: "Changelog", desc: "Neue Portal-Versionen im Changelog-Kanal.", to: "team" },
  { key: "team_message", label: "Nachrichten vom Team", desc: "Was ein Teammitglied dem Bewerber schreibt (DM).", to: "applicant" },
  { key: "status", label: "Status-Infos", desc: "Automatische Infos an Bewerber, z. B. „Rückzug bestätigt“.", to: "applicant" },
  { key: "interview_reminder", label: "Gesprächserinnerungen", desc: "„Heute ist dein Gespräch“ am Morgen des Termins.", to: "applicant" },
  { key: "draft_reminder", label: "Entwurfs-Erinnerungen", desc: "Einmalige DM, wenn ein Entwurf liegen bleibt.", to: "applicant" },
  { key: "notify", label: "Rundmails „Stelle offen“", desc: "DM an alle Vorgemerkten, wenn eine Stelle öffnet.", to: "applicant" },
] as const;

export type DeliveryKind = (typeof DELIVERY_KINDS)[number]["key"];
export const DELIVERY_KIND_KEYS = DELIVERY_KINDS.map((k) => k.key) as [DeliveryKind, ...DeliveryKind[]];
export const DEFAULT_NIGHT_HELD: DeliveryKind[] = ["changelog", "draft_reminder", "notify"];

/** DM-Zweck → Art (Bestätigung/Auto-Antwort haben keine Art: immer sofort) */
const DM_KIND: Record<string, DeliveryKind | undefined> = {
  team_message: "team_message",
  status: "status",
  reminder: "interview_reminder",
  draft_reminder: "draft_reminder",
  notify: "notify",
  digest: "digest",
};

/** Art eines Zustellauftrags (oder null = immer sofort). */
export function deliveryKind(payload: { type: string; purpose?: string; kind?: string }): DeliveryKind | null {
  if (payload.type === "DM") return DM_KIND[payload.purpose ?? ""] ?? null;
  if (payload.type === "CHANNEL_MESSAGE") return (DELIVERY_KIND_KEYS as string[]).includes(payload.kind ?? "") ? (payload.kind as DeliveryKind) : "botlog";
  return null;
}

/** Wartet diese Art gerade (Nachtruhe aktiv und Art zurückgehalten)? */
export const isHeldNow = (kind: DeliveryKind, s: NightSettings, now = new Date()) => isNight(s, now) && s["night.held"].includes(kind);

/**
 * Bis wann ein Zustellauftrag wegen Nachtruhe warten soll – oder null (sofort).
 * `ignoreNight` erzwingt sofortige Zustellung (z. B. Gespräch vor Ende der Nachtruhe).
 */
export function nightHoldUntil(
  payload: { type: string; purpose?: string; kind?: string; ignoreNight?: boolean },
  s: NightSettings,
  now = new Date(),
): Date | null {
  if (payload.ignoreNight || !isNight(s, now)) return null;
  const kind = deliveryKind(payload);
  return kind && s["night.held"].includes(kind) ? nightEndsAt(s, now) : null;
}
