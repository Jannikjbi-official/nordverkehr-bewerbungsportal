/**
 * Zustellung von Discord-Nachrichten über eine Outbox-Tabelle.
 *
 * Jede DM, jeder Log-Post und jede Rollenvergabe wird zuerst gespeichert
 * und dann zugestellt – direkt nach der Aktion (via `after()`) und, falls das
 * scheitert, mit Backoff erneut durch den Worker. So geht nichts verloren und
 * der Zustellstatus ist an der Bewerbung sichtbar.
 */
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { classifyDiscordError, type DiscordApi } from "@/lib/discord/client";
import { isTestDiscordId } from "@/lib/discord/test-ids";

/** "notify" = Rundmail (z. B. neue Stelle) – Fehler werden nicht einzeln geloggt */
export type DmPurpose = "confirmation" | "team_message" | "status" | "reminder" | "notify";

export type OutboxPayload =
  | { type: "DM"; discordUserId: string; message: RESTPostAPIChannelMessageJSONBody; purpose: DmPurpose }
  | {
      type: "CHANNEL_MESSAGE";
      channelId: string;
      message: RESTPostAPIChannelMessageJSONBody;
      /** Nach dem Posten einen Thread an der Nachricht starten (Name) */
      startThread?: string;
      /** Kanal ist ein Thread: nach dem Posten archivieren */
      archiveThread?: boolean;
    }
  | { type: "ADD_ROLE"; guildId: string; discordUserId: string; roleId: string; reason?: string };

export interface OutboxJobLike {
  id: string;
  type: OutboxPayload["type"];
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  messageId: string | null;
  applicationId: string | null;
}

export type JobOutcome =
  | { kind: "done"; result: Record<string, string> }
  | { kind: "retry"; error: string; runAt: Date }
  | { kind: "failed"; error: string; dmClosed: boolean };

export interface OutboxStore {
  complete(job: OutboxJobLike, result: Record<string, string>): Promise<void>;
  reschedule(job: OutboxJobLike, error: string, runAt: Date): Promise<void>;
  fail(job: OutboxJobLike, error: string, opts: { dmClosed: boolean }): Promise<void>;
}

/** 30 s, 2 min, 10 min, 30 min, 2 h … */
export function backoffMs(attempt: number): number {
  const steps = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
  return steps[Math.min(attempt, steps.length - 1)];
}

export async function executeJob(
  job: OutboxJobLike,
  api: DiscordApi,
  now: () => Date = () => new Date(),
): Promise<JobOutcome> {
  const payload = job.payload as OutboxPayload;
  try {
    switch (payload.type) {
      case "DM": {
        // Testbewerber: kein echter Account → nie zustellen
        if (isTestDiscordId(payload.discordUserId)) return { kind: "done", result: { skipped: "test" } };
        const channelId = await api.openDm(payload.discordUserId);
        const messageId = await api.postMessage(channelId, payload.message);
        return { kind: "done", result: { channelId, messageId } };
      }
      case "CHANNEL_MESSAGE": {
        const messageId = await api.postMessage(payload.channelId, payload.message);
        const result: Record<string, string> = { messageId };
        // Thread/Archiv sind Beiwerk: scheitern sie (fehlende Rechte), gilt die Nachricht trotzdem als zugestellt
        if (payload.startThread) {
          try {
            result.threadId = await api.startThread(payload.channelId, messageId, payload.startThread);
          } catch (err) {
            result.threadError = classifyDiscordError(err).message;
          }
        }
        if (payload.archiveThread) await api.archiveThread(payload.channelId).catch(() => {});
        return { kind: "done", result };
      }
      case "ADD_ROLE": {
        if (isTestDiscordId(payload.discordUserId)) return { kind: "done", result: { skipped: "test" } };
        await api.addRole(payload.guildId, payload.discordUserId, payload.roleId, payload.reason);
        return { kind: "done", result: { roleId: payload.roleId } };
      }
      default:
        return { kind: "failed", error: "Unbekannter Job-Typ", dmClosed: false };
    }
  } catch (err) {
    const e = classifyDiscordError(err);
    if (e.kind === "dm_closed") return { kind: "failed", error: e.message, dmClosed: true };
    const nextAttempt = job.attempts + 1;
    if (e.retryable && nextAttempt < job.maxAttempts) {
      return { kind: "retry", error: e.message, runAt: new Date(now().getTime() + backoffMs(job.attempts)) };
    }
    return { kind: "failed", error: e.message, dmClosed: false };
  }
}

export async function processJob(job: OutboxJobLike, api: DiscordApi, store: OutboxStore, now?: () => Date) {
  const outcome = await executeJob(job, api, now);
  switch (outcome.kind) {
    case "done":
      await store.complete(job, outcome.result);
      break;
    case "retry":
      await store.reschedule(job, outcome.error, outcome.runAt);
      break;
    case "failed":
      await store.fail(job, outcome.error, { dmClosed: outcome.dmClosed });
      break;
  }
  return outcome;
}
