/**
 * @Erwähnungen in internen Kommentaren: `@benutzername` (Discord-Benutzername).
 * Erwähnte Teammitglieder bekommen eine DM mit Link zur Bewerbung.
 */
export const MAX_MENTIONS = 5;

/** Discord-Benutzernamen: 2–32 Zeichen, Kleinbuchstaben, Ziffern, Punkt, Unterstrich. */
const PATTERN = /(^|[^\w.@])@([a-z0-9._]{2,32})/gi;

/** Erwähnte Benutzernamen (klein, eindeutig, höchstens MAX_MENTIONS). Rein, für Tests. */
export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(PATTERN)) {
    out.add(m[2].toLowerCase().replace(/\.+$/, ""));
    if (out.size >= MAX_MENTIONS) break;
  }
  return [...out].filter((u) => u.length >= 2);
}

/** Angefangene Erwähnung direkt vor dem Cursor, z. B. „… @jo“ → "jo" (sonst null). */
export function mentionQueryAt(text: string, caret: number): string | null {
  const m = /(^|[^\w.@])@([a-z0-9._]{0,32})$/i.exec(text.slice(0, caret));
  return m ? m[2].toLowerCase() : null;
}

/**
 * Passt eine Erwähnung zu einer Person? Zuerst exakter Benutzername, dann Anzeigename
 * (ohne Leerzeichen/Punkte, z. B. @Kim → „Kim“, @kim.berg → „Kim Berg“). Rein, für Tests.
 */
export function matchMention<T extends { username: string; globalName: string | null }>(name: string, users: T[]): T | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s._-]/g, "");
  const n = name.toLowerCase();
  return users.find((u) => u.username.toLowerCase() === n) ?? users.find((u) => u.globalName && norm(u.globalName) === norm(n)) ?? null;
}
