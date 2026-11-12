import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_NIGHT_HELD, DELIVERY_KIND_KEYS } from "@/lib/night";

export const DEFAULT_SYSTEM_PROMPT = `Du unterstützt das Team von Nordverkehr, einem Hamburg-Roleplay-Server (Start auf GTA 5, danach GTA 6), bei der Bearbeitung von Team-Bewerbungen.

Ton: ehrlich, direkt, norddeutsch, freundlich, immer in der Du-Form. Kein Marketing-Sprech, keine Floskeln, keine Emojis-Flut. Kurz und klar – "Klein, direkt und mit klarem Plan."

Grenzen:
- Du triffst keine Entscheidungen über Annahme oder Ablehnung und erstellst keine Rankings zwischen Bewerbern. Punkte vergibst du nur, wenn ausdrücklich danach gefragt wird (Bewertungsbogen) – als begründete Einschätzung, nicht als Urteil.
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

// Discord-Kanal-ID oder leer (= aus)
const channel = (def: string) =>
  z
    .string()
    .trim()
    .regex(/^(\d{15,25})?$/, "Kanal-ID besteht nur aus Ziffern.")
    .default(def);

/** Alle einstellbaren Werte mit Typ, Grenzen und Standard. */
export const settingsSchema = z.object({
  "applications.minAge": z.coerce.number().int().min(12).max(99).default(18),
  "applications.cooldownDays": z.coerce.number().int().min(0).max(365).default(30),
  "applications.processingTime": z.string().min(2).max(80).default("in der Regel 3–7 Tage"),
  "applications.minFillSeconds": z.coerce.number().int().min(0).max(3600).default(90),
  "applications.minDiscordAccountDays": z.coerce.number().int().min(0).max(3650).default(30),
  /** Bewerber dürfen Antworten nachreichen, solange noch niemand die Bewerbung angesehen hat */
  "applications.amendEnabled": bool(true),
  /** Bewerber sehen ihre Position in der Warteschlange und die aktuelle Bearbeitungszeit */
  "applications.queueInfo": bool(true),
  /** Rückfrage mit Frist: Erinnerung an den Bewerber nach X Tagen ohne Antwort (0 = aus) */
  "followup.reminderDays": z.coerce.number().int().min(0).max(30).default(3),
  /** … und Vorschlag „schließen“ ans Team nach X Tagen */
  "followup.closeDays": z.coerce.number().int().min(1).max(60).default(7),
  /** Einmalige DM an Bewerber, deren Entwurf seit X Tagen liegt (0 = aus) */
  "applications.draftReminderDays": z.coerce.number().int().min(0).max(60).default(3),

  /** Neue Bewerbungen im Bewerbungs-Kanal posten */
  "discord.logChannelEnabled": bool(true),
  "discord.applicationsChannelId": channel("1570180703663165520"),
  /** Protokoll (Status, Claims, Nachrichten, Zustellfehler) im Bot-Log-Kanal */
  "discord.botLogEnabled": bool(true),
  "discord.botLogChannelId": channel("1569736621019111515"),
  /** Stellenaufruf („Wir suchen neue Teammitglieder!“) – Kanal + automatisch aktualisieren */
  "discord.jobsChannelId": channel("1569736461933084792"),
  "discord.jobsAutoUpdate": bool(true),
  /** Einzelaufrufe „Wir suchen <Stelle>!“ */
  "discord.spotlightChannelId": channel("1569736463564808263"),
  /** Neue Changelog-Einträge des Portals posten */
  "discord.changelogEnabled": bool(true),
  "discord.changelogChannelId": channel("1570181667627475146"),
  "discord.autoRoleOnAccept": bool(false),
  /** Zu jeder neuen Bewerbung einen Thread im Bewerbungs-Kanal starten (Bot braucht „Öffentliche Threads erstellen“) */
  "discord.threadPerApplication": bool(false),
  /** Interne Kommentare aus dem Portal in den Thread spiegeln */
  "discord.threadMirrorComments": bool(true),
  /** Knopf „Übernehmen“ an neuen Bewerbungen im Discord (braucht die Interaktions-URL bei Discord) */
  "discord.claimButton": bool(false),
  /** Tägliche Team-Übersicht (morgens) im Teamchat */
  "discord.dailySummaryEnabled": bool(true),
  "discord.summaryChannelId": channel("1569736476797837312"),
  /** Neue Bewerbungen automatisch dem Teammitglied mit den wenigsten offenen Bewerbungen zuteilen */
  "team.autoAssign": bool(false),
  /** Gespräche als Discord-Server-Event anlegen (Bot braucht „Events verwalten“) */
  "interview.discordEvent": bool(false),
  /** DM an den Betreuer so viele Minuten vor dem Gespräch (0 = aus) */
  "interview.teamReminderMinutes": z.coerce.number().int().min(0).max(240).default(15),
  /** Störungs-Alarm in den Leitungs-Chat (fehlgeschlagene Zustellungen, ausgefallene Läufe) */
  "alerts.enabled": bool(true),
  "alerts.failedThreshold": z.coerce.number().int().min(1).max(100).default(3),
  /** Wochenbericht montags an die Leitung */
  "report.weeklyEnabled": bool(true),
  /** Persönliche Morgen-DM an Betreuer mit ihren offenen Punkten (pro Person abschaltbar) */
  "team.personalDigestEnabled": bool(true),
  /** Leitungs-Chat: Hinweis, wenn Bewerbungen zu lange liegen (leer = aus) */
  "discord.leadChannelId": channel("1569736564433494167"),
  /** Ab wie vielen Tagen ohne Team-Aktivität eine Bewerbung als „liegengeblieben“ gilt */
  "team.staleDays": z.coerce.number().int().min(1).max(30).default(3),
  /** Ab wie vielen Tagen die Leitung Bescheid bekommt */
  "team.escalateDays": z.coerce.number().int().min(2).max(60).default(7),

  /** Einarbeitung nach der Annahme: ein Punkt pro Zeile */
  "onboarding.items": z
    .string()
    .max(2000)
    .default(["Regelwerk & Team-Regeln gelesen", "Discord-Rolle vergeben", "TeamSpeak-Rechte gesetzt", "In Team-Kanäle eingeladen", "Einweisung gemacht", "Ansprechpartner zugeteilt"].join("\n")),
  /** Nachtruhe (deutsche Zeit): Team schläft – KI antwortet, DMs/Team-Posts warten bis zum Ende */
  "night.enabled": bool(true),
  "night.start": z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Uhrzeit als HH:MM").default("22:00"),
  "night.end": z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Uhrzeit als HH:MM").default("10:00"),
  /** Nachts antwortet die KI auf Bewerber-Nachrichten (auch wenn die Auto-Antwort sonst aus ist) */
  "night.aiReply": bool(true),
  /** Zustellarten, die nachts bis zum Ende der Nachtruhe warten (lib/night.ts) – Wichtiges geht immer sofort */
  "night.held": z.array(z.enum(DELIVERY_KIND_KEYS)).max(20).default(DEFAULT_NIGHT_HELD),
  /** Hinweis für Bewerber im Portal */
  "night.portalNotice": bool(true),
  /** Standard-Vorlage fürs Gesprächsprotokoll (eine Frage pro Zeile) – pro Stelle überschreibbar */
  "interview.defaultQuestions": z
    .string()
    .max(3000)
    .default(
      [
        "Stell dich kurz vor – wer bist du, wie bist du zu Nordverkehr gekommen?",
        "Warum genau diese Stelle?",
        "Wie viel Zeit kannst du realistisch pro Woche einbringen?",
        "Erzähl von einer schwierigen Situation mit einem Spieler und wie du sie gelöst hast.",
        "Wie gehst du mit Kritik vom Team um?",
        "Hast du Fragen an uns?",
      ].join("\n"),
    ),
  /** Probezeit in Tagen ab Annahme (0 = keine) */
  "onboarding.probationDays": z.coerce.number().int().min(0).max(365).default(14),

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
  /** KI-Punkte im Bewertungsbogen automatisch nach dem Absenden */
  "ai.autoScoreEnabled": bool(true),

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

// Kurzer Zwischenspeicher: pro Nachricht werden die Einstellungen sonst mehrfach geladen
const CACHE_MS = 10_000;
let cached: { at: number; value: Promise<Settings> } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = db.setting.findMany({ where: { key: { in: SETTING_KEYS } } }).then(parseSettings);
  cached = { at: Date.now(), value };
  value.catch(() => {
    cached = null;
  });
  return value;
}

/** Nach dem Speichern sofort frische Werte */
export function clearSettingsCache() {
  cached = null;
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
  clearSettingsCache();
}
