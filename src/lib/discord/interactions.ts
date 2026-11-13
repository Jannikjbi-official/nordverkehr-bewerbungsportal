/**
 * Discord-Interaktionen (Knöpfe in Bot-Nachrichten) über HTTP:
 * Discord schickt jeden Klick als POST an /api/discord/interactions.
 * Jede Anfrage ist mit Ed25519 signiert – ohne gültige Signatur → 401.
 *
 * Knöpfe (custom_id):
 *  - nv:claim:<applicationId>  → Bewerbung übernehmen (nur Team-Rolle)
 *  - nv:status:<IN_REVIEW|INTERVIEW>:<applicationId> → Status setzen (Team, gleiche Regeln wie im Portal)
 *  - nv:reply:<applicationId>  → Fenster „Antworten“ öffnen (Team) → nv:replysubmit:<applicationId>
 *  - nv:answer:<applicationId> → Bewerber: Fenster „Zurückschreiben“ (Knopf in Team-Nachrichten-DMs)
 *    → nv:answersubmit:<applicationId> → Antwort landet im Portal (wie dort geschrieben)
 *  - nv:cancel:<applicationId>:<Termin, Unix-Sek.> → Bewerber: Gespräch absagen (fragt nach)
 *  - nv:cancelok:<applicationId>:<Termin> → Bewerber: Absage bestätigt
 *    (Knopf gilt nur für den Termin, zu dem die Erinnerung gehörte)
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

export const CANCEL_PREFIX = "nv:cancel:";
export const CANCEL_OK_PREFIX = "nv:cancelok:";
export const cancelCustomId = (applicationId: string, at: Date) => `${CANCEL_PREFIX}${applicationId}:${Math.floor(at.getTime() / 1000)}`;

export const replyCustomId = (applicationId: string) => `nv:reply:${applicationId}`;
/** Bewerber-Knopf „Zurückschreiben“ in der DM */
export const answerCustomId = (applicationId: string) => `nv:answer:${applicationId}`;
export const ANSWER_BUTTON = { label: "Zurückschreiben", emoji: "✍️" } as const;
/** Link-Knopf in Nachrichten-DMs: direkt zum Antwortfeld der Bewerbung im Portal */
export const PORTAL_ANSWER_LABEL = "Im Portal antworten";
export const portalAnswerUrl = (appUrl: string, applicationId: string) => `${appUrl}/dashboard/${applicationId}#antworten`;

/** Knopf für buildApplicantMessage – nur wenn Discord-Interaktionen eingerichtet sind (sonst „Interaktion fehlgeschlagen“). */
export const answerAction = (applicationId: string, interactionsReady: boolean) =>
  interactionsReady ? { label: ANSWER_BUTTON.label, customId: answerCustomId(applicationId), emoji: ANSWER_BUTTON.emoji } : null;
export const STATUS_BUTTON_TARGETS = ["IN_REVIEW", "INTERVIEW"] as const;
export type StatusButtonTarget = (typeof STATUS_BUTTON_TARGETS)[number];

export type CustomAction =
  | { kind: "claim" | "cancelInterview" | "cancelInterviewConfirmed" | "reply" | "replySubmit" | "answer" | "answerSubmit"; applicationId: string; at?: number }
  | { kind: "status"; applicationId: string; to: StatusButtonTarget };

export function parseCustomId(customId: string): CustomAction | null {
  const st = customId.match(/^nv:status:(IN_REVIEW|INTERVIEW):([a-z0-9]{10,40})$/i);
  if (st) return { kind: "status", to: st[1].toUpperCase() as StatusButtonTarget, applicationId: st[2] };
  const kinds: [string, Exclude<CustomAction["kind"], "status">][] = [
    ["nv:replysubmit:", "replySubmit"],
    ["nv:answersubmit:", "answerSubmit"],
    ["nv:answer:", "answer"],
    ["nv:reply:", "reply"],
    [CLAIM_PREFIX, "claim"],
    [CANCEL_OK_PREFIX, "cancelInterviewConfirmed"],
    [CANCEL_PREFIX, "cancelInterview"],
  ];
  for (const [prefix, kind] of kinds) {
    if (!customId.startsWith(prefix)) continue;
    const m = customId.slice(prefix.length).match(/^([a-z0-9]{10,40})(?::(\d{1,12}))?$/i);
    if (!m) return null;
    return m[2] ? { kind, applicationId: m[1], at: Number(m[2]) } : { kind, applicationId: m[1] };
  }
  return null;
}

