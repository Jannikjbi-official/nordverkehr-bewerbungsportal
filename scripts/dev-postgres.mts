/**
 * Lokale Postgres-Datenbank für die Entwicklung – ohne Installation
 * (Binaries kommen als npm-Paket). Spielt beim Start alle Migrationen ein.
 *
 *   npm run db:dev    →  postgresql://postgres:postgres@127.0.0.1:5433/nordverkehr
 *
 * Daten bleiben in ./.pg-data erhalten. Für Produktion: Neon (Vercel-Integration).
 * Port 5433, damit ein bereits installiertes Postgres (5432) nicht stört.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.DEV_PG_PORT ?? 5433);
const dir = process.env.DEV_PG_DIR ?? ".pg-data";
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: PORT, persistent: true });

if (!existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = 'nordverkehr'");
if (!exists.rowCount) await pg.createDatabase("nordverkehr");
await client.end();

const url = `postgresql://postgres:postgres@127.0.0.1:${PORT}/nordverkehr`;
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit", shell: true });
if (r.status !== 0) console.error("Migrationen fehlgeschlagen – siehe oben.");

console.log("Postgres läuft:");
console.log(`  DATABASE_URL="${url}"`);
console.log("Beenden mit Strg+C");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
