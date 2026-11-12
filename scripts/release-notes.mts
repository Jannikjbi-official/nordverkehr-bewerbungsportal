/**
 * Release-Notizen für GitHub aus dem Changelog (src/lib/changelog.ts):
 * alle Einträge NACH `since` (YYYY-MM-DD, Datum des letzten Releases) – leer = alle.
 *
 *   npx tsx scripts/release-notes.mts v1.0 [since]
 */
import { CHANGELOG, groupItems } from "../src/lib/changelog";

const [tag = "", since = ""] = process.argv.slice(2);
const entries = CHANGELOG.filter((e) => !since || e.date > since);
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
out.push(
  "---",
  "**Docker-Images** (unter *Packages*): `web` (Portal) und `worker` (Discord-Gateway, Zustellung, Löschfristen).",
  "Nach dem Update einmal `npm run db:push` gegen die Datenbank ausführen.",
);
console.log(out.join("\n"));
