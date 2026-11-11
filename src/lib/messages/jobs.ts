/**
 * Stellenaufruf („Wir suchen neue Teammitglieder!“) für Discord – Components V2.
 * Wird komplett aus den Positionen erzeugt (Texte wie auf der Website) und vom
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

/** Anforderungen, die bei allen offenen Stellen gleich sind (z. B. Mindestalter). */
function commonRequirements(open: JobPosition[], defaultMinAge: number) {
  if (!open.length) return [];
  const [first, ...rest] = open;
  const common = first.requirements.filter((r) => rest.every((p) => p.requirements.includes(r)));
  const ageLine = `Mindestens ${defaultMinAge} Jahre alt`;
  return common.some((r) => /mindestalter|jahre/i.test(r)) ? common : [ageLine, ...common];
}

export function buildJobsMessage(
  positions: JobPosition[],
  opts: { appUrl: string; defaultMinAge: number; updatedAt?: Date },
): RESTPostAPIChannelMessageJSONBody {
  const visible = positions.filter((p) => p.status !== "HIDDEN");
  const open = visible.filter((p) => p.status === "OPEN");
  const name = (p: JobPosition) => (p.acceptRoleId ? `<@&${p.acceptRoleId}>` : `**${p.title}**`);

  const children: (APIComponentInContainer | null | false)[] = [
    text(`## Wir suchen neue Teammitglieder!\n🔍 ${open.length ? "Aktuell suchen wir Unterstützung in folgenden Bereichen:" : "Gerade sind alle Stellen besetzt – schau bald wieder vorbei."}`),
  ];

  // Je offene Stelle: Titel, Beschreibung, Aufgaben (Platz gleichmäßig verteilt)
  const budget = Math.floor(2200 / Math.max(open.length, 1));
  for (const [i, p] of open.entries()) {
    if (i > 0) children.push(separator(false, 1)); // etwas Luft zwischen den Stellen
    children.push(
      text(
        truncate(
          `${jobEmoji(p.icon)} ${name(p)} – ${p.tagline}\n${p.description}${p.tasks.length ? `\n-# Aufgaben: ${p.tasks.join(" · ")}` : ""}`,
          budget,
        ),
      ),
    );
  }

  const reqs = commonRequirements(open, opts.defaultMinAge);
  if (reqs.length) {
    children.push(separator());
    children.push(text(`### ✅ Das solltest du mitbringen\n${reqs.map((r) => `- ${r}`).join("\n")}\n-# Weitere Voraussetzungen stehen bei der jeweiligen Stelle im Bewerbungsportal.`));
  }

  children.push(separator());
  children.push(
    text(
      `### 📊 Statusübersicht\n${visible.map((p) => `${jobEmoji(p.icon)} ${p.title}: ${p.status === "OPEN" ? "🟢 Offen" : "🔴 Geschlossen"}`).join("\n")}`,
    ),
  );

  children.push(separator());
  children.push(
    text(
      `Wenn du dich angesprochen fühlst, bewirb dich direkt im **Bewerbungsportal** – Login mit Discord, dauert ca. 15–25 Minuten. Wir freuen uns auf dich! 🎉`,
    ),
  );

  // Knöpfe: Portal + je offene Stelle (max. 5 pro Reihe, nur https)
  if (/^https:\/\//.test(opts.appUrl)) {
    const buttons: APIButtonComponentWithURL[] = [
      { type: 2, style: 5, label: "Zum Bewerbungsportal", url: opts.appUrl },
      ...open.map((p) => ({ type: 2 as const, style: 5 as const, label: truncate(`${p.title} bewerben`, 80), url: `${opts.appUrl}/positionen/${p.slug}`, emoji: { name: jobEmoji(p.icon) } })),
    ];
    for (let i = 0; i < buttons.length && i < 25; i += 5) {
      const row: APIActionRowComponent<APIButtonComponentWithURL> = { type: 1, components: buttons.slice(i, i + 5) };
      children.push(row);
    }
  }

  const stand = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(opts.updatedAt ?? new Date());
  children.push(text(`-# Nordverkehr Roleplay · Stand: ${stand}`));

  return v2Message(BRAND_COLOR, children);
}
