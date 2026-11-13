/**
 * Rechte-Stufen im Team: Junior-Teammitglieder (Discord-Rolle aus den Einstellungen)
 * dürfen Bewerbungen lesen, kommentieren, bewerten, abstimmen und Gesprächsnotizen
 * schreiben – aber keinen Status ändern, nicht entscheiden, nicht claimen und
 * keine Nachrichten an Bewerber senden. Admins sind nie Junior.
 */
import { parseRoleIds } from "@/lib/discord/roles";

export function isJunior(roleIds: readonly string[] | null | undefined, isAdmin: boolean, juniorSetting: string) {
  if (isAdmin) return false;
  const junior = parseRoleIds(juniorSetting);
  return junior.length > 0 && (roleIds ?? []).some((r) => junior.includes(r));
}

export const JUNIOR_DENIED = "Als Junior kannst du Bewerbungen lesen, kommentieren und bewerten – das hier macht das reguläre Team.";
