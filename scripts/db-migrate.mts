/**
 * Datenbank-Schema einspielen: `prisma migrate deploy` (idempotent, nur
 * ausstehende Migrationen aus prisma/migrations). Läuft beim Bauen
 * (`npm run build`, auch auf Vercel) und lokal über `npm run db:push`.
 *
 * Nutzt die direkte Verbindung (ohne Pool) – bei Neon DATABASE_URL_UNPOOLED.
 * Ohne Datenbank-URL (z. B. Docker-Image bauen) wird übersprungen.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { hasDatabaseUrl, resolveDirectUrl } from "../src/lib/db";

if (!hasDatabaseUrl()) {
  console.log("[db] Keine Postgres-URL gesetzt – Migrationen übersprungen.");
  process.exit(0);
}
// Prisma CLI liest DATABASE_URL aus dem Schema
const env = { ...process.env, DATABASE_URL: resolveDirectUrl() };
const r = spawnSync("npx", ["prisma", "migrate", "deploy", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
