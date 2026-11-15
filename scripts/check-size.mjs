/**
 * Größen-Check nach `next build` (CI): Server-Teil (.next/server) gegen Grenzwerte.
 * Vercel erlaubt 250 MB pro Server-Funktion – wir bleiben deutlich darunter.
 *   SIZE_WARN_MB (Standard 60): Warnung
 *   SIZE_MAX_MB  (Standard 90): Fehler
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dirSize = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = join(dir, e.name);
    return sum + (e.isDirectory() ? dirSize(p) : e.isFile() ? statSync(p).size : 0);
  }, 0);

const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;
const server = mb(dirSize(".next/server"));
const statics = mb(dirSize(".next/static"));
const warn = Number(process.env.SIZE_WARN_MB ?? 60);
const max = Number(process.env.SIZE_MAX_MB ?? 90);

// Größte Einzeldateien (Hinweis, wo es wächst)
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile()) files.push([p, statSync(p).size]);
  }
};
walk(".next/server");
files.sort((a, b) => b[1] - a[1]);

console.log(`Server-Teil: ${server} MB (Warnung ab ${warn} MB, Fehler ab ${max} MB) · Static: ${statics} MB`);
console.log("Größte Dateien:");
for (const [p, s] of files.slice(0, 5)) console.log(`  ${mb(s)} MB  ${p}`);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(summary, `### Build-Größe\n\n| Teil | Größe |\n|---|---|\n| Server (.next/server) | ${server} MB |\n| Static | ${statics} MB |\n\n`);
}

if (server > max) {
  console.error(`::error::Server-Teil ist ${server} MB – über dem Limit von ${max} MB. Neue große Pakete prüfen.`);
  process.exit(1);
}
if (server > warn) console.warn(`::warning::Server-Teil ist ${server} MB – über der Warnschwelle von ${warn} MB.`);
