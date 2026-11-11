import { PrismaClient } from "@prisma/client";

/**
 * Eine PrismaClient-Instanz pro Prozess (auch über Hot-Reloads hinweg).
 * Wird lazy erzeugt, damit `next build` ohne Datenbank durchläuft.
 * Datenbank: MongoDB (Replica Set, z. B. MongoDB Atlas) über DATABASE_URL.
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

export function getDb(): PrismaClient {
  if (!globalForPrisma.__nvPrisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL ist nicht gesetzt.");
    globalForPrisma.__nvPrisma = new PrismaClient({ datasourceUrl: withDatabaseName(url) });
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
