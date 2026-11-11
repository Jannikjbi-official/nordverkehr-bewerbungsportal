import { PrismaClient } from "@prisma/client";

/**
 * Eine PrismaClient-Instanz pro Prozess (auch über Hot-Reloads hinweg).
 * Wird lazy erzeugt, damit `next build` ohne Datenbank durchläuft.
 * Datenbank: MongoDB (Replica Set, z. B. MongoDB Atlas) über DATABASE_URL
 * (oder die Variable der Vercel-Atlas-Integration, siehe resolveDatabaseUrl).
 */
const globalForPrisma = globalThis as unknown as { __nvPrisma?: PrismaClient };

export const DEFAULT_DB_NAME = "nordverkehr";

/**
 * Prisma braucht einen Datenbanknamen im Connection String. Die Vercel-Atlas-
 * Integration liefert oft `…mongodb.net/?retryWrites=true` ohne Namen –
 * dann wird `nordverkehr` ergänzt.
 */
export function withDatabaseName(url: string, name = DEFAULT_DB_NAME): string {
  const match = url.match(/^(mongodb(?:\+srv)?:\/\/[^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/);
  if (!match) return url;
  const [, base, path, query = ""] = match;
  if (path && path !== "/") return url;
  return `${base}/${name}${query}`;
}

/** Variablennamen, unter denen die Verbindung stehen darf (Vercel-Atlas-Integration legt eigene an). */
export const DATABASE_URL_KEYS = ["DATABASE_URL", "DATABASE_URL_MONGODB_URI", "MONGODB_URI"] as const;

/** Verbindungs-URL finden und um den Datenbanknamen ergänzen. */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  for (const key of DATABASE_URL_KEYS) {
    const v = env[key];
    if (v && v.trim()) return withDatabaseName(v.trim());
  }
  throw new Error(`Keine Datenbank-URL gesetzt (${DATABASE_URL_KEYS.join(" / ")}).`);
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.__nvPrisma) {
    globalForPrisma.__nvPrisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });
  }
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
