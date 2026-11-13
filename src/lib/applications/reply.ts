/**
 * Antwort des Bewerbers ans Team – gemeinsam für das Portal (Nachrichtenfeld)
 * und Discord (Knopf „Zurückschreiben“ in der DM → Fenster).
 * Prüft Besitz, Status und Rate Limit, beendet offene Rückfragen, stößt die
 * Auto-Antwort an und meldet die Antwort im Bot-Log.
 */
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { botLog, esc } from "@/lib/discord/botlog";
import { replyCustomId } from "@/lib/discord/interactions";
import { getSettings } from "@/lib/settings";
import { ACTIVE_STATUSES, canFollowUp } from "@/lib/applications/status";

export const REPLY_MIN = 2;
export const REPLY_MAX = 2000;

export type ApplicantReplyResult =
  | { ok: true; applicationId: string; publicId: string | null; messageId: string; jobIds: string[] }
  | { ok: false; error: string };

const ownerWhere = (owner: { userId: string } | { discordId: string }) => ("userId" in owner ? { userId: owner.userId } : { user: { discordId: owner.discordId } });

/** Darf diese Person (Discord-ID) auf die Bewerbung antworten? Für den Knopf, bevor das Fenster aufgeht. */
export async function canAnswer(applicationId: string, discordId: string) {
  const app = await db.application.findFirst({
    where: { id: applicationId, ...ownerWhere({ discordId }), status: { in: [...ACTIVE_STATUSES, "WITHDRAWN"] } },
    select: { id: true, publicId: true, status: true, withdrawnInReview: true, decidedAt: true, withdrawAckAt: true },
  });
  return app && (ACTIVE_STATUSES.includes(app.status) || canFollowUp(app)) ? app : null;
}

export async function postApplicantReply(opts: {
  applicationId: string;
  /** Portal-Konto (Login) oder Discord-ID (signierte Interaktion) – nur eigene Bewerbungen */
  owner: { userId: string } | { discordId: string };
  body: string;
  via?: "portal" | "discord";
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
        `💬 Neue Antwort von ${esc(app.user.globalName || app.user.username)} zu **${app.publicId}** (${app.position.title})${opts.via === "discord" ? " · per Discord" : ""}`,
        {
          applicationId: app.id,
          url: `${publicEnv.appUrl}/team/bewerbungen/${app.id}`,
          // Direkt aus Discord antworten (Fenster), wenn der Knopf „Übernehmen“ eingerichtet ist
          actions: (await getSettings())["discord.claimButton"] ? [{ label: "Antworten", customId: replyCustomId(app.id), emoji: "✉️", style: 1 }] : undefined,
        },
      );
  return { ok: true, applicationId: app.id, publicId: app.publicId, messageId: message.id, jobIds: job ? [job] : [] };
}
