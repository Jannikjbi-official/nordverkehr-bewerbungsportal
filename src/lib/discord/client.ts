import { DiscordAPIError, HTTPError, RateLimitError, REST } from "@discordjs/rest";
import {
  Routes,
  type APIChannel,
  type APIGuildMember,
  type APIMessage,
  type RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";

/** Discord-Fehlercodes, die wir gezielt behandeln. */
export const DISCORD_CODES = {
  UNKNOWN_MEMBER: 10007,
  UNKNOWN_USER: 10013,
  UNKNOWN_CHANNEL: 10003,
  MISSING_ACCESS: 50001,
  CANNOT_DM_USER: 50007,
  MISSING_PERMISSIONS: 50013,
} as const;

export type DiscordErrorKind =
  | "not_found"
  | "dm_closed"
  | "forbidden"
  | "rate_limited"
  | "server"
  | "network"
  | "config";

export class DiscordRequestError extends Error {
  constructor(
    message: string,
    public readonly kind: DiscordErrorKind,
    public readonly code?: number | string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DiscordRequestError";
  }

  /** Lohnt sich ein erneuter Versuch? */
  get retryable() {
    return this.kind === "rate_limited" || this.kind === "server" || this.kind === "network";
  }
}

/** Übersetzt beliebige Fehler aus @discordjs/rest in einen DiscordRequestError. */
export function classifyDiscordError(err: unknown): DiscordRequestError {
  if (err instanceof DiscordRequestError) return err;
  if (err instanceof DiscordAPIError) {
    const code = err.code;
    if (code === DISCORD_CODES.CANNOT_DM_USER) {
      return new DiscordRequestError("Der Nutzer hat Direktnachrichten deaktiviert.", "dm_closed", code, err.status);
    }
    if (code === DISCORD_CODES.UNKNOWN_CHANNEL) {
      return new DiscordRequestError("Kanal nicht gefunden (10003) – ID falsch oder der Bot sieht den Kanal nicht.", "not_found", code, err.status);
    }
    if (code === DISCORD_CODES.UNKNOWN_MEMBER || code === DISCORD_CODES.UNKNOWN_USER || err.status === 404) {
      return new DiscordRequestError(`Nicht gefunden (${code}).`, "not_found", code, err.status);
    }
    if (code === DISCORD_CODES.MISSING_ACCESS) {
      return new DiscordRequestError("Kein Zugriff (50001) – der Bot ist nicht im Kanal oder darf ihn nicht sehen.", "forbidden", code, err.status);
    }
    if (code === DISCORD_CODES.MISSING_PERMISSIONS) {
      return new DiscordRequestError("Fehlende Rechte (50013) – der Bot braucht „Nachrichten senden“ in diesem Kanal.", "forbidden", code, err.status);
    }
    if (err.status === 401 || err.status === 403) {
      return new DiscordRequestError(`Keine Berechtigung (${code}): ${err.message}`.slice(0, 500), "forbidden", code, err.status);
    }
    if (err.status === 429) return new DiscordRequestError("Rate-Limit.", "rate_limited", code, err.status);
    if (err.status >= 500) return new DiscordRequestError(`Discord-Serverfehler ${err.status}.`, "server", code, err.status);
    // z. B. 50035 "Invalid Form Body" – Discord nennt das fehlerhafte Feld
    return new DiscordRequestError(`${err.message} (${code})`.slice(0, 800), "forbidden", code, err.status);
  }
  if (err instanceof RateLimitError) return new DiscordRequestError("Rate-Limit.", "rate_limited", undefined, 429);
  if (err instanceof HTTPError) {
    return new DiscordRequestError(`HTTP ${err.status}`, err.status >= 500 ? "server" : "forbidden", undefined, err.status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new DiscordRequestError(message, "network");
}

export interface GuildMemberInfo {
  roles: string[];
  joinedAt: Date | null;
  nick: string | null;
}

/** Schmale Schnittstelle zu Discord – im Test leicht zu ersetzen. */
export interface DiscordApi {
  /** null = Nutzer ist nicht auf dem Server. Wirft bei API-/Netzwerkfehlern. */
  getMember(guildId: string, userId: string): Promise<GuildMemberInfo | null>;
  openDm(userId: string): Promise<string>;
  postMessage(channelId: string, body: RESTPostAPIChannelMessageJSONBody): Promise<string>;
  /** Eigene Nachricht des Bots löschen. Bereits gelöschte Nachrichten sind kein Fehler. */
  deleteMessage(channelId: string, messageId: string): Promise<void>;

  addRole(guildId: string, userId: string, roleId: string, reason?: string): Promise<void>;
}

export function createDiscordApi(token: string, opts: { timeoutMs?: number } = {}): DiscordApi {
  const rest = new REST({ version: "10", timeout: opts.timeoutMs ?? 8000, retries: 2 }).setToken(token);

  return {
    async getMember(guildId, userId) {
      try {
        const m = (await rest.get(Routes.guildMember(guildId, userId))) as APIGuildMember;
        return { roles: m.roles, joinedAt: m.joined_at ? new Date(m.joined_at) : null, nick: m.nick ?? null };
      } catch (err) {
        const e = classifyDiscordError(err);
        if (e.kind === "not_found") return null;
        throw e;
      }
    },
    async openDm(userId) {
      try {
        const ch = (await rest.post(Routes.userChannels(), { body: { recipient_id: userId } })) as APIChannel;
        return ch.id;
      } catch (err) {
        throw classifyDiscordError(err);
      }
    },
    async postMessage(channelId, body) {
      try {
        const msg = (await rest.post(Routes.channelMessages(channelId), { body })) as APIMessage;
        return msg.id;
      } catch (err) {
        throw classifyDiscordError(err);
      }
    },
    async deleteMessage(channelId, messageId) {
      try {
        await rest.delete(Routes.channelMessage(channelId, messageId));
      } catch (err) {
        const e = classifyDiscordError(err);
        if (e.kind === "not_found") return; // schon weg (z. B. von Hand gelöscht)
        throw e;
      }
    },
    async addRole(guildId, userId, roleId, reason) {
      try {
        await rest.put(Routes.guildMemberRole(guildId, userId, roleId), { reason });
      } catch (err) {
        throw classifyDiscordError(err);
      }
    },
  };
}

let singleton: DiscordApi | null = null;

/** Prozessweite Discord-Instanz (Bot-Token aus der .env). */
export function getDiscordApi(): DiscordApi {
  if (singleton) return singleton;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new DiscordRequestError("DISCORD_BOT_TOKEN fehlt.", "config");
  singleton = createDiscordApi(token);
  return singleton;
}

/** Nur für Tests. */
export function setDiscordApiForTests(api: DiscordApi | null) {
  singleton = api;
}
