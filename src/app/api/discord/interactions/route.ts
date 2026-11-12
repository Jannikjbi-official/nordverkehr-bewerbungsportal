import { after } from "next/server";
import { db } from "@/lib/db";
import { STATUS_COMMAND, ephemeral, getDiscordPublicKey, parseCustomId, statusCommandReply, verifyDiscordSignature } from "@/lib/discord/interactions";
import { STATUS_LABEL } from "@/lib/applications/status";
import { evaluateRoles } from "@/lib/auth/access";
import { runOutbox } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";

export const maxDuration = 10;

interface Interaction {
  type: number;
  data?: { custom_id?: string; name?: string };
  member?: { roles: string[]; user: { id: string; username: string; global_name?: string | null; avatar?: string | null } };
  /** Bei Interaktionen außerhalb eines Servers (DM) */
  user?: { id: string };
}

/** Discord-Interaktionen (Knöpfe, Slash-Befehle). Signatur wird immer geprüft. */
export async function POST(req: Request) {
  const body = await req.text();
  const key = await getDiscordPublicKey();
  if (!key || !verifyDiscordSignature(key, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), body)) {
    return new Response("Ungültige Signatur", { status: 401 });
  }
  const i = JSON.parse(body) as Interaction;
  if (i.type === 1) return Response.json({ type: 1 }); // PING von Discord

  // Slash-Befehl /bewerbung: eigener Stand, nur für die Person sichtbar
  if (i.type === 2 && i.data?.name === STATUS_COMMAND.name) {
    const discordId = i.member?.user.id ?? i.user?.id;
    if (!discordId) return Response.json(ephemeral("Das hat nicht geklappt."));
    const apps = await db.application.findMany({
      where: { user: { discordId }, OR: [{ status: { in: ["DRAFT", "SUBMITTED", "IN_REVIEW", "INTERVIEW"] } }, { decidedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }] },
      select: { id: true, publicId: true, status: true, submittedAt: true, interviewAt: true, position: { select: { title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    return Response.json(
      ephemeral(
        statusCommandReply(
          apps.map((a) => ({ id: a.id, publicId: a.publicId, status: a.status, statusLabel: STATUS_LABEL[a.status], position: a.position.title, submittedAt: a.submittedAt, interviewAt: a.interviewAt })),
          publicEnv.appUrl,
        ),
      ),
    );
  }

  if (i.type !== 3 || !i.data?.custom_id) return Response.json(ephemeral("Diese Aktion kenne ich nicht."));
  const action = parseCustomId(i.data.custom_id);
  if (!action) return Response.json(ephemeral("Dieser Knopf ist veraltet."));
  if (!i.member) return Response.json(ephemeral("Das geht nur auf dem Server."));

  const { isTeam, isAdmin } = evaluateRoles(i.member.roles, { teamRoleId: process.env.TEAM_ROLE_ID, adminRoleId: process.env.ADMIN_ROLE_ID });
  if (!isTeam) return Response.json(ephemeral("Nur das Team kann Bewerbungen übernehmen."));

  const user = await db.user.findUnique({ where: { discordId: i.member.user.id } });
  if (!user) {
    return Response.json(ephemeral(`Du warst noch nie im Portal eingeloggt. Melde dich einmal an: ${publicEnv.appUrl}/team – danach klappt der Knopf.`));
  }

  if (action.kind === "claim") {
    const app = await db.application.findUnique({
      where: { id: action.applicationId },
      select: { id: true, publicId: true, status: true, claimedById: true, claimedBy: { select: { globalName: true, username: true } }, position: { select: { teamRoleIds: true } } },
    });
    if (!app || app.status === "DRAFT") return Response.json(ephemeral("Die Bewerbung gibt es nicht mehr."));
    // Zuständigkeit pro Stelle (Rollen direkt aus der signierten Interaktion)
    const { canSeePosition } = await import("@/lib/team/visibility");
    if (!canSeePosition({ isAdmin, roleIds: i.member.roles }, app.position)) return Response.json(ephemeral("Für diese Stelle bist du nicht zuständig."));
    const link = `${publicEnv.appUrl}/team/bewerbungen/${app.id}`;
    if (app.claimedById === user.id) return Response.json(ephemeral(`Du betreust **${app.publicId}** schon. ${link}`));
    if (app.claimedById) {
      const who = app.claimedBy?.globalName || app.claimedBy?.username || "Jemand";
      return Response.json(ephemeral(`**${app.publicId}** betreut schon ${who}. Übernehmen kannst du im Portal: ${link}`));
    }
    if (["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(app.status)) return Response.json(ephemeral(`**${app.publicId}** ist schon abgeschlossen. ${link}`));
    try {
      const { setClaim } = await import("@/lib/team/service");
      const { jobIds } = await setClaim({
        applicationId: app.id,
        actor: { id: user.id, globalName: user.globalName, username: user.username, discordId: user.discordId, avatar: user.avatar, isAdmin },
        action: "claim",
      });
      if (jobIds.length) after(() => runOutbox({ ids: jobIds }).catch(() => {}));
      return Response.json(ephemeral(`📌 Du betreust jetzt **${app.publicId}**. ${link}`));
    } catch (e) {
      return Response.json(ephemeral(e instanceof Error ? e.message : "Hat nicht geklappt – versuch es im Portal."));
    }
  }
  return Response.json(ephemeral("Unbekannte Aktion."));
}
