import { isAuthorizedCron } from "@/lib/cron";
import { runRetention } from "@/lib/retention";

export const maxDuration = 60;

/** Automatische Löschfristen (täglich). */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runRetention());
}
