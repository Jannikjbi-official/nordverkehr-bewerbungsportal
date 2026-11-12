/**
 * Prisma-Anbindung der Outbox (ohne `server-only`, wird auch vom Worker genutzt).
 */
import { db } from "@/lib/db";
import { getDiscordApi } from "@/lib/discord/client";
import { processJob, type OutboxJobLike, type OutboxPayload, type OutboxStore } from "@/lib/discord/outbox";
import type { Prisma } from "@prisma/client";

function purposeOf(job: OutboxJobLike) {
  const p = job.payload as OutboxPayload;
  return p.type === "DM" ? p.purpose : null;
}

export const prismaOutboxStore: OutboxStore = {
  async complete(job, result) {
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.outboxJob.update({
        where: { id: job.id },
        data: { status: "DONE", attempts: { increment: 1 }, result, lastError: null, lockedAt: null },
      });
      if (job.messageId) {
        // Testbewerber: nichts verschickt → im Portal als „nicht per DM“ zeigen
        const skipped = result.skipped === "test";
        await tx.message.update({
          where: { id: job.messageId },
          data: skipped ? { deliveryStatus: "NOT_SENT", deliveryError: null } : { deliveryStatus: "SENT", sentAt: now, deliveryError: null },
        });
      }
      if (job.applicationId && purposeOf(job) === "confirmation" && result.skipped !== "test") {
        await tx.application.update({ where: { id: job.applicationId }, data: { confirmationDmStatus: "SENT" } });
      }
      // Thread zur Bewerbung angelegt → merken (Kommentare & Abschluss landen dort)
      if (job.applicationId && result.threadId) {
        // updateMany: ist die Bewerbung inzwischen gelöscht, darf der Job nicht scheitern (sonst doppelter Post)
        await tx.application.updateMany({ where: { id: job.applicationId }, data: { discordThreadId: result.threadId } });
      }
    });
  },
  async reschedule(job, error, runAt) {
    console.warn("[outbox] neuer Versuch geplant", job.type, error);
    await db.outboxJob.update({
      where: { id: job.id },
      data: { status: "PENDING", attempts: { increment: 1 }, lastError: error, runAt, lockedAt: null },
    });
  },
  async fail(job, error, { dmClosed }) {
    const status = dmClosed ? "DM_CLOSED" : "FAILED";
    const pl = job.payload as OutboxPayload;
    console.warn("[outbox] fehlgeschlagen", job.type, pl.type === "CHANNEL_MESSAGE" ? `Kanal ${pl.channelId}` : "", error);
    await db.$transaction(async (tx) => {
      await tx.outboxJob.update({
        where: { id: job.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: error, lockedAt: null },
      });
      if (job.messageId) {
        await tx.message.update({ where: { id: job.messageId }, data: { deliveryStatus: status, deliveryError: error } });
      }
      if (job.applicationId && purposeOf(job) === "confirmation") {
        await tx.application.update({ where: { id: job.applicationId }, data: { confirmationDmStatus: status } });
      }
    });
    // Nur DM-Fehler protokollieren (ein fehlgeschlagener Log-Post erzeugt keinen weiteren Log)
    const p = job.payload as OutboxPayload;
    if (p.type === "DM" && p.purpose !== "notify" && p.purpose !== "digest") {
      const { botLog } = await import("@/lib/discord/botlog");
      const app = job.applicationId ? await db.application.findUnique({ where: { id: job.applicationId }, select: { publicId: true } }) : null;
      await botLog(
        `⚠️ DM an <@${p.discordUserId}>${app?.publicId ? ` (${app.publicId})` : ""} nicht zugestellt: ${dmClosed ? "DMs geschlossen" : error.slice(0, 200)}`,
        { applicationId: job.applicationId ?? undefined, tone: "warn" },
      ).catch(() => null);
    }
  },
};

export async function enqueue(
  payload: OutboxPayload,
  opts: { messageId?: string; applicationId?: string; tx?: Prisma.TransactionClient; runAt?: Date } = {},
) {
  const client = opts.tx ?? db;
  // Nachtruhe: DMs an Bewerber / Team-Posts erst zum Ende der Nachtruhe
  const { getSettings } = await import("@/lib/settings");
  const { nightHoldUntil } = await import("@/lib/night");
  const holdUntil = nightHoldUntil(payload as { type: string; purpose?: string; kind?: string; ignoreNight?: boolean }, await getSettings());
  return client.outboxJob.create({
    data: {
      type: payload.type,
      payload: payload as unknown as Prisma.InputJsonValue,
      messageId: opts.messageId,
      applicationId: opts.applicationId,
      // Geplanter Zeitpunkt (z. B. Erinnerung vor dem Gespräch); Nachtruhe kann ihn nur nach hinten schieben
      ...(holdUntil || opts.runAt ? { runAt: new Date(Math.max(holdUntil?.getTime() ?? 0, opts.runAt?.getTime() ?? 0)) } : {}),
    },
    select: { id: true },
  });
}

