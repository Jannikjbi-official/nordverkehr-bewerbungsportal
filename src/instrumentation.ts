/**
 * Läuft einmal pro Serverstart (auch auf Vercel bei jedem Kaltstart).
 * Führt ausstehende Daten-Migrationen aus (einmalig, mit Sperre), bevor die
 * erste Anfrage bedient wird – Next.js wartet auf `register()`. Ist alles
 * erledigt, kostet das nur zwei kleine Abfragen. Das Schema selbst spielt
 * `npm run build` per `prisma migrate deploy` ein.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { hasDatabaseUrl } = await import("@/lib/db");
  if (!hasDatabaseUrl()) return;

  try {
    const { db } = await import("@/lib/db");
    const { runMigrations } = await import("@/lib/setup/migrations");
    if ((await db.applicationType.count()) === 0) return; // leere DB: Ersteinrichtung übernimmt
    const done = await runMigrations(db, { log: () => {} });
    if (done.length) console.log("[setup] Migrationen ausgeführt:", done.join(", "));
  } catch (e) {
    // Start nie blockieren – Formular dedupliziert zusätzlich beim Anzeigen
    console.error("[setup] Migration beim Start fehlgeschlagen", e);
  }
}
