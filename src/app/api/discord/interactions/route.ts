import { after } from "next/server";
import { db } from "@/lib/db";
import {
  CLAIM_COMMAND,
  OPEN_COMMAND,
  STATUS_COMMAND,
  cancelConfirmReply,
  ephemeral,
  type StatusButtonTarget,
  getDiscordPublicKey,
  normalizePublicId,
  openListReply,
  parseCustomId,
  statusCommandReply,
  verifyDiscordSignature,
} from "@/lib/discord/interactions";
import { env } from "@/lib/env";
import { JUNIOR_DENIED } from "@/lib/team/rights";
import { STATUS_LABEL } from "@/lib/applications/status";
import { evaluateRoles } from "@/lib/auth/access";
import { runOutbox } from "@/lib/discord/outbox-db";
import { publicEnv } from "@/lib/env";

export const maxDuration = 10;

interface Interaction {
  type: number;
  data?: { custom_id?: string; name?: string; options?: { name: string; value: string | number | boolean }[]; components?: unknown[] };
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

  // Team-Befehle /offen und /claim
  if (i.type === 2 && (i.data?.name === OPEN_COMMAND.name || i.data?.name === CLAIM_COMMAND.name)) {
    if (!i.member) return Response.json(ephemeral("Das geht nur auf dem Server."));
    const team = await teamContext(i.member);
    if (!team.ok) return Response.json(ephemeral(team.error));
    if (i.data.name === OPEN_COMMAND.name) return Response.json(ephemeral(await openList(team)));
    if (team.isJunior) return Response.json(ephemeral(JUNIOR_DENIED));
    const raw = String(i.data.options?.find((o) => o.name === "id")?.value ?? "");
    const publicId = normalizePublicId(raw, new Date().getFullYear(), env().PUBLIC_ID_PREFIX);
    if (!publicId) return Response.json(ephemeral("Unbekannte Bewerbungs-ID. Beispiel: `/claim id:NV-2026-0012` oder `/claim id:12`."));
    return Response.json(ephemeral(await claimFromDiscord({ publicId }, team)));
  }

  // 3 = Knopf
  if (i.type !== 3 || !i.data?.custom_id) return Response.json(ephemeral("Diese Aktion kenne ich nicht."));
  const action = parseCustomId(i.data.custom_id);
  if (!action) return Response.json(ephemeral("Dieser Knopf ist veraltet."));

  // Bewerber: Gespräch absagen (Knopf in der Erinnerungs-DM) – nur die eigene Bewerbung
  if (action.kind === "cancelInterview" || action.kind === "cancelInterviewConfirmed") {
    const discordId = i.member?.user.id ?? i.user?.id;
    if (!discordId) return Response.json(ephemeral("Das hat nicht geklappt."));
    if (action.kind === "cancelInterview") {
      const app = await db.application.findFirst({ where: { id: action.applicationId, user: { discordId } }, select: { status: true, interviewAt: true } });
      if (!app || app.status !== "INTERVIEW" || !app.interviewAt || app.interviewAt.getTime() <= Date.now()) return Response.json(ephemeral("Für diese Bewerbung gibt es gerade keinen Termin, den du absagen kannst."));
      if (action.at !== undefined && Math.floor(app.interviewAt.getTime() / 1000) !== action.at) {
        return Response.json(ephemeral(`Dieser Knopf gehört zu einem älteren Termin. Deinen aktuellen Termin kannst du im Portal absagen: ${publicEnv.appUrl}/dashboard/${action.applicationId}`));
      }
      return Response.json(cancelConfirmReply(action.applicationId, app.interviewAt));
    }
    const { cancelInterviewByApplicant } = await import("@/lib/team/slots");
    const r = await cancelInterviewByApplicant(db, { applicationId: action.applicationId, discordId, expectAt: action.at });
    return Response.json(ephemeral(r.ok ? `Erledigt – das Team weiß Bescheid. Einen neuen Termin findest du im Portal: ${publicEnv.appUrl}/dashboard/${action.applicationId}` : r.error));
  }

  if (!i.member) return Response.json(ephemeral("Das geht nur auf dem Server."));
  const team = await teamContext(i.member);
  if (!team.ok) return Response.json(ephemeral(team.error));
  if (team.isJunior) return Response.json(ephemeral(JUNIOR_DENIED));
  if (action.kind === "claim") return Response.json(ephemeral(await claimFromDiscord({ id: action.applicationId }, team)));
  if (action.kind === "status") return Response.json(ephemeral(await statusFromDiscord(action.applicationId, action.to, team)));
  return Response.json(ephemeral("Unbekannte Aktion."));
}

type Member = NonNullable<Interaction["member"]>;
type TeamCtx = { ok: true; isAdmin: boolean; isJunior: boolean; roleIds: string[]; user: NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>> } | { ok: false; error: string };

/** Team-Rolle aus der signierten Interaktion + Portal-Konto. */
async function teamContext(member: Member): Promise<TeamCtx> {
  const { isTeam, isAdmin } = evaluateRoles(member.roles, { teamRoleId: process.env.TEAM_ROLE_ID, adminRoleId: process.env.ADMIN_ROLE_ID });
  if (!isTeam) return { ok: false, error: "Das geht nur fürs Team." };
  const user = await db.user.findUnique({ where: { discordId: member.user.id } });
  if (!user) return { ok: false, error: `Du warst noch nie im Portal eingeloggt. Melde dich einmal an: ${publicEnv.appUrl}/team – danach klappt es.` };
  const { isJunior } = await import("@/lib/team/rights");
  const { getSettings } = await import("@/lib/settings");
  return { ok: true, isAdmin, isJunior: isJunior(member.roles, isAdmin, (await getSettings())["team.juniorRoleIds"]), roleIds: member.roles, user };
}

