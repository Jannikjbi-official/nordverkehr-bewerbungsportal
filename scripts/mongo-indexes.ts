/**
 * MongoDB-Indizes anlegen (idempotent). Wird von `npm run db:push` ausgeführt.
 * Die Definitionen liegen in src/lib/setup/indexes.ts (auch für die Einrichtung auf Vercel).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "../src/lib/db";
import { ensureIndexes } from "../src/lib/setup/indexes";

export { ensureIndexes };

if (process.argv[1]?.includes("mongo-indexes")) {
  const db = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });
  ensureIndexes(db)
    .then(() => console.log("✓ MongoDB-Indizes angelegt"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
