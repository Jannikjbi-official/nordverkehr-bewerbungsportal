/**
 * Öffentliche Adressen, die auch im Browser gebraucht werden (ohne das Server-Env-Modul).
 * Andere Server setzen sie über NEXT_PUBLIC_*-Variablen.
 */
const MAIN_SITE = process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://nordverkehr.xyz";

/** Regelwerk (Formular-Bestätigung, KI-Hinweise) – Standard: <Hauptseite>/regeln */
export const RULES_URL = process.env.NEXT_PUBLIC_RULES_URL ?? `${MAIN_SITE}/regeln`;

/** Hostname einer URL (für erlaubte Links in KI-Antworten, Anzeige im Footer). */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
