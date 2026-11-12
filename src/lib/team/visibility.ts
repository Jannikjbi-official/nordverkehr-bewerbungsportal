/**
 * Zuständigkeit pro Stelle: Hat eine Stelle Discord-Rollen eingetragen
 * (`Position.teamRoleIds`), sehen nur Teammitglieder mit einer dieser Rollen
 * – und Admins – ihre Bewerbungen. Ohne Eintrag sieht das ganze Team alles.
 * Rollen kommen aus dem Rollen-Cache (`User.roleIds`, bei jeder Rollenprüfung aktualisiert).
 */
import { db } from "@/lib/db";

export interface Viewer {
  id: string;
  isAdmin: boolean;
  roleIds: string[];
}

export function canSeePosition(viewer: Pick<Viewer, "isAdmin" | "roleIds">, position: { teamRoleIds: string[] }) {
  if (viewer.isAdmin || !position.teamRoleIds?.length) return true;
  return position.teamRoleIds.some((r) => viewer.roleIds.includes(r));
}

/** IDs der Stellen, die diese Person NICHT sieht. */
export async function hiddenPositionIds(viewer: Pick<Viewer, "isAdmin" | "roleIds">) {
  if (viewer.isAdmin) return [];
  const restricted = await db.position.findMany({ where: { NOT: { teamRoleIds: { isEmpty: true } } }, select: { id: true, teamRoleIds: true } });
  return restricted.filter((p) => !canSeePosition(viewer, p)).map((p) => p.id);
}

/** Prisma-Filter für Bewerbungen, die diese Person sehen darf (leer = alle). */
export async function visiblePositionFilter(viewer: Pick<Viewer, "isAdmin" | "roleIds">) {
  const hidden = await hiddenPositionIds(viewer);
  return hidden.length ? { positionId: { notIn: hidden } } : {};
}

/** Darf diese Person die Bewerbung sehen/bearbeiten? */
export async function canAccessApplication(viewer: Pick<Viewer, "isAdmin" | "roleIds">, applicationId: string) {
  if (viewer.isAdmin) return true;
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { position: { select: { teamRoleIds: true } } } });
  return !app || canSeePosition(viewer, app.position);
}

/** Viewer aus Nutzer + aktueller Zugriffsprüfung */
export const viewerOf = (user: { id: string; roleIds?: string[] | null }, access: { isAdmin: boolean } | null | undefined): Viewer => ({
  id: user.id,
  isAdmin: !!access?.isAdmin,
  roleIds: user.roleIds ?? [],
});
