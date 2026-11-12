import { describe, expect, it } from "vitest";
import { clearStaleSchedule, dueTransitions } from "@/lib/positions/schedule";
import { berlinHour, isScheduledHour } from "@/lib/cron";

describe("Stelle: Datumsregeln nach manuellem Statuswechsel", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const past = new Date("2026-11-19T00:00:00Z");
  const future = new Date("2026-11-25T00:00:00Z");

  it("manuell geöffnet: Startdatum weg, abgelaufenes Enddatum weg, künftiges bleibt", () => {
    expect(clearStaleSchedule("OPEN", { opensAt: future, closesAt: past }, now)).toEqual({ opensAt: null, closesAt: null });
    expect(clearStaleSchedule("OPEN", { opensAt: null, closesAt: future }, now)).toEqual({});
  });

  it("manuell geschlossen: Enddatum weg, erreichtes Startdatum weg, künftiges bleibt", () => {
    expect(clearStaleSchedule("CLOSED", { opensAt: future, closesAt: future }, now)).toEqual({ closesAt: null });
    expect(clearStaleSchedule("CLOSED", { opensAt: past, closesAt: null }, now)).toEqual({ opensAt: null });
  });

  it("nach dem Aufräumen löst der Cron keine Umschaltung mehr aus", () => {
    const pos = { id: "a", status: "OPEN" as const, opensAt: future, closesAt: past };
    const fixed = { ...pos, ...clearStaleSchedule("OPEN", pos, now) };
    expect(dueTransitions([fixed], now)).toEqual([]);
  });

  it("versteckt: nichts ändern", () => {
    expect(clearStaleSchedule("HIDDEN", { opensAt: past, closesAt: past }, now)).toEqual({});
  });
});

