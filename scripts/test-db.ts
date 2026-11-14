/**
 * Wegwerf-Datenbank für Integrationstests: legt auf demselben Postgres-Server
 * eine frische Datenbank `nvtest_<name>` an, spielt alle Migrationen ein und
 * lenkt `src/lib/db` darauf um. `drop()` löscht sie wieder.
 *
 * Basis-Server: TEST_DATABASE_URL oder DATABASE_URL (lokal: `npm run db:dev`).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createPrismaClient } from "../src/lib/db";

export async function freshTestDatabase(name: string) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("Ungültiger Testdatenbank-Name");
  const dbName = `nvtest_${name}`;
  const base = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/nordverkehr");
  if (!/^postgres(ql)?:$/.test(base.protocol)) throw new Error("Tests brauchen eine Postgres-URL (TEST_DATABASE_URL oder DATABASE_URL).");
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const target = new URL(base);
  target.pathname = `/${dbName}`;

  const a = createPrismaClient(admin.toString());
  try {
    await a.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await a.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await a.$disconnect();
  }
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: target.toString() }, stdio: "pipe", shell: true });
  if (r.status !== 0) throw new Error(`Migration der Testdatenbank fehlgeschlagen:\n${r.stdout}\n${r.stderr}`);

  // Nur noch diese Datenbank benutzen (Variablen mit Vorrang entfernen)
  for (const k of ["DATABASE_POSTGRES_PRISMA_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "DATABASE_POSTGRES_URL"]) delete process.env[k];
  process.env.DATABASE_URL = target.toString();

  return {
    url: target.toString(),
    async drop() {
      const { db } = await import("../src/lib/db");
      await db.$disconnect().catch(() => {});
      const c = createPrismaClient(admin.toString());
      await c.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
      await c.$disconnect();
    },
  };
}
