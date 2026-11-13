import { isAuthorizedCron } from "@/lib/cron";
import { runRetention } from "@/lib/retention";
import { db } from "@/lib/db";
import { bootstrapDatabase } from "@/lib/setup/base-seed";

export const maxDuration = 60;

/** Täglich: Datenbank-Einrichtung prüfen + automatische Löschfristen. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  // Ausstehende Daten-Migrationen (und eine leere Datenbank mit Basisdaten füllen)
  const setup = await bootstrapDatabase(db);
  return Response.json({ setup, retention: await runRetention() });
}
