import { accessErrorResponse, assertTeamApi } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

const BATCH = 100;

/**
 * Datensicherung (nur Admins): alle Bewerbungen mit Antworten, Nachrichten,
 * Kommentaren, Bewertungen, Abstimmung und Statusverlauf als JSON – in Paketen
 * gestreamt, damit auch große Bestände nicht den Speicher sprengen.
 * Hochgeladene Bilder sind nur als Verweis (Dateiname) enthalten.
 * Enthält personenbezogene Daten → Zugriff wird im Audit-Log festgehalten.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await assertTeamApi({ admin: true });
  } catch (err) {
    return accessErrorResponse(err);
  }
  const total = await db.application.count();
  await audit("settings.export", { actorId: ctx.user.id, meta: { kind: "data", applications: total } });
  const enc = new TextEncoder();
  const day = new Date().toISOString().slice(0, 10);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const positions = await db.position.findMany({ select: { id: true, slug: true, title: true } });
        controller.enqueue(enc.encode(`{"kind":"nordverkehr-daten","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"positions":${JSON.stringify(positions)},"applications":[`));
        let cursor: string | undefined;
        let first = true;
        for (;;) {
          const page = await db.application.findMany({
            take: BATCH,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            include: {
              user: { select: { discordId: true, username: true, globalName: true } },
              claimedBy: { select: { discordId: true, username: true, globalName: true } },
              answers: { select: { label: true, sectionTitle: true, type: true, value: true } },
              messages: { orderBy: { createdAt: "asc" }, select: { direction: true, body: true, createdAt: true, asTeam: true, author: { select: { username: true, globalName: true } } } },
              comments: { orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true, author: { select: { username: true, globalName: true } } } },
              ratings: { select: { scores: true, note: true, user: { select: { username: true, globalName: true } } } },
              votes: { select: { value: true, user: { select: { username: true, globalName: true } } } },
              statusChanges: { orderBy: { createdAt: "asc" }, select: { from: true, to: true, note: true, createdAt: true } },
            },
          });
          for (const a of page) {
            controller.enqueue(enc.encode((first ? "" : ",") + JSON.stringify(a)));
            first = false;
          }
          if (page.length < BATCH) break;
          cursor = page[page.length - 1].id;
        }
        controller.enqueue(enc.encode("]}"));
        controller.close();
      } catch (e) {
        console.error("[export-data]", e);
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nordverkehr-bewerbungen-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
