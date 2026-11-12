/**
 * Discord-Thread pro Bewerbung (Einstellung „discord.threadPerApplication“):
 *  - Beim Post im Bewerbungs-Kanal startet der Bot einen Thread („NV-2026-0001 · Support“),
 *    die ID landet nach der Zustellung in `Application.discordThreadId`.
 *  - Interne Kommentare aus dem Portal werden dorthin gespiegelt (nur Portal → Discord).
 *  - Bei Abschluss (angenommen, abgelehnt, zurückgezogen) kommt ein letzter Hinweis, dann wird archiviert.
 */
import type { Prisma } from "@prisma/client";
import { enqueue } from "@/lib/discord/outbox-db";
import { buildBotLogMessage } from "@/lib/messages/embed";
import { getSettings } from "@/lib/settings";

export const threadName = (publicId: string, position: string) => `${publicId} · ${position}`.slice(0, 100);

/** Nachricht in den Thread einer Bewerbung (falls es einen gibt). Gibt die Job-ID zurück. */
export async function postToThread(
  app: { id: string; discordThreadId: string | null },
  line: string,
  opts: { tx?: Prisma.TransactionClient; archive?: boolean; url?: string | null; kind?: "comment" | "final" } = {},
) {
  if (!app.discordThreadId) return null;
  const s = await getSettings();
  if (!s["discord.threadPerApplication"]) return null;
  if (opts.kind === "comment" && !s["discord.threadMirrorComments"]) return null;
  const job = await enqueue(
    { type: "CHANNEL_MESSAGE", channelId: app.discordThreadId, message: buildBotLogMessage(line, { url: opts.url }), archiveThread: !!opts.archive },
    { tx: opts.tx, applicationId: app.id },
  );
  return job.id;
}
