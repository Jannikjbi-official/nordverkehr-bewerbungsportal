/**
 * Kalender-Abo für Teammitglieder: Gesprächstermine als iCalendar (.ics).
 * Adresse mit geheimem Schlüssel pro Person (Konto → „Kalender abonnieren“),
 * damit Kalender-Apps ohne Login abrufen können. Neuer Schlüssel = alter Link ungültig.
 * Enthält keine Bewerbernamen – nur Stelle, Bewerbungs-ID, Betreuer und Link.
 */
import { randomBytes } from "node:crypto";

export const newCalendarToken = () => randomBytes(24).toString("base64url");
export const isTokenShaped = (t: string) => /^[A-Za-z0-9_-]{30,40}$/.test(t);

export interface CalendarEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  url: string;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Text nach RFC 5545 entschärfen (Komma, Semikolon, Backslash, Zeilenumbruch) */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Zeilen über 75 Zeichen falten */
const fold = (line: string) => line.match(/.{1,74}/g)!.join("\r\n ");

export function buildIcs(events: CalendarEvent[], now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nordverkehr//Bewerbungsportal//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Nordverkehr Gespräche",
    "X-WR-TIMEZONE:Europe/Berlin",
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${e.uid}@nordverkehr-bewerbung`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(e.summary)}`,
      `DESCRIPTION:${esc(e.description)}`,
      `LOCATION:TeamSpeak`,
      `URL:${e.url}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
