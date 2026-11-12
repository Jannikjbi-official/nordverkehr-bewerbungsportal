import { db } from "@/lib/db";
import { accessErrorResponse, assertUserApi, getAccess } from "@/lib/auth/session";
import { forbiddenOrigin, isSameOrigin } from "@/lib/security";

async function load(id: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return db.upload.findUnique({ where: { id }, include: { application: { select: { status: true } } } });
}

/** Bild ausliefern – nur an Besitzer oder Team. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  let user;
  try {
    user = await assertUserApi();
  } catch (err) {
    return accessErrorResponse(err);
  }
  const { id } = await ctx.params;
  const upload = await load(id);
  if (!upload) return new Response("Nicht gefunden", { status: 404 });
  if (upload.ownerId !== user.id) {
    const access = await getAccess(user);
    if (!access.isTeam) return new Response("Kein Zugriff", { status: 403 });
    // Zuständigkeit pro Stelle
    if (upload.applicationId) {
      const { canAccessApplication, viewerOf } = await import("@/lib/team/visibility");
      if (!(await canAccessApplication(viewerOf(user, access), upload.applicationId))) return new Response("Kein Zugriff", { status: 403 });
    }
  }
  {
    const data = upload.data;
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${upload.id}.webp"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }
}

/** Eigenes, noch nicht eingereichtes Bild löschen. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  let user;
  try {
    user = await assertUserApi();
  } catch (err) {
    return accessErrorResponse(err);
  }
  const { id } = await ctx.params;
  const upload = await load(id);
  if (!upload || upload.ownerId !== user.id) return new Response("Nicht gefunden", { status: 404 });
  if (upload.application && upload.application.status !== "DRAFT") {
    return Response.json({ error: "Bereits eingereicht." }, { status: 409 });
  }
  await db.upload.delete({ where: { id: upload.id } });
  return new Response(null, { status: 204 });
}
