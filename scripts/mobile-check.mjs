/**
 * Handy-Check (CI): Seiten im iPhone-Format öffnen und prüfen,
 *  - dass keine Seite breiter als der Bildschirm ist (seitliches Wischen),
 *  - dass keine Fehler in der Browser-Konsole stehen.
 * Braucht ein laufendes Portal mit DEV_LOGIN=true und Seed-Daten (npm run db:seed).
 *   BASE_URL (Standard http://localhost:3000)
 * Playwright wird nur im CI installiert (keine Abhängigkeit im Projekt).
 */
import { createRequire } from "node:module";

// require statt import: findet Playwright auch global (NODE_PATH), ohne Projekt-Abhängigkeit
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TEAM_PAGES = [
  "/team", "/team/bewerbungen", "/team/bewerbungen?view=board", "/team/bewerbungen/vergleich", "/team/statistiken", "/team/termine",
  "/team/runden", "/team/verzeichnis", "/team/bausteine", "/team/positionen", "/team/audit", "/team/nutzer", "/team/hilfe",
  "/team/changelog", "/team/admin", "/team/admin/discord", "/team/admin/bewerbungen", "/team/admin/zustellung", "/team/admin/ki",
  "/team/admin/daten", "/team/admin/ideen", "/konto",
];
const APPLICANT_PAGES = ["/", "/dashboard", "/konto", "/ideen", "/passt-zu-mir", "/whitelist", "/beta"];
const PUBLIC_PAGES = ["/", "/login", "/datenschutz", "/impressum"];
// Bekannte, harmlose Konsolenmeldungen (z. B. fehlender Discord-Bot im CI)
const IGNORE = [/Discord/i, /favicon/i, /Failed to load resource.*(404|401)/i];

const browser = await chromium.launch();
let failed = 0;

async function session(login) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90_000);
  if (login) {
    await page.goto(`${BASE}/login?callbackUrl=%2Fkonto`);
    const buttons = page.locator("form button[type=submit]");
    const labels = await buttons.allTextContents();
    const i = labels.findIndex((l) => (login === "team" ? l.includes("· Team") : !l.includes("Team")));
    if (i < 0) throw new Error(`Kein Dev-Login für „${login}“ gefunden – Seed-Daten fehlen?`);
    await buttons.nth(i).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
  return page;
}

async function check(page, path) {
  const errors = [];
  const onConsole = (m) => m.type() === "error" && !IGNORE.some((r) => r.test(m.text())) && errors.push(m.text().slice(0, 200));
  const onError = (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`);
  page.on("console", onConsole);
  page.on("pageerror", onError);
  const res = await page.goto(BASE + path);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const W = screen.width;
    const sw = document.documentElement.scrollWidth;
    if (sw <= W + 1) return { sw, W, culprit: null };
    // Verursacher: Elemente, deren Ausblenden das Überlaufen beendet (tiefstes)
    const hits = [];
    for (const e of document.querySelectorAll("body *")) {
      if (getComputedStyle(e).display === "none") continue;
      const old = e.style.display;
      e.style.display = "none";
      const w = document.documentElement.scrollWidth;
      e.style.display = old;
      if (w <= W + 1) hits.push(e);
    }
    const deepest = hits.filter((c) => !hits.some((o) => o !== c && c.contains(o)));
    return { sw, W, culprit: deepest.map((e) => `<${e.tagName.toLowerCase()} class="${String(e.className).slice(0, 80)}">`).join(" | ") };
  });
  page.off("console", onConsole);
  page.off("pageerror", onError);
  const status = res?.status() ?? 0;
  const ok = r.sw <= r.W + 1 && errors.length === 0 && status < 500;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${path}  ${r.sw}/${r.W}px  HTTP ${status}`);
  if (r.sw > r.W + 1) console.log(`    zu breit → ${r.culprit}`);
  for (const e of [...new Set(errors)]) console.log(`    Konsole: ${e}`);
}

/** Erste Detailseite aus einer Liste dazunehmen (z. B. eine Bewerbung). */
async function firstLink(page, listPath, prefix) {
  await page.goto(BASE + listPath);
  const href = await page.locator(`a[href^="${prefix}"]`).first().getAttribute("href").catch(() => null);
  return href && href !== prefix ? href.split("#")[0] : null;
}

const team = await session("team");
const extra = [await firstLink(team, "/team/bewerbungen", "/team/bewerbungen/c"), await firstLink(team, "/team/positionen", "/team/positionen/c")].filter(Boolean);
for (const p of [...TEAM_PAGES, ...extra]) await check(team, p);

const applicant = await session("applicant");
const mine = await firstLink(applicant, "/dashboard", "/dashboard/c");
for (const p of [...APPLICANT_PAGES, ...(mine ? [mine] : [])]) await check(applicant, p);

const anon = await session(null);
for (const p of PUBLIC_PAGES) await check(anon, p);

await browser.close();
if (failed) {
  console.error(`\n${failed} Seite(n) mit Problemen am Handy.`);
  process.exit(1);
}
console.log("\nAlle Seiten passen aufs Handy.");
