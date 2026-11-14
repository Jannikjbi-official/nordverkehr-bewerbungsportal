import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Eine PrismaClient-Instanz pro Prozess (auch über Hot-Reloads hinweg).
 * Wird lazy erzeugt, damit `next build` ohne Datenbank durchläuft.
 * Datenbank: PostgreSQL (z. B. Neon über die Vercel-Integration).
 */
const globalForPrisma = globalThis as unknown as { __nvPrisma?: PrismaClient };

const isPostgres = (url: string) => /^postgres(ql)?:\/\//i.test(url);

/**
 * Verbindung zur Laufzeit (über den Verbindungs-Pool). Reihenfolge:
 * Neon-Integration für Prisma (mit pgbouncer=true) → Standard-Variablen.
 * MongoDB-Adressen (alte Einrichtung) werden übersprungen.
 */
export const DATABASE_URL_KEYS = ["DATABASE_POSTGRES_PRISMA_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL", "POSTGRES_URL", "DATABASE_POSTGRES_URL"] as const;

/** Direkte Verbindung ohne Pool – für Migrationen (prisma migrate deploy). */
export const DIRECT_URL_KEYS = ["DATABASE_URL_UNPOOLED", "DATABASE_POSTGRES_URL_NON_POOLING", "POSTGRES_URL_NON_POOLING", "DIRECT_URL"] as const;

function firstPostgres(env: Record<string, string | undefined>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = env[key]?.trim();
    if (v && isPostgres(v)) return v;
  }
  return null;
}

/** Verbindungs-URL für die App finden. */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = firstPostgres(env, DATABASE_URL_KEYS);
  if (url) return url;
  throw new Error(`Keine Postgres-Datenbank-URL gesetzt (${DATABASE_URL_KEYS.join(" / ")}).`);
}

/** URL für Migrationen: direkte Verbindung, sonst die normale. */
export function resolveDirectUrl(env: Record<string, string | undefined> = process.env): string {
  return firstPostgres(env, DIRECT_URL_KEYS) ?? resolveDatabaseUrl(env);
}

/** Ist eine Datenbank eingerichtet? (ohne Fehler) */
export function hasDatabaseUrl(env: Record<string, string | undefined> = process.env): boolean {
  return !!firstPostgres(env, DATABASE_URL_KEYS);
}

/**
 * Prisma ohne native Query-Engine (engineType = "client"): Verbindung über den
 * Postgres-Treiber `pg`. Spart ~17 MB pro Server-Funktion.
 */
export function createPrismaClient(url: string = resolveDatabaseUrl()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export function getDb(): PrismaClient {
  globalForPrisma.__nvPrisma ??= createPrismaClient();
  return globalForPrisma.__nvPrisma;
}

/** Proxy, damit überall `db.user.findMany()` geschrieben werden kann. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Db = PrismaClient;