/** Fenster (Modal) „Antwort an den Bewerber“ – Interaktionsantwort Typ 9. */
export function replyModal(applicationId: string, publicId: string | null) {
  return {
    type: 9,
    data: {
      custom_id: `nv:replysubmit:${applicationId}`,
      title: `Antwort an ${publicId ?? "Bewerber"}`.slice(0, 45),
      components: [
        {
          type: 1,
          components: [{ type: 4, custom_id: "body", label: "Nachricht (geht per DM und ins Portal)", style: 2, min_length: 2, max_length: 2000, required: true }],
        },
      ],
    },
  };
}

/** Fenster „Zurückschreiben“ für Bewerber – Antwort geht ins Portal an das Team. */
export function answerModal(applicationId: string, publicId: string | null) {
  return {
    type: 9,
    data: {
      custom_id: `nv:answersubmit:${applicationId}`,
      title: `Antwort zu ${publicId ?? "deiner Bewerbung"}`.slice(0, 45),
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "body",
              label: "Deine Antwort ans Team",
              placeholder: "Erscheint im Portal bei deiner Bewerbung.",
              style: 2,
              min_length: 2,
              max_length: 2000,
              required: true,
            },
          ],
        },
      ],
    },
  };
}

/** Text aus einem abgeschickten Fenster lesen. */
export function modalValue(data: unknown, field: string): string {
  const rows = (data as { components?: { components?: { custom_id?: string; value?: string }[] }[] } | undefined)?.components ?? [];
  for (const r of rows) for (const c of r.components ?? []) if (c.custom_id === field) return String(c.value ?? "");
  return "";
}

/** Rückfrage vor dem Absagen (nur für die Person sichtbar). */
export function cancelConfirmReply(applicationId: string, at: Date) {
  const sec = Math.floor(at.getTime() / 1000);
  const when = `<t:${sec}:f>`;
  return {
    type: 4,
    data: {
      content: `Willst du dein Gespräch ${when} wirklich absagen? Das Team bekommt Bescheid, und du kannst im Portal einen neuen Termin aussuchen (falls freie Termine da sind).`,
      flags: 64,
      allowed_mentions: { parse: [] },
      components: [{ type: 1, components: [{ type: 2, style: 4, label: "Ja, absagen", custom_id: `${CANCEL_OK_PREFIX}${applicationId}:${sec}` }] }],
    },
  };
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

/** Team-Befehle (Prüfung der Team-Rolle im Handler; Discord kennt die Rolle nicht) */
export const OPEN_COMMAND = {
  name: "offen",
  type: 1,
  description: "Team: offene Bewerbungen deiner Stellen (nur für dich sichtbar)",
  dm_permission: false,
} as const;

export const CLAIM_COMMAND = {
  name: "claim",
  type: 1,
  description: "Team: Bewerbung übernehmen",
  dm_permission: false,
  options: [{ type: 3, name: "id", description: "Bewerbungs-ID, z. B. NV-2026-0012 oder 12", required: true, max_length: 40 }],
} as const;

export const ALL_COMMANDS = [STATUS_COMMAND, OPEN_COMMAND, CLAIM_COMMAND] as const;

/**
 * Eingabe von /claim in eine Bewerbungs-ID übersetzen: „NV-2026-0012“, „nv-2026-12“,
 * „0012“ oder „12“ (dann aktuelles Jahr). Gibt die normalisierte publicId zurück.
 */
export function normalizePublicId(input: string, year: number, prefix = "NV"): string | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, "");
  const p = prefix.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let m = s.match(new RegExp(`^${p}-?(\\d{4})-?(\\d{1,5})$`));
  if (m) return `${prefix.toUpperCase()}-${m[1]}-${m[2].padStart(4, "0")}`;
  m = s.match(/^#?(\d{1,5})$/);
  if (m) return `${prefix.toUpperCase()}-${year}-${m[1].padStart(4, "0")}`;
  return null;
}

export interface OpenListApp {
  id: string;
  publicId: string | null;
  statusLabel: string;
  position: string;
  submittedAt: Date | null;
  claimedBy: string | null;
}

/** Antwort für /offen: kompakte Liste mit Links. */
export function openListReply(apps: OpenListApp[], total: number, appUrl: string): string {
  if (!apps.length) return "Keine offenen Bewerbungen für deine Stellen. 🎉";
  const lines = apps.map(
    (a) =>
      `- **${a.publicId ?? "?"}** · ${md(a.position)} · ${a.statusLabel}${a.submittedAt ? ` · ${ts(a.submittedAt, "R")}` : ""} · ${a.claimedBy ? `betreut von ${md(a.claimedBy)}` : "**frei**"}\n  -# ${appUrl}/team/bewerbungen/${a.id}`,
  );
  const more = total > apps.length ? `\n-# … und ${total - apps.length} weitere: ${appUrl}/team/bewerbungen` : "";
  return `**Offene Bewerbungen (${total})**\n${lines.join("\n")}${more}\n-# Übernehmen: \`/claim id:NV-…\``;
}

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
