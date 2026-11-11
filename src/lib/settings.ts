import { z } from "zod";
import { db } from "@/lib/db";

export const DEFAULT_SYSTEM_PROMPT = `Du unterstützt das Team von Nordverkehr, einem Hamburg-Roleplay-Server (Start auf GTA 5, danach GTA 6), bei der Bearbeitung von Team-Bewerbungen.

Ton: ehrlich, direkt, norddeutsch, freundlich, immer in der Du-Form. Kein Marketing-Sprech, keine Floskeln, keine Emojis-Flut. Kurz und klar – "Klein, direkt und mit klarem Plan."

Grenzen:
- Du triffst keine Entscheidungen über Annahme oder Ablehnung und vergibst keine Punktzahlen oder Rankings.
- Du formulierst ausschließlich Entwürfe und Hinweise. Ein Teammitglied prüft alles und entscheidet selbst.
- Erfinde keine Fakten über Bewerber oder den Server. Wenn Informationen fehlen, sag das.
- Bewerte Menschen nie nach Herkunft, Geschlecht, Alter (über das Mindestalter hinaus), Gesundheit oder anderen geschützten Merkmalen.`;

export const DEFAULT_CONFIRMATION_TEMPLATE = `Moin {name},

danke für deine Bewerbung als **{position}** bei Nordverkehr – sie ist am {datum} bei uns eingegangen.

**Bewerbungs-ID:** {bewerbungs_id}

**So geht's weiter:**
1. Das Team liest sich deine Bewerbung in Ruhe durch.
2. Bei Rückfragen melden wir uns hier per DM oder im Portal.
3. Passt es, laden wir dich zu einem kurzen Gespräch auf TeamSpeak ein.

Die Bearbeitung dauert {bearbeitungszeit}. Bitte frag in der Zwischenzeit nicht im Support nach – wir melden uns.

Den aktuellen Stand siehst du jederzeit in deinem Dashboard.

Moin, dein Nordverkehr-Team`;

// "false"/"true"/"on" aus Formularen sauber in Booleans übersetzen
const bool = (def: boolean) =>
  z
    .preprocess((v) => (v === "true" || v === "on" ? true : v === "false" || v === "off" ? false : v), z.boolean())
    .default(def);

/** Alle einstellbaren Werte mit Typ, Grenzen und Standard. */
export const settingsSchema = z.object({
  "applications.minAge": z.coerce.number().int().min(12).max(99).default(18),
  "applications.cooldownDays": z.coerce.number().int().min(0).max(365).default(30),
  "applications.processingTime": z.string().min(2).max(80).default("in der Regel 3–7 Tage"),
  "applications.minFillSeconds": z.coerce.number().int().min(0).max(3600).default(90),
  "applications.minDiscordAccountDays": z.coerce.number().int().min(0).max(3650).default(30),

  "discord.logChannelEnabled": bool(true),
  "discord.autoRoleOnAccept": bool(false),

  "messages.confirmationTemplate": z.string().min(10).max(3500).default(DEFAULT_CONFIRMATION_TEMPLATE),

  "retention.draftDays": z.coerce.number().int().min(1).max(365).default(30),
  "retention.withdrawnDays": z.coerce.number().int().min(1).max(730).default(90),
  "retention.rejectedDays": z.coerce.number().int().min(1).max(730).default(180),
  "retention.acceptedDays": z.coerce.number().int().min(1).max(1825).default(365),
  "retention.auditDays": z.coerce.number().int().min(30).max(1825).default(365),

  "ai.enabled": bool(false),
  "ai.model": z.string().min(3).max(80).default(process.env.AI_MODEL_DEFAULT ?? "claude-sonnet-5-5"),
  "ai.fastModel": z.string().min(3).max(80).default(process.env.AI_MODEL_FAST ?? "claude-haiku-5-5"),
  "ai.systemPrompt": z.string().min(20).max(8000).default(DEFAULT_SYSTEM_PROMPT),
  "ai.monthlyBudgetUsd": z.coerce.number().min(0).max(10000).default(20),
  "ai.requestsPerHour": z.coerce.number().int().min(1).max(500).default(30),
  /** Tokens (Ein+Aus) pro Nutzer und Tag – gilt für Team UND Bewerber (Auto-Antworten) */
  "ai.tokensPerUserPerDay": z.coerce.number().int().min(1000).max(2_000_000).default(40_000),
  /** Max. Zeichen Bewerbungsinhalt, die pro Anfrage an die KI gehen (Rest wird abgeschnitten) */
  "ai.maxInputChars": z.coerce.number().int().min(2000).max(100_000).default(24_000),

  "ai.autoTagEnabled": bool(true),

  "ai.autoReplyEnabled": bool(false),
  /** Team gilt als offline, wenn niemand in den letzten X Minuten im Team-Bereich aktiv war */
  "ai.autoReplyOfflineMinutes": z.coerce.number().int().min(1).max(1440).default(15),
  "ai.autoReplyMaxInputChars": z.coerce.number().int().min(50).max(2000).default(800),
  "ai.autoReplyMaxOutputTokens": z.coerce.number().int().min(50).max(1500).default(350),
  "ai.autoReplyPerUserPerDay": z.coerce.number().int().min(1).max(50).default(5),
  /** Mindestabstand zwischen zwei Auto-Antworten an denselben Bewerber */
  "ai.autoReplyCooldownMinutes": z.coerce.number().int().min(0).max(1440).default(10),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const SETTING_KEYS = Object.keys(settingsSchema.shape) as SettingKey[];

export function parseSettings(rows: { key: string; value: unknown }[]): Settings {
  const raw: Record<string, unknown> = {};
  for (const r of rows) if (r.key in settingsSchema.shape) raw[r.key] = r.value;
  // Einzelne ungültige Werte fallen auf den Standard zurück
  const result: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const field = settingsSchema.shape[key];
    const parsed = field.safeParse(raw[key]);
    result[key] = parsed.success ? parsed.data : field.parse(undefined);
  }
  return result as Settings;
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  return parseSettings(rows);
}

export async function saveSettings(patch: Partial<Settings>, actorId: string) {
  const entries = Object.entries(patch).filter(([k]) => k in settingsSchema.shape);
  await db.$transaction(
    entries.map(([key, value]) =>
      db.setting.upsert({
        where: { key },
        create: { key, value: value as never, updatedById: actorId },
        update: { value: value as never, updatedById: actorId },
      }),
    ),
  );
}
