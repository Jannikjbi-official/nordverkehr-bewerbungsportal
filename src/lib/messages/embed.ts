import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";

export const BRAND_COLOR = 0xc41e1e;
export const LOGO_URL = "https://nordverkehr.xyz/logo.png";
export const EMBED_DESCRIPTION_LIMIT = 4096;

export interface ApplicantEmbedInput {
  title: string;
  body: string;
  publicId?: string | null;
  statusUrl?: string | null;
  timestamp?: Date;
}

/** Discord-Nachricht an Bewerber im Nordverkehr-Design. */
export function buildApplicantMessage(input: ApplicantEmbedInput): RESTPostAPIChannelMessageJSONBody {
  const description =
    input.body.length > EMBED_DESCRIPTION_LIMIT ? input.body.slice(0, EMBED_DESCRIPTION_LIMIT - 1) + "…" : input.body;
  const statusUrl = input.statusUrl && /^https:\/\//.test(input.statusUrl) ? input.statusUrl : null;
  return {
    embeds: [
      {
        author: { name: "NORDVERKEHR // TEAM", icon_url: LOGO_URL },
        title: input.title.slice(0, 256),
        description,
        color: BRAND_COLOR,
        footer: { text: input.publicId ? `Bewerbung ${input.publicId}` : "Nordverkehr Roleplay" },
        timestamp: (input.timestamp ?? new Date()).toISOString(),
      },
    ],
    // Discord akzeptiert nur https-Links in Buttons
    components: statusUrl
      ? [{ type: 1, components: [{ type: 2, style: 5, label: "Status ansehen", url: statusUrl }] }]
      : undefined,
    allowed_mentions: { parse: [] },
  };
}

export interface LogEmbedInput {
  positionTitle: string;
  applicantDiscordId: string;
  applicantName: string;
  publicId: string;
  age: number | null;
  teamUrl: string;
  flags: string[];
}

/** Log-Post für neue Bewerbungen im Team-Channel. */
export function buildLogMessage(input: LogEmbedInput): RESTPostAPIChannelMessageJSONBody {
  const fields = [
    { name: "Position", value: input.positionTitle, inline: true },
    { name: "Bewerber", value: `<@${input.applicantDiscordId}>\n${input.applicantName}`, inline: true },
    { name: "Alter", value: input.age ? String(input.age) : "–", inline: true },
  ];
  if (input.flags.length) fields.push({ name: "Hinweise", value: input.flags.map((f) => `• ${f}`).join("\n").slice(0, 1024), inline: false });
  const teamUrl = /^https:\/\//.test(input.teamUrl) ? input.teamUrl : null;
  return {
    embeds: [
      {
        author: { name: "NORDVERKEHR // BEWERBUNGEN", icon_url: LOGO_URL },
        title: `Neue Bewerbung · ${input.publicId}`,
        url: teamUrl ?? undefined,
        color: BRAND_COLOR,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
    components: teamUrl
      ? [{ type: 1, components: [{ type: 2, style: 5, label: "Im Team-Bereich öffnen", url: teamUrl }] }]
      : undefined,
    // Kein Ping im Log-Channel
    allowed_mentions: { parse: [] },
  };
}
