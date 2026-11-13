/**
 * Antwort des Bewerbers ans Team (Nachrichtenfeld im Portal).
 * Prüft Besitz, Status und Rate Limit, beendet offene Rückfragen, stößt die
 * Auto-Antwort an und meldet die Antwort im Bot-Log.
 */
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { botLog, esc } from "@/lib/discord/botlog";
import { ACTIVE_STATUSES, canFollowUp } from "@/lib/applications/status";

export const REPLY_MIN = 2;
export const REPLY_MAX = 2000;

export type ApplicantReplyResult =
  | { ok: true; applicationId: string; publicId: string | null; messageId: string; jobIds: string[] }
  | { ok: false; error: string };

const ownerWhere = (owner: { userId: string } | { discordId: string }) => ("userId" in owner ? { userId: owner.userId } : { user: { discordId: owner.discordId } });

export async function postApplicantReply(opts: {
  applicationId: string;
  /** Portal-Konto (Login) oder Discord-ID – nur eigene Bewerbungen */
  owner: { userId: string } | { discordId: string };
  body: string;
}): Promise<ApplicantReplyResult> {
  const body = opts.body.trim();
  if (body.length < REPLY_MIN || body.length > REPLY_MAX) return { ok: false, error: `Bitte schreib zwischen ${REPLY_MIN} und ${REPLY_MAX} Zeichen.` };

  const found = await db.application.findFirst({
    where: {
      id: opts.applicationId,
      ...ownerWhere(opts.owner),
      status: { in: [...ACTIVE_STATUSES, "WITHDRAWN"] },
    },
    include: { position: true, user: true },
  });
  // Nach einem Rückzug während der Bearbeitung bleibt der Chat für Rückfragen offen
  const app = found && (ACTIVE_STATUSES.includes(found.status) || canFollowUp(found)) ? found : null;
  if (!app) return { ok: false, error: "Auf diese Bewerbung kann nicht mehr geantwortet werden." };

  const rl = await rateLimit(`reply:${app.userId}`, 10, 3600);
  if (!rl.ok) return { ok: false, error: "Du hast gerade viele Nachrichten geschickt. Bitte warte etwas." };

  const message = await db.message.create({
    data: { applicationId: app.id, direction: "APPLICANT_TO_TEAM", authorId: app.userId, body },
  });
  // Offene Rückfrage ist beantwortet → Frist endet
  if (app.awaitingReplySince) await db.application.update({ where: { id: app.id }, data: { awaitingReplySince: null, awaitingRemindedAt: null } });

  // Vom Team stummgeschaltet? Dann kein Bot-Log (im Portal bleibt alles sichtbar)
  const muted = !!app.mutedUntil && app.mutedUntil.getTime() > Date.now();
  const job = muted
    ? null
    : await botLog(
        `💬 Neue Antwort von ${esc(app.user.globalName || app.user.username)} zu **${app.publicId}** (${app.position.title})`,
        // Antworten nur im Portal – der Knopf führt direkt zum Nachrichtenfeld
        { applicationId: app.id, url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}#nachricht`, linkLabel: "Im Portal antworten" },
      );
  return { ok: true, applicationId: app.id, publicId: app.publicId, messageId: message.id, jobIds: job ? [job] : [] };
}
