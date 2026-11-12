import { z } from "zod";
import { accessErrorResponse, assertTeamApi } from "@/lib/auth/session";
import { forbiddenOrigin, isSameOrigin } from "@/lib/security";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { AiError, assertAiAllowed, callAi, loadApplicationContext } from "@/lib/ai/service";
import { buildPrompt } from "@/lib/ai/prompts";
import { sanitizeOutput } from "@/lib/ai/guard";

// Gestreamte KI-Antworten können etwas dauern (Vercel-Funktionslimit)
export const maxDuration = 60;

const bodySchema = z.object({
  feature: z.enum(["summary", "questions", "hints"]),
  applicationId: z.string().regex(/^[a-z0-9]{10,40}$/i),
});

/**
 * KI-Hinweise für das Team (Zusammenfassung, Fragen, Auffälligkeiten).
 * Antwortet mit gestreamtem Klartext. Die KI erzeugt nur Hinweise –
 * Entscheidungen und Nachrichten bleiben beim Team.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  let ctx;
  try {
    ctx = await assertTeamApi();
  } catch (err) {
    return accessErrorResponse(err);
  }
  const raw = await req.text();
  if (raw.length > 2000) return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
  const parsed = bodySchema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const input = parsed.data;
  const { canAccessApplication, viewerOf } = await import("@/lib/team/visibility");
  if (!(await canAccessApplication(viewerOf(ctx.user, ctx.access), input.applicationId))) return Response.json({ error: "Für diese Stelle bist du nicht zuständig." }, { status: 403 });
  const settings = await getSettings();

  let prompt: string;
  try {
    await assertAiAllowed(ctx.user.id, settings);
    prompt = buildPrompt(input.feature, await loadApplicationContext(input.applicationId, settings));
  } catch (err) {
    if (err instanceof AiError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }

  await audit("ai.request", { actorId: ctx.user.id, targetType: "application", targetId: input.applicationId, meta: { feature: input.feature } });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await callAi({
          feature: input.feature,
          userId: ctx.user.id,
          settings,
          system: settings["ai.systemPrompt"],
          prompt,
          signal: abort.signal,
          onText: (delta) => controller.enqueue(encoder.encode(delta)),
        });
        if (res.refused) throw new AiError("Die KI hat diese Anfrage abgelehnt.", 422);
        if (input.feature === "summary") {
          const clean = sanitizeOutput(res.text, { maxChars: 6000, allowedHosts: ["nordverkehr.xyz"] });
          await db.application.update({ where: { id: input.applicationId }, data: { aiSummary: clean, aiSummaryAt: new Date() } });
        }
      } catch (err) {
        const message = err instanceof AiError ? err.message : "Die KI ist gerade nicht erreichbar. Das Portal funktioniert ohne sie weiter.";
        if (!(err instanceof AiError)) console.error("[ai]", err);
        controller.enqueue(encoder.encode(`\u0000ERROR:${message}`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
