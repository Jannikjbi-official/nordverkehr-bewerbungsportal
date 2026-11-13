/**
 * Test der Übernahme MongoDB → Postgres gegen eine lokale MongoDB mit Altbestand.
 *
 *   npx tsx scripts/dev-mongo.mts          # alte lokale MongoDB (Replica Set)
 *   MONGO_TEST_URL=mongodb://127.0.0.1:27017/nordverkehr_ui?replicaSet=rs0&directConnection=true \
 *     npm run db:test-mongo-import
 */
import "dotenv/config";
import { freshTestDatabase } from "./test-db";
const testDb = await freshTestDatabase("mongoimport");
const { db } = await import("../src/lib/db");
const { bootstrapDatabase } = await import("../src/lib/setup/base-seed");
const { importFromMongo, mongoOverview, importOrder } = await import("../src/lib/setup/mongo-import");
let fails = 0;
const check = (ok: boolean, m: string) => { console.log(ok ? "✓" : "✗", m); if (!ok) fails++; };
const mongoUrl = process.env.MONGO_TEST_URL ?? "mongodb://127.0.0.1:27017/nordverkehr_ui?replicaSet=rs0&directConnection=true";
try {
  check(importOrder().findIndex((m) => m.name === "User") < importOrder().findIndex((m) => m.name === "Application"), "Reihenfolge: User vor Application");
  check(importOrder().findIndex((m) => m.name === "Application") < importOrder().findIndex((m) => m.name === "Answer"), "Reihenfolge: Application vor Answer");

  // Wie nach dem Deploy: erster Aufruf legt Basisdaten an, ein Admin loggt sich ein
  await bootstrapDatabase(db);
  await db.user.create({ data: { discordId: "999999999999999999", username: "admin-neu", discordCreatedAt: new Date() } });
  check((await db.position.count()) > 0, "Basisdaten vorhanden (wie nach dem ersten Aufruf)");

  const { counts } = await mongoOverview(mongoUrl);
  const r = await importFromMongo(db, mongoUrl, { log: (m) => console.log("  ·", m) });
  console.log(`  ${r.totalInserted}/${r.totalSource} Einträge in ${r.ms} ms, ${r.clearedRefs} Verweise geleert, ${r.filledRequired} Pflichtfelder ergänzt`);
  for (const t of r.tables) if (t.source !== t.inserted) console.log(`  ! ${t.model}: ${t.inserted}/${t.source} (${t.skipped} übersprungen)`);

  for (const [model, n] of Object.entries(counts)) {
    if (!n) continue;
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    const pg = await (db as unknown as Record<string, { count: () => Promise<number> }>)[key].count();
    check(pg === n || (model === "OutboxJob" && pg <= n), `${model}: ${pg} von ${n}`);
  }
  check(!(await db.user.findFirst({ where: { discordId: "999999999999999999" } })), "Daten seit dem Umzug ersetzt (Basisdaten/Logins)");

  // Verweise und Inhalte stichprobenartig
  const app = await db.application.findFirst({ where: { submittedAt: { not: null } }, include: { user: true, position: true, answers: true, messages: true } });
  check(!!app && !!app.user && !!app.position && app.answers.length > 0, `Bewerbung ${app?.publicId}: Nutzer, Stelle, ${app?.answers.length} Antworten`);
  const { getSettings, clearSettingsCache } = await import("../src/lib/settings");
  clearSettingsCache();
  const s = await getSettings();
  check(typeof s["night.start"] === "string", "Einstellungen lesbar");
  const { runMigrations } = await import("../src/lib/setup/migrations");
  check((await runMigrations(db)).length === 0, "Keine Migration läuft erneut (Markierungen übernommen)");
  // Zweiter Lauf ersetzt sauber (idempotent)
  const r2 = await importFromMongo(db, mongoUrl);
  check(r2.totalInserted === r.totalInserted, "Zweiter Lauf: gleiches Ergebnis");
} finally {
  await testDb.drop();
}
console.log(fails ? `\n${fails} Fehler` : "\nAlles grün");
process.exit(fails ? 1 : 0);
