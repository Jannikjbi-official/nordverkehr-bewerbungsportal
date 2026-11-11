import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAccess, loadUserFromSession, type CurrentUser } from "@/lib/auth/user-access";

export type { CurrentUser };
export { getAccess, loadUserFromSession };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // connection(): Sitzungsdaten immer erst zur Request-Zeit auflösen (Cache
  // Components/Partial Prefetching), da Auth.js & Prisma intern Krypto nutzen.
  await connection();
  // Auth.js erst nach der Request-Zeit-API laden (Modul-Init nutzt Krypto)
  const { auth } = await import("@/auth");
  const session = await auth();
  return loadUserFromSession(session);
});

export const getCurrentAccess = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return { user: null, access: null } as const;
  return { user, access: await getAccess(user) } as const;
});

/** Für Seiten/Actions: eingeloggt sein, sonst Login. */
export async function requireUser(callbackUrl = "/dashboard"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}

/** Merkt sich, dass ein Teammitglied aktiv ist ("Team online" für Auto-Antworten). Max. 1×/Minute. */
async function touchTeamActivity(user: CurrentUser) {
  if (user.lastTeamActiveAt && Date.now() - user.lastTeamActiveAt.getTime() < 60_000) return;
  const { db } = await import("@/lib/db");
  await db.user.update({ where: { id: user.id }, data: { lastTeamActiveAt: new Date() } }).catch(() => {});
  // Fällige Discord-Zustellungen nach der Antwort mitnehmen (ergänzt den Cron)
  try {
    const { after } = await import("next/server");
    after(async () => {
      const { runOutbox } = await import("@/lib/discord/outbox-db");
      await runOutbox({ limit: 10 }).catch(() => {});
    });
  } catch {
    // außerhalb eines Requests (z. B. Tests) – egal
  }
}

/** Team-Rolle erforderlich (bei jeder Seite UND jeder Action prüfen). */
export async function requireTeam() {
  const { user, access } = await getCurrentAccess();
  if (!user) redirect("/login?callbackUrl=/team");
  if (!access?.isTeam) redirect("/kein-zugriff");
  await touchTeamActivity(user);
  return { user, access };
}

/** Team- UND Admin-Rolle erforderlich. */
export async function requireAdmin() {
  const ctx = await requireTeam();
  if (!ctx.access.isAdmin) redirect("/team?hinweis=admin");
  return ctx;
}

export class AccessError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
  }
}

/** Für Route-Handler: wirft AccessError statt Redirect. */
export async function assertTeamApi(opts: { admin?: boolean } = {}) {
  const { user, access } = await getCurrentAccess();
  if (!user) throw new AccessError(401, "Nicht eingeloggt.");
  if (!access?.isTeam) throw new AccessError(403, "Kein Zugriff.");
  if (opts.admin && !access.isAdmin) throw new AccessError(403, "Nur für Admins.");
  await touchTeamActivity(user);
  return { user, access };
}

export async function assertUserApi() {
  const user = await getCurrentUser();
  if (!user) throw new AccessError(401, "Nicht eingeloggt.");
  return user;
}

export function accessErrorResponse(err: unknown): Response {
  if (err instanceof AccessError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  throw err;
}
