/**
 * Discord hängt beim OAuth-Callback inzwischen `iss` (RFC 9207) an. Auth.js
 * behandelt Discord als reines OAuth-2-Provider mit Platzhalter-Issuer und
 * lehnt den Callback dann ab ("unexpected iss response parameter value").
 *
 * Wir prüfen, dass der Parameter wirklich von Discord stammt, und entfernen
 * ihn vor der Übergabe an Auth.js. Da es nur einen OAuth-Anbieter gibt, ist der
 * Schutz vor Mix-up-Angriffen, den `iss` bietet, hier nicht nötig.
 */
const DISCORD_ISSUER = /^https:\/\/(?:[a-z0-9-]+\.)?discord(?:app)?\.com\/?$/i;

export type IssResult = { action: "keep" } | { action: "strip"; url: URL } | { action: "reject" };

export function handleDiscordIss(input: URL): IssResult {
  if (!/\/callback\/discord\/?$/.test(input.pathname)) return { action: "keep" };
  const iss = input.searchParams.get("iss");
  if (iss === null) return { action: "keep" };
  if (!DISCORD_ISSUER.test(iss)) return { action: "reject" };
  const url = new URL(input);
  url.searchParams.delete("iss");
  return { action: "strip", url };
}
