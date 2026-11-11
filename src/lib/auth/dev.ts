/**
 * Dev-Login: nur für lokale Entwicklung ohne Discord-Application.
 * Doppelt abgesichert: niemals in Produktion, nur mit DEV_LOGIN=true.
 */
export function isDevLoginEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";
}