describe("Crons zur deutschen Uhrzeit (Sommer-/Winterzeit)", () => {
  const cron = (ua = "vercel-cron/1.0") => new Request("https://x.test/api/cron/outbox", { headers: { "user-agent": ua } });

  it("rechnet die deutsche Stunde", () => {
    expect(berlinHour(new Date("2026-01-15T23:00:00Z"))).toBe(0); // Winter: UTC+1
    expect(berlinHour(new Date("2026-07-15T22:00:00Z"))).toBe(0); // Sommer: UTC+2
    expect(berlinHour(new Date("2026-07-15T23:00:00Z"))).toBe(1);
  });

  it("nur der passende Zwillings-Lauf arbeitet", () => {
    // Winter: 23 UTC ist 0 Uhr, 22 UTC ist 23 Uhr
    expect(isScheduledHour(cron(), 0, new Date("2026-01-15T23:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 0, new Date("2026-01-15T22:00:00Z"))).toBe(false);
    // Sommer: 22 UTC ist 0 Uhr, 23 UTC ist 1 Uhr
    expect(isScheduledHour(cron(), 0, new Date("2026-07-15T22:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 0, new Date("2026-07-15T23:00:00Z"))).toBe(false);
    // Team-Übersicht 8 Uhr
    expect(isScheduledHour(cron(), 8, new Date("2026-01-15T07:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 8, new Date("2026-07-15T06:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 8, new Date("2026-07-15T07:00:00Z"))).toBe(false);
  });

  it("Aufrufe ohne Vercel-Cron (externer Scheduler, von Hand) laufen immer", () => {
    expect(isScheduledHour(cron("curl/8.0"), 0, new Date("2026-07-15T12:00:00Z"))).toBe(true);
  });
});

import { buildPersonalDigestMessage, digestHeadline, groupByClaimer, type DailySummary, type SummaryItem } from "@/lib/messages/summary";
import { v2Text } from "@/lib/messages/embed";
import { draftReminderText } from "@/lib/applications/draft-reminder";

describe("Persönliche Morgen-DM an Betreuer", () => {
  const at = new Date("2026-11-20T08:00:00Z");
  const item = (id: string, claimerId: string | null): SummaryItem => ({ id, publicId: `NV-${id}`, name: "Anna", position: "Support", claimer: claimerId ? "Jonas" : null, claimerId, at });
  const summary = {
    date: "2026-11-20", open: 3, newSince: 0, unclaimed: 1, dmProblems: 0,
    interviews: [item("1", "u1")], waiting: [item("2", "u1"), item("3", "u2"), item("4", null)], stale: [], withdrawals: [], leftGuild: [], probation: [item("5", "u3")], escalations: [],
    staleDays: 3, escalateDays: 7,
  } satisfies DailySummary;

  it("gruppiert nach Betreuer, ohne Unbetreute und ohne Probezeit", () => {
    const g = groupByClaimer(summary);
    expect([...g.keys()].sort()).toEqual(["u1", "u2"]);
    expect(g.get("u1")!.waiting.map((x) => x.id)).toEqual(["2"]);
    expect(g.get("u1")!.interviews.map((x) => x.id)).toEqual(["1"]);
  });

  it("Kopfzeile im Klartext", () => {
    expect(digestHeadline(groupByClaimer(summary).get("u1")!)).toBe("1 Bewerber wartet auf deine Antwort, 1 Gespräch heute");
  });

  it("DM enthält Links zu den Bewerbungen", () => {
    const t = v2Text(buildPersonalDigestMessage("Jonas", groupByClaimer(summary).get("u1")!, 3, "https://x.test"));
    expect(t).toContain("Moin Jonas");
    expect(t).toContain("https://x.test/team/bewerbungen/2");
    expect(t).not.toContain("/team/bewerbungen/3");
  });
});

describe("Erinnerung an Entwürfe", () => {
  it("nennt Stelle und Löschfrist", () => {
    const t = draftReminderText("Anna", "Support", 27);
    expect(t).toContain("**Support**");
    expect(t).toContain("27 weiteren Tagen");
    expect(draftReminderText("Anna", "Support", null)).not.toContain("löschen");
  });
});

import { statusCommandReply } from "@/lib/discord/interactions";

describe("/bewerbung in Discord", () => {
  const base = { id: "app1234567890", publicId: "NV-2026-0001", position: "Support", submittedAt: new Date("2026-11-10T10:00:00Z"), interviewAt: null };
  it("ohne Bewerbung: Hinweis auf offene Stellen", () => {
    expect(statusCommandReply([], "https://x.test")).toContain("https://x.test");
  });
  it("zeigt Stelle, ID, Status, Termin und Link", () => {
    const t = statusCommandReply([{ ...base, status: "INTERVIEW", statusLabel: "Gespräch", interviewAt: new Date("2026-11-20T18:00:00Z") }], "https://x.test");
    expect(t).toContain("**Support** · `NV-2026-0001` – Gespräch");
    expect(t).toContain("<t:1795197600:f>");
    expect(t).toContain("https://x.test/dashboard/app1234567890");
  });
  it("Entwurf: Hinweis zum Weitermachen, mehrere als Liste", () => {
    const t = statusCommandReply(
      [
        { ...base, status: "DRAFT", statusLabel: "Entwurf", publicId: null, submittedAt: null },
        { ...base, id: "b", status: "SUBMITTED", statusLabel: "Eingereicht" },
      ],
      "https://x.test",
    );
    expect(t).toMatch(/^Deine Bewerbungen:/);
    expect(t).toContain("noch nicht abgeschickt");
  });
});

import { aggregateRejections } from "@/lib/applications/rejection";

describe("Statistik: Absagegründe", () => {
  it("zählt nur Absagen, nach Kategorie und Stelle", () => {
    const r = aggregateRejections([
      { status: "REJECTED", positionId: "p1", rejectionCategory: "ZEIT" },
      { status: "REJECTED", positionId: "p1", rejectionCategory: "ZEIT" },
      { status: "REJECTED", positionId: "p2", rejectionCategory: "ERFAHRUNG" },
      { status: "REJECTED", positionId: "p2", rejectionCategory: null },
      { status: "REJECTED", positionId: "p2", rejectionCategory: "GIBTSNICHT" },
      { status: "ACCEPTED", positionId: "p1", rejectionCategory: "ZEIT" },
    ]);
    expect(r.total).toBe(5);
    expect(r.uncategorized).toBe(2);
    expect(r.byCategory.map((c) => [c.key, c.count])).toEqual([["ZEIT", 2], ["ERFAHRUNG", 1]]);
    expect(r.byPosition.find((p) => p.positionId === "p2")).toEqual({ positionId: "p2", total: 3, counts: { ERFAHRUNG: 1 } });
  });
});

import { answerText, escapeRegex, snippet } from "@/lib/team/answer-search";

describe("Suche über Antworten", () => {
  it("Ausschnitt mit Treffer, Groß-/Kleinschreibung egal", () => {
    const s = snippet("Ich habe zwei Jahre Moderation auf einem anderen RP-Server gemacht und war dort auch im Support.", "moderation");
    expect(s?.match).toBe("Moderation");
    expect(s?.before.endsWith("Jahre ")).toBe(true);
    expect(snippet("nichts", "moderation")).toBeNull();
  });
  it("lange Texte werden gekürzt", () => {
    const long = `${"wort ".repeat(50)}Moderation${" text".repeat(50)}`;
    const s = snippet(long, "Moderation")!;
    expect(s.before.startsWith("… ")).toBe(true);
    expect(s.after.endsWith(" …")).toBe(true);
    expect(s.before.length + s.after.length).toBeLessThan(140);
  });
  it("Regex-Sonderzeichen werden entschärft, Listen/Zahlen lesbar", () => {
    expect(new RegExp(escapeRegex("a.b (c)")).test("a.b (c)")).toBe(true);
    expect(new RegExp(escapeRegex("a.b")).test("axb")).toBe(false);
    expect(answerText(["Discord", "TeamSpeak"])).toBe("Discord, TeamSpeak");
    expect(answerText(42)).toBe("42");
  });
});
