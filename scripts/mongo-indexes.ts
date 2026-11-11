/**
 * MongoDB-Indizes, die Prisma nicht im Schema abbilden kann.
 * Wird von `npm run db:push` automatisch ausgeführt (idempotent).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const OPEN = ["DRAFT", "SUBMITTED", "IN_REVIEW", "INTERVIEW"];

export async function ensureIndexes(db: PrismaClient) {
  // Pro Discord-Account nur eine offene Bewerbung (inkl. Entwurf) pro Position
  await db.$runCommandRaw({
    createIndexes: "Application",
    indexes: [
      {
        key: { userId: 1, positionId: 1 },
        name: "one_open_per_position",
        unique: true,
        partialFilterExpression: { status: { $in: OPEN } },
      },
    ],
  });
  // Abgelaufene Rate-Limit-Einträge räumt MongoDB selbst auf (TTL)
  await db.$runCommandRaw({
    createIndexes: "RateLimit",
    indexes: [{ key: { resetAt: 1 }, name: "ttl_resetAt", expireAfterSeconds: 3600 }],
  });
}

if (process.argv[1]?.includes("mongo-indexes")) {
  const db = new PrismaClient();
  ensureIndexes(db)
    .then(() => console.log("✓ MongoDB-Indizes angelegt"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
