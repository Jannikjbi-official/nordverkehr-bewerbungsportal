"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { deliverNow } from "@/lib/discord/outbox-db";
import { audit } from "@/lib/audit";
import { createSuggestion, updateSuggestion, type SuggestionInput } from "@/lib/suggestions";
import type { ActionResult } from "@/app/actions/application";

/** Idee, Feedback oder Fehler einreichen (alle Eingeloggten). */
export async function submitSuggestionAction(input: SuggestionInput): Promise<ActionResult> {
  const user = await requireUser("/ideen");
  const r = await createSuggestion(db, user, input);
  if (!r.ok) return r;
  if (r.jobIds.length) await deliverNow(r.jobIds);
  revalidatePath("/ideen");
  revalidatePath("/team/admin/ideen");
  return { ok: true };
}

/** Admin: Status setzen und kurz antworten. */
export async function updateSuggestionAction(input: { id: string; status: string; adminNote?: string; notify?: boolean }): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const r = await updateSuggestion(db, user.id, input as Parameters<typeof updateSuggestion>[2]);
  if (!r.ok) return r;
  await audit("suggestion.update", { actorId: user.id, targetType: "suggestion", targetId: input.id, meta: { status: input.status } });
  if (r.jobIds.length) await deliverNow(r.jobIds);
  revalidatePath("/team/admin/ideen");
  revalidatePath("/ideen");
  return { ok: true };
}

/** Admin: Eintrag löschen (Spam, Doppelte). */
export async function deleteSuggestionAction(id: string): Promise<ActionResult> {
  const { user } = await requireAdmin();
  if (typeof id !== "string" || id.length < 10 || id.length > 40) return { ok: false, error: "Ungültig." };
  await db.suggestion.deleteMany({ where: { id } });
  await audit("suggestion.delete", { actorId: user.id, targetType: "suggestion", targetId: id });
  revalidatePath("/team/admin/ideen");
  revalidatePath("/ideen");
  return { ok: true };
}
