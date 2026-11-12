import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { buildIcs, isTokenShaped } from "@/lib/team/calendar";
import { visiblePositionFilter } from "@/lib/team/visibility";

/** Gesprächstermine als .ics – Zugang über den geheimen Schlüssel eines Teammitglieds. */
export async function GET(_req: Request, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token } = await ctx.params;
  const clean = token.replace(/\.ics$/, "");
  if (!isTokenShaped(clean)) return new Response("Nicht gefunden", { status: 404 });
  const user = await db.user.findFirst({ where: { calendarToken: clean } });
  // Nur (noch) Teammitglieder – Rolle weg = Kalender leer/ungültig
  if (!user || !user.isTeam) return new Response("Nicht gefunden", { status: 404 });
  const since = new Date(Date.now() - 14 * 86_400_000);
  const apps = await db.application.findMany({
    where: { status: "INTERVIEW", interviewAt: { gte: since }, ...(await visiblePositionFilter(user)) },
    include: { position: { select: { title: true } }, slot: { select: { durationMin: true } }, claimedBy: { select: { id: true, globalName: true, username: true } } },
    orderBy: { interviewAt: "asc" },
    take: 300,
  });
  const ics = buildIcs(
    apps.map((a) => ({
      uid: `${a.id}-${a.interviewAt!.getTime()}`,
      start: a.interviewAt!,
      end: new Date(a.interviewAt!.getTime() + (a.slot?.durationMin ?? 30) * 60_000),
      summary: `${a.claimedById === user.id ? "⭐ " : ""}Gespräch ${a.position.title} (${a.publicId ?? ""})`,
      description: `Betreut von: ${a.claimedBy ? a.claimedBy.globalName || a.claimedBy.username : "noch niemand"}\n${publicEnv.appUrl}/team/bewerbungen/${a.id}`,
      url: `${publicEnv.appUrl}/team/bewerbungen/${a.id}`,
    })),
  );
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="nordverkehr-gespraeche.ics"' },
  });
}
