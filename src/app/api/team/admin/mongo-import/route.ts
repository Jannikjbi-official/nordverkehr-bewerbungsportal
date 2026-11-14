import { accessErrorResponse, assertTeamApi } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { IMPORT_CONFIRM_PHRASE, IMPORT_MARKER as MARKER } from "@/lib/setup/mongo-import-shared";

/** Übernahme kann bei vielen Bewerbungen etwas dauern */
export const maxDuration = 300;


/** Bestand in MongoDB (nur lesen) und Stand in Postgres – zum Prüfen vor der Übernahme. */
export async function GET() {
  try {
    await assertTeamApi({ admin: true });
  } catch (err) {
    return accessErrorResponse(err);
  }
  const { resolveMongoUrl, mongoOverview } = await import("@/lib/setup/mongo-import");
  const url = resolveMongoUrl();
  if (!url) return Response.json({ available: false });
  try {
    const { dbName, counts } = await mongoOverview(url);
    const [applications, users] = await Promise.all([db.application.count(), db.user.count()]);
    return Response.json({ available: true, dbName, counts, postgres: { applications, users } });
  } catch (e) {
    return Response.json({ available: true, error: `MongoDB nicht erreichbar: ${e instanceof Error ? e.message : "unbekannt"}` }, { status: 502 });
  }
}

/** Übernahme starten (nur Admins, mit Bestätigungswort). Ersetzt alle Daten in Postgres. */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await assertTeamApi({ admin: true });
  } catch (err) {
    return accessErrorResponse(err);
  }
  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== IMPORT_CONFIRM_PHRASE) return Response.json({ error: `Bitte „${IMPORT_CONFIRM_PHRASE}“ eintippen.` }, { status: 400 });
  const { resolveMongoUrl, importFromMongo } = await import("@/lib/setup/mongo-import");
  const url = resolveMongoUrl();
  if (!url) return Response.json({ error: "Keine MongoDB-Verbindung gesetzt (DATABASE_URL_MONGODB_URI)." }, { status: 400 });

  const by = { discordId: ctx.user.discordId, name: ctx.user.globalName || ctx.user.username };
  try {
    const report = await importFromMongo(db, url);
    // Markierung + Audit nach dem Import (die Tabellen wurden ersetzt; die eigene Konto-ID kann sich geändert haben)
    const actor = await db.user.findUnique({ where: { discordId: by.discordId }, select: { id: true } });
    await db.setting.upsert({
      where: { key: MARKER },
      create: { key: MARKER, value: { at: new Date().toISOString(), by, inserted: report.totalInserted } },
      update: { value: { at: new Date().toISOString(), by, inserted: report.totalInserted } },
    });
    await audit("data.import", { actorId: actor?.id ?? null, meta: { from: "mongodb", inserted: report.totalInserted, source: report.totalSource, ms: report.ms } });
    const { clearSettingsCache } = await import("@/lib/settings");
    clearSettingsCache();
    // Neuere Daten-Migrationen (z. B. Whitelist & Beta) gleich nachziehen – nicht erst beim nächsten Serverstart
    const { runMigrations } = await import("@/lib/setup/migrations");
    await runMigrations(db).catch((e) => console.error("[mongo-import] Migrationen", e));
    return Response.json({ ok: true, report });
  } catch (e) {
    console.error("[mongo-import]", e);
    return Response.json({ error: `Übernahme fehlgeschlagen – in Postgres wurde nichts geändert. ${e instanceof Error ? e.message.slice(0, 300) : ""}` }, { status: 500 });
  }
}
