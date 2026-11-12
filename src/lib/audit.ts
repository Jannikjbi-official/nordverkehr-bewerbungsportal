import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type AuditAction =
  | "auth.login"
  | "application.submit"
  | "application.withdraw"
  | "application.claim"
  | "application.release"
  | "data.reset"
  | "application.withdraw_ack"
  | "application.status"
  | "application.interview"
  | "application.vote"
  | "application.rating"
  | "application.print"
  | "application.slot_booked"
  | "application.onboarding"
  | "application.feedback"
  | "slot.create"
  | "slot.delete"
  | "position.auto"
  | "user.notify"
  | "application.comment"
  | "application.message"
  | "application.delete"
  | "application.export"
  | "application.view"
  | "position.create"
  | "position.update"
  | "position.delete"
  | "position.status"
  | "form.update"
  | "template.create"
  | "template.update"
  | "template.delete"
  | "template.reorder"
  | "user.note"
  | "user.ban"
  | "user.unban"
  | "user.export"
  | "user.delete"
  | "settings.update"
  | "ai.request"
  | "export.csv"
  | "retention.cleanup";

export async function audit(
  action: AuditAction,
  opts: {
    actorId?: string | null;
    targetType?: string;
    targetId?: string;
    meta?: Prisma.InputJsonValue;
  } = {},
) {
  try {
    await db.auditLog.create({
      data: {
        action,
        actorId: opts.actorId ?? null,
        targetType: opts.targetType,
        targetId: opts.targetId,
        meta: opts.meta,
      },
    });
  } catch (err) {
    // Audit darf nie die eigentliche Aktion abbrechen – aber laut loggen
    console.error("[audit] Schreiben fehlgeschlagen", action, err);
  }
}

export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Login",
  "application.submit": "Bewerbung eingereicht",
  "application.withdraw": "Bewerbung zurückgezogen",
  "application.claim": "Bewerbung geclaimt",
  "application.release": "Bewerbung freigegeben",
  "data.reset": "Alle Bewerbungen gelöscht",
  "application.withdraw_ack": "Rückzug bestätigt",
  "application.status": "Status geändert",
  "application.interview": "Gesprächstermin gesetzt",
  "application.vote": "Abgestimmt",
  "application.rating": "Bewertet",
  "application.print": "Bewerbung gedruckt",
  "application.slot_booked": "Termin gebucht",
  "application.onboarding": "Einarbeitung",
  "application.feedback": "Feedback abgegeben",
  "slot.create": "Gesprächstermine angelegt",
  "slot.delete": "Gesprächstermin gelöscht",
  "position.auto": "Position automatisch geöffnet/geschlossen",
  "user.notify": "Stellen-Benachrichtigung",
  "application.comment": "Kommentar",
  "application.message": "Nachricht gesendet",
  "application.delete": "Bewerbung gelöscht",
  "application.export": "Bewerbung exportiert",
  "application.view": "Bewerbung angesehen",
  "position.create": "Position erstellt",
  "position.update": "Position bearbeitet",
  "position.delete": "Position gelöscht",
  "position.status": "Position geöffnet/geschlossen",
  "form.update": "Formular bearbeitet",
  "template.create": "Baustein erstellt",
  "template.update": "Baustein bearbeitet",
  "template.delete": "Baustein gelöscht",
  "template.reorder": "Bausteine sortiert",
  "user.note": "Notiz",
  "user.ban": "Sperre",
  "user.unban": "Sperre aufgehoben",
  "user.export": "Datenexport",
  "user.delete": "Account gelöscht",
  "settings.update": "Einstellungen",
  "ai.request": "KI-Anfrage",
  "export.csv": "CSV-Export",
  "retention.cleanup": "Löschfristen",
};
