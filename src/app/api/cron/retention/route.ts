import { isAuthorizedCron } from "@/lib/cron";
import { runRetention } from "@/lib/retention";
import { db } from "@/lib/db";
import { bootstrapDatabase } from "@/lib/setup/base-seed";
import { postNewChangelogEntries } from "@/lib/discord/changelog-post";
import { backfillNulls } from "@/lib/db-nulls";

export const maxDuration = 60;

/** Täglich: Datenbank-Einrichtung prüfen + automatische Löschfristen. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  // Indizes sicherstellen (und eine leere Datenbank mit Basisdaten füllen)
  const setup = await bootstrapDatabase(db);
  const changelog = await postNewChangelogEntries(db).catch(() => []);
  // Sicherheitsnetz: optionale Felder aus verschachtelten Creates nachziehen (siehe db-nulls.ts)
  const nullsFilled = await backfillNulls(db).catch(() => 0);
  return Response.json({ setup, retention: await runRetention(), changelogPosted: changelog.length, nullsFilled });
}
