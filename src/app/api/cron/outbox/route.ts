import { isAuthorizedCron } from "@/lib/cron";
import { releaseStuckJobs, runOutbox } from "@/lib/discord/outbox-db";

export const maxDuration = 60;

/** Zustellung ausstehender Discord-Nachrichten (Vercel Cron oder externer Scheduler). */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  await releaseStuckJobs(5);
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const n = await runOutbox({ limit: 20 });
    total += n;
    if (n < 20) break;
  }
  return Response.json({ processed: total });
}
