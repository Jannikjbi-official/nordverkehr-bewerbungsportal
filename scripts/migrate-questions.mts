/**
 * Fragen bereinigen (Keys, Duplikate zusammenführen, umformulierte Fragen).
 *
 *   npm run db:migrate-questions            # Probelauf: zeigt nur, was passieren würde
 *   npm run db:migrate-questions -- --apply # ausführen (einmalig, wird markiert)
 *
 * Auf Vercel läuft dieselbe Migration automatisch beim Serverstart.
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { migrateQuestionsV2, runMigrations } from "../src/lib/setup/migrations";

const apply = process.argv.includes("--apply");
const db = createPrismaClient();
try {
  if (!apply) {
    console.log("PROBELAUF – es wird nichts geändert. Mit --apply ausführen.\n");
    await migrateQuestionsV2(db, { dryRun: true, log: console.log });
  } else {
    const done = await runMigrations(db, { log: console.log });
    console.log(done.length ? `✓ Ausgeführt: ${done.join(", ")}` : "Nichts zu tun (bereits ausgeführt oder gesperrt).");
  }
} finally {
  await db.$disconnect();
}
