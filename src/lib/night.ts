/**
 * Nachtruhe (Einstellungen → Nachtruhe, nur Admins): Im Zeitfenster (Standard
 * 22:00–10:00, deutsche Zeit) schläft das Team. Dann …
 *  - antwortet die KI auf Bewerber-Nachrichten (auch wenn jemand „online“ wirkt),
 *  - gehen DMs an Bewerber erst zum Ende der Nachtruhe raus (Bestätigung nach dem
 *    Absenden, Auto-Antworten und Gesprächserinnerungen vor Ende der Nachtruhe ausgenommen),
 *  - gehen Posts in die Team-Kanäle erst zum Ende der Nachtruhe raus,
 *  - sehen Bewerber im Portal einen Hinweis.
 * Rein und testbar: alle Funktionen bekommen „jetzt“ übergeben.
 */
import type { Settings } from "@/lib/settings";

export type NightSettings = Pick<
  Settings,
  "night.enabled" | "night.start" | "night.end" | "night.aiReply" | "night.holdApplicantDms" | "night.holdTeamPings" | "night.portalNotice"
>;

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

/** DM-Zwecke, die nachts zurückgehalten werden (an Bewerber bzw. Rundmails). */
const HELD_DM_PURPOSES = new Set(["team_message", "status", "notify", "reminder"]);

/**
 * Bis wann ein Zustellauftrag wegen Nachtruhe warten soll – oder null (sofort).
 *  - DMs: Team-Nachrichten, Statusmeldungen, Rundmails, Erinnerungen (außer `ignoreNight`)
 *  - Kanal-Posts (Bot-Log, Bewerbungs-Kanal, Teamchat, Threads)
 *  - Nie: Bestätigung nach dem Absenden, KI-/Auto-Antworten, Rollenvergabe
 */
export function nightHoldUntil(
  payload: { type: string; purpose?: string; ignoreNight?: boolean },
  s: NightSettings,
  now = new Date(),
): Date | null {
  if (!isNight(s, now) || payload.ignoreNight) return null;
  if (payload.type === "DM" && s["night.holdApplicantDms"] && HELD_DM_PURPOSES.has(payload.purpose ?? "")) return nightEndsAt(s, now);
  if (payload.type === "CHANNEL_MESSAGE" && s["night.holdTeamPings"]) return nightEndsAt(s, now);
  return null;
}
