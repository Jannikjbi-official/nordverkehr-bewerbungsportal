"use server";

/**
 * Live-Aktualisierung: kleine „Versions“-Abfrage pro Seite. Ändert sich der
 * Wert, lädt die Seite ihre Daten neu (router.refresh) – ohne Neuladen und
 * ohne dass Eingaben verloren gehen. Absichtlich billig: nur Zähler und
 * Zeitstempel, keine Inhalte.
 */
import { db } from "@/lib/db";
import { getCurrentAccess, getCurrentUser } from "@/lib/auth/session";

export type LiveScope = "team-app" | "team-list" | "my-app" | "my-list";

const ID = /^[a-z0-9]{10,40}$/i;
const t = (d: Date | null | undefined) => (d ? d.getTime() : 0);

async function appVersion(id: string) {
  const [app, msgs, pending, comments, votes, ratings, lastMsg] = await Promise.all([
    db.application.findUnique({ where: { id }, select: { updatedAt: true } }),
    db.message.count({ where: { applicationId: id } }),
    db.message.count({ where: { applicationId: id, deliveryStatus: "PENDING" } }),
    db.comment.count({ where: { applicationId: id } }),
    db.vote.findMany({ where: { applicationId: id }, select: { updatedAt: true } }),
    db.rating.findMany({ where: { applicationId: id }, select: { updatedAt: true } }),
    db.message.findFirst({ where: { applicationId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true, readAt: true, deliveryStatus: true } }),
  ]);
  if (!app) return "gone";
  const maxT = (rows: { updatedAt: Date }[]) => Math.max(0, ...rows.map((r) => t(r.updatedAt)));
  return [t(app.updatedAt), msgs, pending, comments, votes.length, maxT(votes), ratings.length, maxT(ratings), t(lastMsg?.createdAt), t(lastMsg?.readAt), lastMsg?.deliveryStatus ?? ""].join(".");
}

async function listVersion(where: { userId?: string }) {
  const [count, last, lastMsg] = await Promise.all([
    db.application.count({ where: { ...where, NOT: { status: "DRAFT" } } }),
    // Team-Listen: Entwürfe nicht mitzählen – sonst lädt jeder Autosave eines Bewerbers alle Team-Seiten neu
    db.application.findFirst({ where: where.userId ? where : { NOT: { status: "DRAFT" } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.message.findFirst({ where: where.userId ? { application: { userId: where.userId } } : {}, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return [count, t(last?.updatedAt), t(lastMsg?.createdAt)].join(".");
}

/** Gibt einen Versions-String zurück – oder null, wenn nicht (mehr) berechtigt. */
export async function liveVersionAction(scope: LiveScope, id?: string): Promise<string | null> {
  if (scope === "team-app" || scope === "team-list") {
    const { user, access } = await getCurrentAccess();
    if (!user || !access?.isTeam) return null;
    if (scope === "team-list") return listVersion({});
    if (!id || !ID.test(id)) return null;
    return appVersion(id);
  }
  const user = await getCurrentUser();
  if (!user) return null;
  if (scope === "my-list") return listVersion({ userId: user.id });
  if (!id || !ID.test(id)) return null;
  const own = await db.application.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!own) return null;
  return appVersion(id);
}
