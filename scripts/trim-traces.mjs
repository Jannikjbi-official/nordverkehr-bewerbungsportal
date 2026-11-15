/**
 * Nach `next build`: Die Ausschlüsse aus trace-excludes.json auch auf die Trace-Listen von
 * Middleware (Proxy) und Instrumentation anwenden. Next filtert dort nicht – Vercel packt diese
 * Dateien aber in JEDE Server-Funktion (ohne das ~60 MB Prisma-Engines für fremde Datenbanken pro Funktion).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const patterns = JSON.parse(readFileSync(new URL("../trace-excludes.json", import.meta.url), "utf8"));
// Glob → RegExp: ** = beliebige Pfade, * = innerhalb eines Ordners
const toRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");
const res = patterns.map(toRe);

let removed = 0;
for (const file of [".next/server/middleware.js.nft.json", ".next/server/instrumentation.js.nft.json"]) {
  if (!existsSync(file)) continue;
  const nft = JSON.parse(readFileSync(file, "utf8"));
  const before = nft.files.length;
  // Pfade in der Liste sind relativ zu .next/server – für den Vergleich ab node_modules/ abschneiden
  nft.files = nft.files.filter((f) => {
    const i = f.indexOf("node_modules/");
    return i < 0 || !res.some((r) => r.test(f.slice(i)));
  });
  removed += before - nft.files.length;
  writeFileSync(file, JSON.stringify(nft));
}
console.log(`[trim-traces] ${removed} unnötige Dateien aus Middleware/Instrumentation entfernt`);
