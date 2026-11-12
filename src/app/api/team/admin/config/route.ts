import { accessErrorResponse, assertTeamApi } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { exportConfig } from "@/lib/admin/config-backup";

/** Einstellungen, Positionen, Formular und Bausteine als JSON herunterladen (nur Admins). */
export async function GET() {
  let ctx;
  try {
    ctx = await assertTeamApi({ admin: true });
  } catch (err) {
    return accessErrorResponse(err);
  }
  const backup = await exportConfig(db);
  await audit("settings.export", { actorId: ctx.user.id, meta: { positions: backup.positions.length, sections: backup.sections.length, templates: backup.templates.length } });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="nordverkehr-einstellungen-${day}.json"`, "Cache-Control": "no-store" },
  });
}
