/**
 * Alle Discord-Nachrichten des Portals im Nordverkehr-Design – als
 * Components V2 (Flag IS_COMPONENTS_V2): ein Container mit Akzentfarbe,
 * Textanzeigen, Trennern, Thumbnail und Link-Buttons. Kein `content`,
 * keine `embeds` (bei V2 nicht erlaubt).
 */
import type {
  APIActionRowComponent,
  APIButtonComponent,
  APIButtonComponentWithURL,
  APIComponentInContainer,
  APISectionComponent,
  APISeparatorComponent,
  APITextDisplayComponent,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { groupItems, type ChangeKind } from "@/lib/changelog";

export const BRAND_COLOR = 0xc41e1e;
export const WARN_COLOR = 0xf3c25b;
export const NEUTRAL_COLOR = 0x4e5058;
/** Logo für Discord-Nachrichten – liegt im Portal unter /logo.png */
export const LOGO_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bewerbung.nordverkehr.xyz"}/logo.png`;
/** MessageFlags.IsComponentsV2 */
export const COMPONENTS_V2 = 1 << 15;
/** Discord erlaubt bei V2 insgesamt 4000 Zeichen Text pro Nachricht */
export const V2_TEXT_LIMIT = 4000;
/** Maximal für den Nachrichtentext reserviert (Rest: Kopf, Fußzeile) */
export const BODY_LIMIT = 3400;

// ─── Bausteine ────────────────────────────────────────────────

export const text = (content: string): APITextDisplayComponent => ({ type: 10, content });

export const separator = (divider = true, spacing: 1 | 2 = 1): APISeparatorComponent => ({ type: 14, divider, spacing });

/** Text links, Bild rechts (Avatar/Logo). */
export function section(lines: string[], thumbnailUrl: string): APISectionComponent {
  return {
    type: 9,
    components: lines.slice(0, 3).map(text),
    accessory: { type: 11, media: { url: thumbnailUrl } },
  };
}

/** Link-Buttons – Discord akzeptiert dort nur https-Links. */
export function linkButtons(links: { label: string; url: string | null | undefined }[]): APIActionRowComponent<APIButtonComponentWithURL> | null {
  const buttons = links
    .filter((l): l is { label: string; url: string } => !!l.url && /^https:\/\//.test(l.url))
    .slice(0, 5)
    .map((l) => ({ type: 2 as const, style: 5 as const, label: l.label.slice(0, 80), url: l.url }));
  return buttons.length ? { type: 1, components: buttons } : null;
}

export const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

/** Discord-Zeitstempel, im Client lokal formatiert. */
export const discordTime = (d: Date, style: "f" | "R" | "D" | "t" = "f") => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;

/** Eine V2-Nachricht aus einem Container. Erwähnungen werden angezeigt, pingen aber nie. */
export function v2Message(accent: number, children: (APIComponentInContainer | null | false)[]): RESTPostAPIChannelMessageJSONBody {
  return {
    flags: COMPONENTS_V2,
    components: [{ type: 17, accent_color: accent, components: children.filter(Boolean) as APIComponentInContainer[] }],
    allowed_mentions: { parse: [] },
  };
}

/** Alle Textanzeigen einer Nachricht zusammen (für das 4000-Zeichen-Limit und Tests). */
export function v2Text(msg: RESTPostAPIChannelMessageJSONBody): string {
  const out: string[] = [];
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    const o = c as { type?: number; content?: string; components?: unknown[] };
    if (o.type === 10 && o.content) out.push(o.content);
    o.components?.forEach(walk);
  };
  (msg.components ?? []).forEach(walk);
  return out.join("\n");
}

// ─── Nachrichten an Bewerber ──────────────────────────────────

export interface ApplicantEmbedInput {
  title: string;
  body: string;
  publicId?: string | null;
  statusUrl?: string | null;
  timestamp?: Date;
  /** Persönlicher Absender (Teammitglied); ohne Angabe "NORDVERKEHR // TEAM" */
  author?: { name: string; iconUrl?: string | null } | null;
  /** Beschriftung des Link-Knopfs (Standard: „Status ansehen“) */
  buttonLabel?: string;
  /** Zusätzlicher Interaktions-Knopf (z. B. „Ich kann nicht“ in der Gesprächserinnerung) */
  action?: { label: string; customId: string; emoji?: string } | null;
}

/** Kopfzeile: Team oder persönlich ("Jonas · Nordverkehr-Team"). */
export function embedAuthor(author?: ApplicantEmbedInput["author"]) {
  return author
    ? { name: `${author.name} · Nordverkehr-Team`.slice(0, 256), icon_url: author.iconUrl ?? LOGO_URL }
    : { name: "NORDVERKEHR // TEAM", icon_url: LOGO_URL };
}

/** DM an Bewerber (Bestätigung, Team-Nachricht, Status, Auto-Antwort). */
export function buildApplicantMessage(input: ApplicantEmbedInput): RESTPostAPIChannelMessageJSONBody {
  const head = embedAuthor(input.author);
  const at = input.timestamp ?? new Date();
  const headLines = [`-# ${head.name}`, `## ${truncate(input.title, 200)}`];
  return v2Message(BRAND_COLOR, [
    // Profilbild: Teammitglied persönlich → sein Avatar, als Team → Nordverkehr-Logo
    section(headLines, input.author?.iconUrl || LOGO_URL),
    separator(),
    text(truncate(input.body || " ", BODY_LIMIT)),
    separator(false),
    text(`-# ${input.publicId ? `Bewerbung ${input.publicId}` : "Nordverkehr Roleplay"} · ${discordTime(at)}`),
    input.action ? actionRow(input.action, { label: input.buttonLabel ?? "Status ansehen", url: input.statusUrl }) : linkButtons([{ label: input.buttonLabel ?? "Status ansehen", url: input.statusUrl }]),
  ]);
}

/** Interaktions-Knopf + Link-Knopf in einer Zeile. */
function actionRow(action: { label: string; customId: string; emoji?: string }, link: { label: string; url: string | null | undefined }): APIActionRowComponent<APIButtonComponent> {
  const components: APIButtonComponent[] = [{ type: 2, style: 2, label: action.label.slice(0, 80), custom_id: action.customId, ...(action.emoji ? { emoji: { name: action.emoji } } : {}) }];
  if (link.url && /^https:\/\//.test(link.url)) components.push({ type: 2, style: 5, label: link.label.slice(0, 80), url: link.url });
  return { type: 1, components };
}

/** Willkommensgruß im Teamchat: Text mit Avatar, pingt nur die neue Person. */
export function buildWelcomeMessage(body: string, discordId: string, avatar: string | null): RESTPostAPIChannelMessageJSONBody {
  const msg = v2Message(BRAND_COLOR, [section([`-# NORDVERKEHR // TEAM`, truncate(body, 1500)], avatar || LOGO_URL)]);
  return { ...msg, allowed_mentions: { parse: [], users: [discordId] } };
}

// ─── Bewerbungs-Kanal ─────────────────────────────────────────

export interface LogEmbedInput {
  positionTitle: string;
  applicantDiscordId: string;
  applicantName: string;
  applicantAvatarUrl?: string | null;
  publicId: string;
  age: number | null;
  teamUrl: string;
  flags: string[];
  /** Knopf „Übernehmen“ direkt in Discord (custom_id), sonst nur der Link */
  claimCustomId?: string | null;
}

/** Post für neue Bewerbungen im Bewerbungs-Kanal. */
export function buildLogMessage(input: LogEmbedInput): RESTPostAPIChannelMessageJSONBody {
  const facts = [
    `**Position:** ${input.positionTitle}`,
    `**Bewerber:** <@${input.applicantDiscordId}> (${input.applicantName})`,
    `**Alter:** ${input.age ?? "–"}`,
  ].join("\n");
  return v2Message(BRAND_COLOR, [
    section([`-# NORDVERKEHR // BEWERBUNGEN`, `## Neue Bewerbung · ${input.publicId}`, facts], input.applicantAvatarUrl || LOGO_URL),
    input.flags.length > 0 && separator(),
    input.flags.length > 0 && text(truncate(`**Hinweise** (keine Bewertung)\n${input.flags.map((f) => `• ${f}`).join("\n")}`, 1000)),
    separator(false),
    text(`-# Eingegangen ${discordTime(new Date(), "R")}`),
    input.claimCustomId ? claimRow(input.teamUrl, input.claimCustomId) : linkButtons([{ label: "Im Team-Bereich öffnen", url: input.teamUrl }]),
  ]);
}

/** „Übernehmen“, „In Prüfung“, „Zum Gespräch“ (Interaktionen, siehe lib/discord/interactions.ts) + Link. */
function claimRow(url: string, customId: string): APIActionRowComponent<APIButtonComponent> {
  const id = customId.slice(customId.lastIndexOf(":") + 1);
  return buttonRow(
    [
      { label: "Übernehmen", customId, emoji: "📌", style: 1 },
      { label: "In Prüfung", customId: `nv:status:IN_REVIEW:${id}`, emoji: "🔎" },
      { label: "Zum Gespräch", customId: `nv:status:INTERVIEW:${id}`, emoji: "🎙️" },
    ],
    { label: "Öffnen", url },
  );
}

// ─── Bot-Log & Changelog ──────────────────────────────────────

/** Eine Protokollzeile im Bot-Log-Kanal. */
export interface ActionButton {
  label: string;
  customId: string;
  emoji?: string;
  /** 1 = blau (primär), 2 = grau */
  style?: 1 | 2;
}

export function buildBotLogMessage(
  line: string,
  opts: { tone?: "default" | "warn"; url?: string | null; actions?: ActionButton[]; linkLabel?: string } = {},
): RESTPostAPIChannelMessageJSONBody {
  const label = opts.linkLabel ?? "Öffnen";
  return v2Message(opts.tone === "warn" ? WARN_COLOR : NEUTRAL_COLOR, [
    text(truncate(line, 1800)),
    text(`-# ${discordTime(new Date())}`),
    opts.actions?.length ? buttonRow(opts.actions, { label, url: opts.url }) : linkButtons([{ label, url: opts.url }]),
  ]);
}

/** Interaktions-Knöpfe (max. 4) + Link-Knopf in einer Zeile. */
export function buttonRow(actions: ActionButton[], link?: { label: string; url: string | null | undefined }): APIActionRowComponent<APIButtonComponent> {
  const components: APIButtonComponent[] = actions.slice(0, 4).map((a) => ({
    type: 2,
    style: a.style ?? 2,
    label: a.label.slice(0, 80),
    custom_id: a.customId,
    ...(a.emoji ? { emoji: { name: a.emoji } } : {}),
  }));
  if (link?.url && /^https:\/\//.test(link.url)) components.push({ type: 2, style: 5, label: link.label.slice(0, 80), url: link.url });
  return { type: 1, components };
}

export const formatDateDe = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Changelog-Eintrag: kleiner Kopf, Titel, Datum – dann je Art (Neu, Verbessert,
 * Behoben) eine Überschrift mit echter Markdown-Liste. Kein Logo-Bild.
 */
export function buildChangelogMessage(
  entry: { version: string; title?: string; date: string; items: { kind: ChangeKind; text: string }[] },
  url?: string | null,
): RESTPostAPIChannelMessageJSONBody {
  const groups = groupItems(entry.items);
  const budget = Math.floor(BODY_LIMIT / Math.max(groups.length, 1));
  const children: (APIComponentInContainer | null | false)[] = [
    text(
      `-# 📋 CHANGELOG · NORDVERKEHR BEWERBUNGSPORTAL\n## Version ${entry.version}${entry.title ? `\n**${truncate(entry.title, 150)}**` : ""}\n-# ${formatDateDe(entry.date)}`,
    ),
  ];
  for (const g of groups) {
    children.push(separator(true, 1));
    children.push(text(truncate(`### ${g.emoji} ${g.label}\n${g.items.map((i) => `- ${i.text}`).join("\n")}`, budget)));
  }
  children.push(separator(false, 1));
  children.push(linkButtons([{ label: "Alle Änderungen ansehen", url }]));
  return v2Message(BRAND_COLOR, children);
}