const JOB_SELECT = { id: true, type: true, payload: true, attempts: true, maxAttempts: true, messageId: true, applicationId: true } as const;

/**
 * Holt fällige Jobs exklusiv. Jeder Job wird per bedingtem Update
 * (status PENDING → PROCESSING) "geclaimt" – das Einzeldokument-Update ist in
 * MongoDB atomar, also verarbeiten parallele Instanzen (Vercel, Worker) einen
 * Job nie doppelt.
 */
async function claim(limit: number, ids?: string[]): Promise<OutboxJobLike[]> {
  const now = new Date();
  const candidates = await db.outboxJob.findMany({
    // Auch bei gezielter Zustellung nur fällige Jobs (Nachtruhe, geplante Wiederholungen)
    where: ids?.length ? { id: { in: ids }, status: "PENDING", runAt: { lte: now } } : { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: ids?.length ? ids.length : limit,
    select: JOB_SELECT,
  });
  // Parallel claimen – jedes Update ist für sich atomar
  const results = await Promise.all(
    candidates.map((job) =>
      db.outboxJob.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "PROCESSING", lockedAt: now } }).then((r) => (r.count === 1 ? job : null)),
    ),
  );
  return results.filter((j) => j !== null) as OutboxJobLike[];
}

/** Hängengebliebene Jobs (Prozess abgestürzt / Funktion abgebrochen) wieder freigeben. */
export async function releaseStuckJobs(olderThanMinutes = 5) {
  const res = await db.outboxJob.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
    data: { status: "PENDING", lockedAt: null },
  });
  return res.count;
}

export async function runOutbox(opts: { ids?: string[]; limit?: number } = {}) {
  let api;
  try {
    api = getDiscordApi();
  } catch (err) {
    console.warn("[outbox] Discord nicht konfiguriert – Jobs bleiben in der Warteschlange.", (err as Error).message);
    return 0;
  }
  const jobs = await claim(opts.limit ?? 20, opts.ids);
  const one = async (job: OutboxJobLike) => {
    try {
      await processJob(job, api, prismaOutboxStore);
    } catch (err) {
      console.error("[outbox] Job-Verarbeitung fehlgeschlagen", job.id, err);
      await db.outboxJob
        .update({ where: { id: job.id }, data: { status: "PENDING", lockedAt: null, lastError: String(err) } })
        .catch(() => {});
    }
  };
  // Mehrere Jobs gleichzeitig (Discord-Ratelimits regelt @discordjs/rest selbst)
  for (let i = 0; i < jobs.length; i += CONCURRENCY) await Promise.all(jobs.slice(i, i + CONCURRENCY).map(one));
  return jobs.length;
}

const CONCURRENCY = 5;

/**
 * Bestimmte Jobs vollständig zustellen – in Paketen, statt nur die ersten 20.
 * Mit `deadline` (ms-Zeitstempel) wird rechtzeitig aufgehört; der Rest bleibt in der
 * Warteschlange und geht beim nächsten Durchlauf raus (Crons dürfen nicht am Zeitlimit scheitern).
 */
export async function runOutboxAll(ids: string[], opts: { chunk?: number; deadline?: number } = {}) {
  const chunk = opts.chunk ?? 20;
  let done = 0;
  for (let i = 0; i < ids.length; i += chunk) {
    if (opts.deadline && Date.now() >= opts.deadline) break;
    const part = ids.slice(i, i + chunk);
    done += await runOutbox({ ids: part, limit: part.length });
  }
  return done;
}

/**
 * Sofort zustellen und dabei kurz warten (Nachricht ist dann direkt „zugestellt“).
 * Dauert es länger als `waitMs`, läuft der Rest nach der Antwort weiter.
 */
export async function deliverNow(jobIds: string[], waitMs = 4000) {
  if (!jobIds.length) return;
  const { after } = await import("next/server");
  const run = runOutbox({ ids: jobIds }).catch((e) => console.error("[outbox]", e));
  await Promise.race([run, new Promise((r) => setTimeout(r, waitMs))]);
  // Sicherheitsnetz: was noch PENDING ist, nach der Antwort erneut versuchen
  after(() => runOutbox({ ids: jobIds }).catch((e) => console.error("[outbox]", e)));
}
