import { PrismaClient } from "@prisma/client";

/**
 * Eine PrismaClient-Instanz pro Prozess (auch über Hot-Reloads hinweg).
 * Wird lazy erzeugt, damit `next build` ohne Datenbank durchläuft.
 * Datenbank: MongoDB (Replica Set, z. B. MongoDB Atlas) über DATABASE_URL.
 */
const globalForPrisma = globalThis as unknown as { __nvPrisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma.__nvPrisma) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ist nicht gesetzt.");
    globalForPrisma.__nvPrisma = new PrismaClient();
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
