/**
 * Bewerber erfährt, wer seine Bewerbung betreut: Übernimmt ein Teammitglied
 * (Claim, Übernahme oder automatische Zuteilung), bekommt der Bewerber eine kurze
 * Nachricht im Portal und per DM (Einstellung applications.claimNotice).
 * Nur für laufende Bewerbungen; Testbewerber bekommen nie eine DM (Outbox).
 */
import { db } from "@/lib/db";
import { enqueue } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";
import { avatarUrl } from "@/lib/discord/snowflake";
import { buildApplicantMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

export function claimNoticeText(applicant: string, position: string, publicId: string | null, teamMember: string, takeover: boolean) {
  return (
    `Moin ${applicant},\n\n` +
    (takeover
      ? `ab sofort kümmert sich **${teamMember}** um deine Bewerbung als **${position}**${publicId ? ` (${publicId})` : ""}.`
      : `gute Nachrichten: **${teamMember}** aus dem Team betreut jetzt deine Bewerbung als **${position}**${publicId ? ` (${publicId})` : ""}.`) +
    `\n\nFragen? Antworte einfach im Portal – die Nachricht landet direkt beim Team.`
  );
}

/** Nachricht anlegen + DM einplanen. Gibt die Job-ID zurück (oder null). */
export async function notifyApplicantClaimed(applicationId: string, claimer: { globalName: string | null; username: string; discordId: string; avatar: string | null }, opts: { takeover?: boolean } = {}) {
  const s = await getSettings();
  if (!s["applications.claimNotice"]) return null;
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { user: true, position: { select: { title: true } } } });
  if (!app || !["SUBMITTED", "IN_REVIEW", "INTERVIEW"].includes(app.status)) return null;
  const teamMember = claimer.globalName || claimer.username;
  const body = claimNoticeText(app.user.globalName || app.user.username, app.position.title, app.publicId, teamMember, !!opts.takeover);
  const message = await db.message.create({ data: { applicationId: app.id, direction: "SYSTEM", body, deliveryStatus: "PENDING" } });
  const job = await enqueue(
    {
      type: "DM",
      discordUserId: app.user.discordId,
      purpose: "status",
      message: buildApplicantMessage({
        title: "Deine Bewerbung wird betreut",
        body,
        publicId: app.publicId,
        statusUrl: `${publicEnv.appUrl}/dashboard/${app.id}`,
        author: { name: teamMember, iconUrl: avatarUrl(claimer.discordId, claimer.avatar, 128) },
      }),
    },
    { messageId: message.id, applicationId: app.id },
  );
  return job.id;
}
