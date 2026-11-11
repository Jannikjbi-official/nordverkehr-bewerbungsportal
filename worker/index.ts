/**
 * Nordverkehr-Worker – läuft neben der Next-App (eigener Prozess / Container).
 *
 *  1. Discord-Gateway: reagiert auf Rollenänderungen, Beitritte und Austritte
 *     und invalidiert den Rollen-Cache sofort (entzogene Rolle = kein Zugriff).
 *  2. Outbox: stellt ausstehende DMs, Log-Posts und Rollenvergaben zu – mit
 *     Wiederholung und Backoff, falls der direkte Versand scheitert.
 *  3. Löschfristen: entfernt Daten automatisch nach den eingestellten Fristen.
 *
 * Start: `npm run worker`
 */
import "dotenv/config";
import { Client, Events, GatewayIntentBits, type GuildMember, type PartialGuildMember } from "discord.js";
import { db } from "@/lib/db";
import { releaseStuckJobs, runOutbox } from "@/lib/discord/outbox-db";
import { runRetention } from "@/lib/retention";

const OUTBOX_INTERVAL_MS = 15_000;
const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;

const log = (...args: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...args);

async function invalidate(member: GuildMember | PartialGuildMember, removed = false) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || member.guild.id !== guildId) return;
  const data = removed
    ? { roleCheckedAt: null, inGuild: false, isTeam: false, isAdmin: false }
    : { roleCheckedAt: null };
  const res = await db.user.updateMany({ where: { discordId: member.id }, data });
  if (res.count) log(`Rollen-Cache invalidiert für ${member.id}${removed ? " (Server verlassen)" : ""}`);
}

async function startGateway() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    log("Kein DISCORD_BOT_TOKEN – Gateway deaktiviert (Rollenänderungen werden nur über den Cache-Ablauf erkannt).");
    return null;
  }
  // GuildMembers ist ein privilegierter Intent ("Server Members Intent" im Developer Portal)
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  client.once(Events.ClientReady, (c) => log(`Gateway verbunden als ${c.user.tag}`));
  client.on(Events.GuildMemberUpdate, (oldM, newM) => {
    const before = oldM.partial ? null : [...oldM.roles.cache.keys()].sort().join(",");
    const after = [...newM.roles.cache.keys()].sort().join(",");
    if (before !== after) void invalidate(newM);
  });
  client.on(Events.GuildMemberAdd, (m) => void invalidate(m));
  client.on(Events.GuildMemberRemove, (m) => void invalidate(m, true));
  client.on(Events.Error, (e) => console.error("[worker] Gateway-Fehler", e));
  await client.login(token);
  return client;
}

let outboxRunning = false;
async function outboxTick() {
  if (outboxRunning) return;
  outboxRunning = true;
  try {
    await releaseStuckJobs(5);
    let processed;
    do {
      processed = await runOutbox({ limit: 20 });
      if (processed) log(`Outbox: ${processed} Job(s) verarbeitet`);
    } while (processed === 20);
  } catch (e) {
    console.error("[worker] Outbox-Fehler", e);
  } finally {
    outboxRunning = false;
  }
}

async function retentionTick() {
  try {
    const r = await runRetention();
    log("Löschfristen:", JSON.stringify(r));
  } catch (e) {
    console.error("[worker] Löschfristen-Fehler", e);
  }
}

async function main() {
  log("Start");
  const client = await startGateway().catch((e) => {
    console.error("[worker] Gateway-Start fehlgeschlagen", e);
    return null;
  });
  void outboxTick();
  void retentionTick();
  const t1 = setInterval(outboxTick, OUTBOX_INTERVAL_MS);
  const t2 = setInterval(retentionTick, RETENTION_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    log(`${signal} – fahre herunter`);
    clearInterval(t1);
    clearInterval(t2);
    await client?.destroy().catch(() => {});
    await db.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