/** /offen: offene Bewerbungen der Stellen, für die die Person zuständig ist. */
async function openList(team: Extract<TeamCtx, { ok: true }>): Promise<string> {
  const { visiblePositionFilter } = await import("@/lib/team/visibility");
  const where = {
    status: { in: ["SUBMITTED" as const, "IN_REVIEW" as const, "INTERVIEW" as const] },
    isTest: { not: true },
    ...(await visiblePositionFilter({ isAdmin: team.isAdmin, roleIds: team.roleIds })),
  };
  const [apps, total] = await Promise.all([
    db.application.findMany({
      where,
      orderBy: { submittedAt: "asc" },
      take: 10,
      select: { id: true, publicId: true, status: true, submittedAt: true, position: { select: { title: true } }, claimedBy: { select: { globalName: true, username: true } } },
    }),
    db.application.count({ where }),
  ]);
  return openListReply(
    apps.map((a) => ({
      id: a.id,
      publicId: a.publicId,
      statusLabel: STATUS_LABEL[a.status],
      position: a.position.title,
      submittedAt: a.submittedAt,
      claimedBy: a.claimedBy ? a.claimedBy.globalName || a.claimedBy.username : null,
    })),
    total,
    publicEnv.appUrl,
  );
}

/** Übernehmen per Knopf oder /claim – gleiche Regeln wie im Portal. */
async function claimFromDiscord(by: { id: string } | { publicId: string }, team: Extract<TeamCtx, { ok: true }>): Promise<string> {
  const app = await db.application.findFirst({
    where: "id" in by ? { id: by.id } : { publicId: by.publicId },
    select: { id: true, publicId: true, status: true, claimedById: true, claimedBy: { select: { globalName: true, username: true } }, position: { select: { teamRoleIds: true } } },
  });
  if (!app || app.status === "DRAFT") return "id" in by ? "Die Bewerbung gibt es nicht mehr." : `Keine Bewerbung mit der ID **${by.publicId}** gefunden.`;
  // Zuständigkeit pro Stelle (Rollen direkt aus der signierten Interaktion)
  const { canSeePosition } = await import("@/lib/team/visibility");
  if (!canSeePosition({ isAdmin: team.isAdmin, roleIds: team.roleIds }, app.position)) return "Für diese Stelle bist du nicht zuständig.";
  const link = `${publicEnv.appUrl}/team/bewerbungen/${app.id}`;
  if (app.claimedById === team.user.id) return `Du betreust **${app.publicId}** schon. ${link}`;
  if (app.claimedById) {
    const who = app.claimedBy?.globalName || app.claimedBy?.username || "Jemand";
    return `**${app.publicId}** betreut schon ${who}. Übernehmen kannst du im Portal: ${link}`;
  }
  if (["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(app.status)) return `**${app.publicId}** ist schon abgeschlossen. ${link}`;
  try {
    const { setClaim } = await import("@/lib/team/service");
    const { jobIds } = await setClaim({ applicationId: app.id, actor: actorOf(team), action: "claim" });
    if (jobIds.length) after(() => runOutbox({ ids: jobIds }).catch(() => {}));
    return `📌 Du betreust jetzt **${app.publicId}**. ${link}`;
  } catch (e) {
    return e instanceof Error ? e.message : "Hat nicht geklappt – versuch es im Portal.";
  }
}

/** Bewerbung für eine Team-Aktion laden – mit Zuständigkeit pro Stelle. Gibt sonst den Fehlertext zurück. */
async function teamApp(applicationId: string, team: Extract<TeamCtx, { ok: true }>) {
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { id: true, publicId: true, status: true, position: { select: { teamRoleIds: true } } } });
  if (!app || app.status === "DRAFT") return "Die Bewerbung gibt es nicht mehr.";
  const { canSeePosition } = await import("@/lib/team/visibility");
  if (!canSeePosition({ isAdmin: team.isAdmin, roleIds: team.roleIds }, app.position)) return "Für diese Stelle bist du nicht zuständig.";
  return app;
}

const actorOf = (team: Extract<TeamCtx, { ok: true }>) => {
  const u = team.user;
  return { id: u.id, globalName: u.globalName, username: u.username, discordId: u.discordId, avatar: u.avatar, isAdmin: team.isAdmin };
};

/** Status per Knopf – gleiche Regeln wie im Portal (Übergänge, Phase-2-Hürde). */
async function statusFromDiscord(applicationId: string, to: StatusButtonTarget, team: Extract<TeamCtx, { ok: true }>): Promise<string> {
  const app = await teamApp(applicationId, team);
  if (typeof app === "string") return app;
  const link = `${publicEnv.appUrl}/team/bewerbungen/${app.id}`;
  if (app.status === to) return `**${app.publicId}** steht schon auf „${STATUS_LABEL[to]}“. ${link}`;
  try {
    const { changeStatus } = await import("@/lib/team/service");
    const { jobIds } = await changeStatus({ applicationId: app.id, to, actorId: team.user.id });
    if (jobIds.length) after(() => runOutbox({ ids: jobIds }).catch(() => {}));
    return `✅ **${app.publicId}** ist jetzt „${STATUS_LABEL[to]}“. Denk an eine Nachricht an den Bewerber: ${link}?status=${to}#nachricht`;
  } catch (e) {
    return e instanceof Error ? e.message : "Hat nicht geklappt – versuch es im Portal.";
  }
}
