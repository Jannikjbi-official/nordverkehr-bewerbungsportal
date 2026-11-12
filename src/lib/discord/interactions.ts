/**
 * Discord-Interaktionen (Knöpfe in Bot-Nachrichten) über HTTP:
 * Discord schickt jeden Klick als POST an /api/discord/interactions.
 * Jede Anfrage ist mit Ed25519 signiert – ohne gültige Signatur → 401.
 *
 * Knöpfe (custom_id):
 *  - nv:claim:<applicationId>  → Bewerbung übernehmen (nur Team-Rolle)
 * Slash-Befehle:
 *  - /bewerbung                → eigener Bewerbungsstand (nur für die Person sichtbar)
 *
 * Antworten sind „ephemeral“ (nur für die klickende Person sichtbar).
 */
import { createPublicKey, verify } from "node:crypto";

/** SPKI-Präfix für einen rohen 32-Byte-Ed25519-Schlüssel */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, body: string): boolean {
  if (!signatureHex || !timestamp || !/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

let cachedKey: string | null = null;

/** Öffentlicher Schlüssel der App: DISCORD_PUBLIC_KEY oder per Bot-Token von Discord geholt. */
export async function getDiscordPublicKey(): Promise<string | null> {
  if (process.env.DISCORD_PUBLIC_KEY) return process.env.DISCORD_PUBLIC_KEY;
  if (cachedKey) return cachedKey;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch("https://discord.com/api/v10/applications/@me", { headers: { Authorization: `Bot ${token}` }, cache: "no-store" });
  if (!res.ok) return null;
  const app = (await res.json()) as { verify_key?: string };
  cachedKey = app.verify_key ?? null;
  return cachedKey;
}

export const CLAIM_PREFIX = "nv:claim:";
export const claimCustomId = (applicationId: string) => `${CLAIM_PREFIX}${applicationId}`;

export function parseCustomId(customId: string): { kind: "claim"; applicationId: string } | null {
  if (customId.startsWith(CLAIM_PREFIX)) {
    const id = customId.slice(CLAIM_PREFIX.length);
    if (/^[a-z0-9]{10,40}$/i.test(id)) return { kind: "claim", applicationId: id };
  }
  return null;
}

/** Interaktions-Antwort: nur für die klickende Person sichtbar. */
export const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });

/** Slash-Befehl /bewerbung (Guild-Befehl, per Admin-Knopf registriert). */
export const STATUS_COMMAND = {
  name: "bewerbung",
  type: 1,
  description: "Zeigt dir den Stand deiner Bewerbung bei Nordverkehr (nur für dich sichtbar)",
  dm_permission: false,
} as const;

export interface StatusReplyApp {
  id: string;
  publicId: string | null;
  status: string;
  statusLabel: string;
  position: string;
  submittedAt: Date | null;
  interviewAt: Date | null;
}

const ts = (d: Date, style: "f" | "R" | "D" = "f") => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;
const md = (s: string) => s.replace(/([\\*_~`|>#@[\]])/g, "\\$1");

/**
 * Antworttext für /bewerbung. Nur Daten der fragenden Person (Abgleich über die
 * Discord-ID aus der signierten Interaktion) – nie die anderer Bewerber.
 */
export function statusCommandReply(apps: StatusReplyApp[], appUrl: string): string {
  if (!apps.length) {
    return `Du hast gerade keine Bewerbung bei uns. Offene Stellen findest du hier: ${appUrl}`;
  }
  const lines = apps.slice(0, 5).map((a) => {
    const head = `**${md(a.position)}**${a.publicId ? ` · \`${a.publicId}\`` : ""} – ${a.statusLabel}`;
    const extra: string[] = [];
    if (a.status === "DRAFT") extra.push(`noch nicht abgeschickt – weitermachen: ${appUrl}/dashboard`);
    else if (a.submittedAt) extra.push(`eingereicht ${ts(a.submittedAt, "D")}`);
    if (a.status === "INTERVIEW" && a.interviewAt) extra.push(`Gespräch ${ts(a.interviewAt)}`);
    if (a.status !== "DRAFT") extra.push(`${appUrl}/dashboard/${a.id}`);
    return `- ${head}${extra.length ? `\n  -# ${extra.join(" · ")}` : ""}`;
  });
  const more = apps.length > 5 ? `\n-# … und ${apps.length - 5} weitere im Portal: ${appUrl}/dashboard` : "";
  return `${apps.length === 1 ? "Deine Bewerbung" : "Deine Bewerbungen"}:\n${lines.join("\n")}${more}`;
}
