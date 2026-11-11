/**
 * Stellenaufrufe für Discord – Components V2, im Stil eines klassischen Embeds
 * (ein durchgehender Textblock, Linie, Fußzeile):
 *  - Gesamtaufruf „Wir suchen neue Teammitglieder!“ mit allen offenen Stellen
 *  - Einzelaufruf „Wir suchen <Stelle>!“ für eine Position
 * Beide werden aus den Positionen erzeugt (Texte wie auf der Website) und vom
 * Bot bei Änderungen an den Positionen automatisch aktualisiert.
 */
import type { APIActionRowComponent, APIButtonComponentWithURL, APIComponentInContainer, RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { BRAND_COLOR, separator, text, truncate, v2Message } from "@/lib/messages/embed";

export interface JobPosition {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  status: "OPEN" | "CLOSED" | "HIDDEN";
  tasks: string[];
  requirements: string[];
  minAge: number | null;
  /** Discord-Rolle der Position – wird als Erwähnung angezeigt (ohne Ping) */
  acceptRoleId: string | null;
}

interface Opts {
  appUrl: string;
  defaultMinAge: number;
  updatedAt?: Date;
}

const ICON_EMOJI: Record<string, string> = {
  headset: "🎧",
  shield: "🛡️",
  code: "💻",
  camera: "📸",
  cube: "🧱",
  confetti: "🎉",
  users: "👥",
};
export const jobEmoji = (icon: string) => ICON_EMOJI[icon] ?? "📌";

const NL = "\n";
const roleOrTitle = (p: JobPosition) => (p.acceptRoleId ? `<@&${p.acceptRoleId}>` : `**${p.title}**`);
const isHttps = (url: string) => /^https:\/\//.test(url);

/** Anforderungen, die bei allen offenen Stellen gleich sind (z. B. Mindestalter). */
function commonRequirements(open: JobPosition[], defaultMinAge: number) {
  if (!open.length) return [];
  const [first, ...rest] = open;
  const common = first.requirements.filter((r) => rest.every((p) => p.requirements.includes(r)));
  const ageLine = `Mindestens ${defaultMinAge} Jahre alt`;
  return common.some((r) => /mindestalter|jahre/i.test(r)) ? common : [ageLine, ...common];
}

function footer(opts: Opts): APIComponentInContainer[] {
  const stand = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(opts.updatedAt ?? new Date());
  // Wie beim Embed: Linie, dann kleine Zeile
  return [separator(true, 1), text(`-# Nordverkehr Roleplay · Stand: ${stand}`)];
}

function buttonRows(buttons: APIButtonComponentWithURL[]): APIActionRowComponent<APIButtonComponentWithURL>[] {
  const rows: APIActionRowComponent<APIButtonComponentWithURL>[] = [];
  for (let i = 0; i < buttons.length && i < 25; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  return rows;
}

/** Gesamtaufruf: alle offenen Stellen, Voraussetzungen, Statusübersicht – ein Block. */
export function buildJobsMessage(positions: JobPosition[], opts: Opts): RESTPostAPIChannelMessageJSONBody {
  const visible = positions.filter((p) => p.status !== "HIDDEN");
  const open = visible.filter((p) => p.status === "OPEN");

  const parts: string[] = [
    "## Wir suchen neue Teammitglieder!",
    `🔍 ${open.length ? "Aktuell suchen wir Unterstützung in folgenden Bereichen:" : "Gerade sind alle Stellen besetzt – schau bald wieder vorbei."}`,
  ];

  // Je offene Stelle: Titel, Beschreibung, Aufgaben (Platz gleichmäßig verteilt)
  const budget = Math.floor(2300 / Math.max(open.length, 1));
  for (const p of open) {
    const tasks = p.tasks.length ? `${NL}Aufgaben: ${p.tasks.join(", ")}.` : "";
    parts.push("", truncate(`${jobEmoji(p.icon)} ${roleOrTitle(p)}:${NL}${p.description}${tasks}`, budget));
  }

  const reqs = commonRequirements(open, opts.defaultMinAge);
  if (reqs.length) {
    parts.push("", "✅ **Das solltest du mitbringen:**", ...reqs.map((r) => `🔹 ${r}`), "-# Weitere Voraussetzungen stehen bei der jeweiligen Stelle im Bewerbungsportal.");
  }

  parts.push(
    "",
    "📊 **Statusübersicht – Offene Stellen:**",
    ...visible.map((p) => `${jobEmoji(p.icon)} ${p.title}: ${p.status === "OPEN" ? "🟢 Offen" : "🔴 Geschlossen"}`),
    "",
    "Wenn du dich angesprochen fühlst, bewirb dich direkt im **Bewerbungsportal** – Login mit Discord, dauert ca. 15–25 Minuten. Wir freuen uns auf dich! 🎉",
    "",
    "Euer Nordverkehr-Team",
  );

  const children: APIComponentInContainer[] = [text(truncate(parts.join(NL), 3800))];
  if (isHttps(opts.appUrl)) {
    children.push(
      ...buttonRows([
        { type: 2, style: 5, label: "Zum Bewerbungsportal", url: opts.appUrl },
        ...open.map((p) => ({ type: 2 as const, style: 5 as const, label: truncate(`${p.title} bewerben`, 80), url: `${opts.appUrl}/positionen/${p.slug}`, emoji: { name: jobEmoji(p.icon) } })),
      ]),
    );
  }
  children.push(...footer(opts));
  return v2Message(BRAND_COLOR, children);
}

/** Einzelaufruf „Wir suchen <Stelle>!“ – wie das Beispiel, ein durchgehender Block. */
export function buildSpotlightMessage(p: JobPosition, opts: Opts): RESTPostAPIChannelMessageJSONBody {
  const open = p.status === "OPEN";
  const parts: string[] = [
    `## Wir suchen ${roleOrTitle(p)}! ${jobEmoji(p.icon)}`,
    `${p.tagline} ${p.description}`,
  ];
  if (p.tasks.length) parts.push("", "📋 **Deine Aufgaben:**", ...p.tasks.map((t) => `> ${t}`));
  const reqs = p.requirements.length ? p.requirements : [`Mindestens ${p.minAge ?? opts.defaultMinAge} Jahre alt`];
  parts.push("", "🔧 **Das solltest du mitbringen:**", ...reqs.map((r) => `> ${r}`));
  parts.push(
    "",
    "📩 **Interesse?**",
    open
      ? "Bewirb dich direkt im **Bewerbungsportal** – Login mit Discord, dauert ca. 15–25 Minuten."
      : "Die Stelle ist gerade geschlossen. Schau bald wieder vorbei – wir melden uns hier, sobald sie wieder offen ist.",
    "",
    "Mit freundlichen Grüßen",
    "Euer Nordverkehr-Team",
  );

  const children: APIComponentInContainer[] = [text(truncate(parts.join(NL), 3800))];
  if (open && isHttps(opts.appUrl)) {
    children.push(
      ...buttonRows([{ type: 2, style: 5, label: `Jetzt als ${truncate(p.title, 60)} bewerben`, url: `${opts.appUrl}/positionen/${p.slug}`, emoji: { name: jobEmoji(p.icon) } }]),
    );
  }
  children.push(...footer(opts));
  return v2Message(BRAND_COLOR, children);
}
