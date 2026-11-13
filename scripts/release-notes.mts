/**
 * Release-Notizen für GitHub aus dem Changelog (src/lib/changelog.ts):
 * alle Versionen NACH dem letzten Release (z. B. v1.0) bis einschließlich dieser – leer = alle.
 * Verglichen wird die Versionsnummer, nicht das Datum (mehrere Versionen an einem Tag).
 *
 *   npx tsx scripts/release-notes.mts v1.2 [v1.0]
 */
import { CHANGELOG, groupItems } from "../src/lib/changelog";

const [tag = "", previous = ""] = process.argv.slice(2);
/** „v1.2“ / „1.2.3“ → [1, 2, 3]; Vergleich Stelle für Stelle */
const parts = (v: string) => v.replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
export const compareVersions = (a: string, b: string) => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
const entries = CHANGELOG.filter((e) => (!previous || compareVersions(e.version, previous) > 0) && (!tag || compareVersions(e.version, tag) <= 0));
const md = (t: string) => t.replace(/\{/g, "`{").replace(/\}/g, "}`");

const out: string[] = [];
out.push(`Größeres Update des Nordverkehr-Bewerbungsportals${tag ? ` (${tag})` : ""}.`, "");
if (!entries.length) out.push("_Keine neuen Changelog-Einträge seit dem letzten Release._");
for (const e of entries) {
  out.push(`## Version ${e.version} – ${new Date(`${e.date}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}${e.title ? ` · ${e.title}` : ""}`);
  for (const g of groupItems(e.items)) {
    out.push("", `### ${g.emoji} ${g.label}`);
    for (const i of g.items) out.push(`- ${md(i.text)}`);
  }
  out.push("");
}
out.push("---", "Nach dem Update einmal `npm run db:push` gegen die Datenbank ausführen.");
console.log(out.join("\n"));
