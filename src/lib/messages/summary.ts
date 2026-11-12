/**
 * Tägliche Team-Übersicht (Teamchat) und Hinweis an die Leitung – Components V2.
 * Reine Bausteine ohne Datenbank: die Daten sammelt lib/team/daily-summary.ts.
 */
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { BRAND_COLOR, NEUTRAL_COLOR, WARN_COLOR, discordTime, linkButtons, separator, text, truncate, v2Message } from "@/lib/messages/embed";

export interface SummaryItem {
  id: string;
  publicId: string;
  name: string;
  position: string;
  /** Wer die Bewerbung betreut (null = niemand) */
  claimer: string | null;
  /** Zeitpunkt je nach Liste: Gespräch, letzte Nachricht, letzte Aktivität, Rückzug */
  at: Date;
}

export interface DailySummary {
  /** YYYY-MM-DD (deutsche Zeit) */
  date: string;
  open: number;
  newSince: number;
  unclaimed: number;
  dmProblems: number;
  interviews: SummaryItem[];
  /** Bewerber hat zuletzt geschrieben, noch keine Antwort vom Team */
  waiting: SummaryItem[];
  /** Seit `staleDays` keine Aktivität vom Team */
  stale: SummaryItem[];
  /** Während der Bearbeitung zurückgezogen, Rückzug noch nicht bestätigt */
  withdrawals: SummaryItem[];
  /** Angenommen, Probezeit endet in den nächsten Tagen (at = Ende) */
  probation: SummaryItem[];
  /** Davon so lange liegengeblieben, dass die Leitung Bescheid bekommt */
  escalations: SummaryItem[];
  staleDays: number;
  escalateDays: number;
}

const MAX_ITEMS = 8;
/** Zeichen pro Liste (4 Listen + Kopf bleiben so unter Discords 4000) */
const SECTION_BUDGET = 700;
const NL = "\n";

/** Nichts, worum sich jemand kümmern müsste? Dann wird nichts gepostet. */
export function isQuiet(s: DailySummary) {
  return !s.newSince && !s.unclaimed && !s.interviews.length && !s.waiting.length && !s.stale.length && !s.withdrawals.length && !s.probation.length;
}

const clean = (v: string) => v.replace(/([\\*_~`|>#@[\]])/g, "\\$1");

function itemLine(it: SummaryItem, appUrl: string, detail: string) {
  const who = it.claimer ? `📌 ${clean(it.claimer)}` : "🙋 ohne Betreuer";
  return `- [**${it.publicId}**](${appUrl}/team/bewerbungen/${it.id}) ${clean(it.name)} (${clean(it.position)}) · ${detail} · ${who}`;
}

function list(title: string, items: SummaryItem[], appUrl: string, detail: (it: SummaryItem) => string) {
  if (!items.length) return null;
  // Ganze Zeilen bis zum Budget (nie mitten in einem Link abschneiden)
  const lines: string[] = [];
  let used = title.length + 5;
  for (const it of items.slice(0, MAX_ITEMS)) {
    const line = truncate(itemLine(it, appUrl, detail(it)), 400);
    if (used + line.length + 1 > SECTION_BUDGET) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (items.length > lines.length) lines.push(`-# … und ${items.length - lines.length} weitere im Team-Bereich`);
  return `### ${title}${NL}${lines.join(NL)}`;
}

export const formatLongDate = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(`${iso}T12:00:00Z`));

/** Kurze Statuszeile: „12 offen · 3 neu seit gestern · …“ */
export function summaryStats(s: DailySummary) {
  const parts = [`📥 **${s.open}** offen`, `🆕 **${s.newSince}** neu seit gestern`];
  if (s.unclaimed) parts.push(`🙋 **${s.unclaimed}** ohne Betreuer`);
  if (s.dmProblems) parts.push(`⚠️ **${s.dmProblems}** DM-Problem${s.dmProblems === 1 ? "" : "e"}`);
  return parts.join(" · ");
}

/** Morgendliche Übersicht für den Teamchat. */
export function buildDailySummaryMessage(s: DailySummary, appUrl: string): RESTPostAPIChannelMessageJSONBody {
  const sections = [
    list("📅 Gespräche heute", s.interviews, appUrl, (it) => `${discordTime(it.at, "t")} Uhr`),
    list("💬 Wartet auf Antwort", s.waiting, appUrl, (it) => `schrieb ${discordTime(it.at, "R")}`),
    list(`⏳ Seit ${s.staleDays}+ Tagen nichts passiert`, s.stale, appUrl, (it) => `zuletzt ${discordTime(it.at, "R")}`),
    list("↩️ Rückzug noch nicht bestätigt", s.withdrawals, appUrl, (it) => `zurückgezogen ${discordTime(it.at, "R")}`),
    list("🎓 Probezeit endet bald", s.probation, appUrl, (it) => `endet ${discordTime(it.at, "R")}`),
  ].filter((x): x is string => !!x);

  const quiet = isQuiet(s);
  const children = [
    text(`-# 📋 TEAM-ÜBERSICHT · ${formatLongDate(s.date).toUpperCase()}${NL}## Moin Team!${NL}${summaryStats(s)}`),
    separator(true, 1),
    ...(sections.length
      ? sections.flatMap((t, i) => (i ? [separator(false, 1), text(t)] : [text(t)]))
      : [text(quiet ? "✅ Alles erledigt – gerade liegt nichts rum. Danke euch!" : "Keine offenen Punkte in den Listen – schaut nur kurz bei den neuen Bewerbungen rein.")]),
    separator(true, 1),
    text("-# Kommt jeden Morgen. Wer eine Bewerbung übernimmt, claimt sie im Portal – dann sieht jeder, wer dran ist."),
    linkButtons([
      { label: "Team-Dashboard", url: /^https:\/\//.test(appUrl) ? `${appUrl}/team` : null },
      { label: "Board", url: /^https:\/\//.test(appUrl) ? `${appUrl}/team/bewerbungen?view=board` : null },
    ]),
  ];
  return v2Message(sections.length ? BRAND_COLOR : NEUTRAL_COLOR, children);
}

/** Hinweis an die Leitung: Bewerbungen, auf die seit `escalateDays` niemand reagiert hat. */
export function buildEscalationMessage(s: DailySummary, appUrl: string): RESTPostAPIChannelMessageJSONBody | null {
  if (!s.escalations.length) return null;
  const n = s.escalations.length;
  const body = list(
    `${n} Bewerbung${n === 1 ? "" : "en"} seit über ${s.escalateDays} Tagen ohne Reaktion`,
    s.escalations,
    appUrl,
    (it) => `zuletzt ${discordTime(it.at, "R")}`,
  )!;
  return v2Message(WARN_COLOR, [
    text(`-# 🚨 HINWEIS FÜR DIE LEITUNG · ${formatLongDate(s.date).toUpperCase()}`),
    text(body),
    text("-# Bitte jemanden zuteilen oder die Bewerbung abschließen – die Bewerber warten."),
    linkButtons([{ label: "Team-Dashboard", url: /^https:\/\//.test(appUrl) ? `${appUrl}/team` : null }]),
  ]);
}
