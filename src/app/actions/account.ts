"use server";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/app/actions/application";

/** Account inkl. aller Bewerbungsdaten löschen (Art. 17 DSGVO). */
export async function deleteAccountAction(confirmText: string): Promise<ActionResult | void> {
  const user = await requireUser("/konto");
  if (confirmText !== "LÖSCHEN") return { ok: false, error: "Bitte LÖSCHEN eintippen." };
  const rl = await rateLimit(`delete:${user.id}`, 3, 3600);
  if (!rl.ok) return { ok: false, error: "Bitte später erneut versuchen." };

  // Aktive Sperren: berechtigtes Interesse (Art. 17 Abs. 3) – Löschung über das Team
  const ban = await db.userBan.findFirst({
    where: { subjectId: user.id, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  if (ban) {
    return { ok: false, error: "Solange eine Sperre aktiv ist, kann der Account nicht selbst gelöscht werden. Melde dich beim Team." };
  }

  await audit("user.delete", { actorId: null, targetType: "user", meta: { self: true } });
  await db.user.delete({ where: { id: user.id } }); // Cascade: Bewerbungen, Antworten, Nachrichten, Bilder, Notizen

  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/?geloescht=1" });
}

/** Alle Sitzungen ungültig machen (sessionVersion erhöhen). */
export async function signOutEverywhereAction() {
  const user = await requireUser("/konto");
  await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/" });
}
