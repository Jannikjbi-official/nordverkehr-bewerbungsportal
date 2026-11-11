import { db } from "@/lib/db";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Fester Zeitfenster-Zähler in der Datenbank (funktioniert mit mehreren
 * Instanzen / Serverless, ohne Redis).
 *
 * Ablauf: atomar hochzählen, solange das Fenster läuft (Einzeldokument-Update
 * ist in MongoDB atomar). Ist es abgelaufen oder neu, wird es zurückgesetzt.
 * Bei gleichzeitigen Fenster-Resets kann ein Zähler minimal zu niedrig sein –
 * für Rate Limiting unkritisch.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = new Date();
  const bumped = await db.rateLimit.updateMany({
    where: { key, resetAt: { gt: now } },
    data: { count: { increment: 1 } },
  });

  if (bumped.count === 0) {
    const resetAt = new Date(now.getTime() + windowSeconds * 1000);
    try {
      await db.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
    } catch {
      // Paralleles Anlegen (Duplicate Key) – dann zählt der andere Request
      await db.rateLimit.updateMany({ where: { key }, data: { count: { increment: 1 } } });
    }
    return { ok: limit >= 1, remaining: Math.max(0, limit - 1), resetAt };
  }

  const row = await db.rateLimit.findUnique({ where: { key } });
  const count = row?.count ?? 1;
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt: row?.resetAt ?? now };
}

export class RateLimitedError extends Error {
  constructor(public readonly resetAt: Date) {
    super("Zu viele Anfragen. Versuch es gleich nochmal.");
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.ok) throw new RateLimitedError(r.resetAt);
  return r;
}
