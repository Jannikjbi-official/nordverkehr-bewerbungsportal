/**
 * Läuft einmal pro Serverstart (auch auf Vercel bei jedem Kaltstart).
 * Führt ausstehende Daten-Migrationen aus (einmalig, mit Sperre), bevor die
 * erste Anfrage bedient wird – Next.js wartet auf `register()`. Ist alles
 * erledigt, kostet das nur zwei kleine Abfragen. Indizes danach im Hintergrund.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { DATABASE_URL_KEYS } = await import("@/lib/db");
  if (!DATABASE_URL_KEYS.some((k) => process.env[k])) return;

  try {
    const { db } = await import("@/lib/db");
    const { runMigrations } = await import("@/lib/setup/migrations");
    if ((await db.applicationType.count()) === 0) return; // leere DB: Ersteinrichtung übernimmt
    const done = await runMigrations(db, { log: () => {} });
    if (done.length) {
      console.log("[setup] Migrationen ausgeführt:", done.join(", "));
      const { ensureIndexes } = await import("@/lib/setup/indexes");
      void ensureIndexes(db).catch((e) => console.error("[setup] Indizes", e));
    }
    // Neue Changelog-Einträge einmalig in den Discord-Kanal (blockiert den Start nicht)
    void import("@/lib/discord/changelog-post")
      .then(({ postNewChangelogEntries }) => postNewChangelogEntries(db))
      .catch((e) => console.error("[changelog]", e));
  } catch (e) {
    // Start nie blockieren – Formular dedupliziert zusätzlich beim Anzeigen
    console.error("[setup] Migration beim Start fehlgeschlagen", e);
  }
}
