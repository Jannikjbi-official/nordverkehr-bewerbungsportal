import { describe, expect, it } from "vitest";
import { parseCustomId } from "@/lib/discord/interactions";
import { buildBotLogMessage, buildLogMessage } from "@/lib/messages/embed";

describe("Discord-Knöpfe: Status", () => {
  it("custom_ids", () => {
    expect(parseCustomId("nv:status:INTERVIEW:abcdefghij12")).toEqual({ kind: "status", to: "INTERVIEW", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:status:ACCEPTED:abcdefghij12")).toBeNull();
  });
  it("Bot-Log mit Aktions-Knopf, Bewerbungs-Post mit Status-Knöpfen", () => {
    const log = JSON.stringify(buildBotLogMessage("x", { url: "https://x/y", actions: [{ label: "Übernehmen", customId: "nv:claim:abcdefghij12" }] }));
    expect(log).toContain("nv:claim:abcdefghij12");
    expect(log).toContain("https://x/y");
    const post = JSON.stringify(
      buildLogMessage({ positionTitle: "Support", applicantDiscordId: "1", applicantName: "A", publicId: "NV-1", age: 20, teamUrl: "https://x/t", flags: [], claimCustomId: "nv:claim:abcdefghij12" }),
    );
    expect(post).toContain("nv:claim:abcdefghij12");
    expect(post).toContain("nv:status:IN_REVIEW:abcdefghij12");
    expect(post).toContain("nv:status:INTERVIEW:abcdefghij12");
  });
});

import { forThisInterview, noShowSuspected, voiceSummary } from "@/lib/team/voice";

describe("Sprachkanal-Erkennung", () => {
  const at = new Date("2026-11-20T18:00:00Z");
  it("zählt nur Zeiten dieses Termins", () => {
    expect(forThisInterview(new Date("2026-11-20T17:55:00Z"), at)).toBe(true);
    expect(forThisInterview(new Date("2026-11-13T18:00:00Z"), at)).toBe(false);
    expect(forThisInterview(null, at)).toBe(false);
  });
  it("„Nicht erschienen?“ erst nach 10 Minuten und nur mit Kanal", () => {
    const now = at.getTime() + 5 * 60_000;
    expect(noShowSuspected({ interviewAt: at, voiceJoinedAt: null, now, tracking: true })).toBe(false);
    expect(noShowSuspected({ interviewAt: at, voiceJoinedAt: null, now: at.getTime() + 11 * 60_000, tracking: false })).toBe(false);
    expect(noShowSuspected({ interviewAt: at, voiceJoinedAt: new Date("2026-11-13T18:00:00Z"), now: at.getTime() + 11 * 60_000, tracking: true })).toBe(true);
  });
  it("Dauer", () => {
    expect(voiceSummary(new Date("2026-11-20T18:02:00Z"), new Date("2026-11-20T18:31:00Z"), at)).toBe("19:02–19:31 Uhr (29 Min.)");
    expect(voiceSummary(new Date("2026-11-20T18:02:00Z"), null, at)).toBe("seit 19:02 Uhr");
  });
});

import { extendedUntil, readMentorFeedback } from "@/lib/team/probation";

describe("Probezeit & Pate", () => {
  it("verlängern ab dem späteren Datum", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(extendedUntil(new Date("2026-11-10T12:00:00Z"), now).toISOString()).toBe("2026-11-27T12:00:00.000Z");
    expect(extendedUntil(new Date("2026-11-20T12:00:00Z"), now).toISOString()).toBe("2026-12-04T12:00:00.000Z");
    expect(extendedUntil(null, now).toISOString()).toBe("2026-11-27T12:00:00.000Z");
  });
  it("Rückmeldung lesen", () => {
    expect(readMentorFeedback({ rating: "help", note: "x", by: "Mats", at: "2026-11-13" })?.rating).toBe("help");
    expect(readMentorFeedback({ rating: "meh" })).toBeNull();
    expect(readMentorFeedback(null)).toBeNull();
  });
});

import { isJunior } from "@/lib/team/rights";

describe("Junior-Team", () => {
  const J = "111111111111111111";
  it("Rolle aus den Einstellungen", () => {
    expect(isJunior([J, "222222222222222222"], false, `${J}`)).toBe(true);
    expect(isJunior(["222222222222222222"], false, `${J}`)).toBe(false);
    expect(isJunior([J], false, "")).toBe(false);
  });
  it("Admins sind nie Junior", () => expect(isJunior([J], true, J)).toBe(false));
});

import { berlinDayBounds, roundPhase, roundStats } from "@/lib/team/rounds";

describe("Bewerbungsrunden", () => {
  it("Tagesgrenzen in deutscher Zeit (Winter/Sommer)", () => {
    expect(berlinDayBounds("2026-12-01").start.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(berlinDayBounds("2026-07-01").start.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(berlinDayBounds("2026-12-01").end.toISOString()).toBe("2026-12-01T22:59:59.000Z");
  });
  it("Kennzahlen und Ziel", () => {
    const d = (s: string) => new Date(s);
    const s = roundStats(
      [
        { status: "ACCEPTED", submittedAt: d("2026-12-01"), decidedAt: d("2026-12-03") },
        { status: "REJECTED", submittedAt: d("2026-12-01"), decidedAt: d("2026-12-05") },
        { status: "SUBMITTED", submittedAt: d("2026-12-02"), decidedAt: null },
      ],
      2,
    );
    expect(s).toMatchObject({ total: 3, accepted: 1, rejected: 1, open: 1, avgDays: 3, targetReached: false });
  });
  it("Phase", () => {
    const r = { startsAt: new Date("2026-12-01"), endsAt: new Date("2026-12-31") };
    expect(roundPhase(r, new Date("2026-11-20").getTime())).toBe("geplant");
    expect(roundPhase(r, new Date("2026-12-10").getTime())).toBe("läuft");
    expect(roundPhase(r, new Date("2027-01-02").getTime())).toBe("beendet");
  });
});

import { MATCH_QUESTIONS, scorePositions } from "@/lib/applications/match";

describe("Welche Stelle passt zu mir?", () => {
  const slugs = ["support", "moderator", "entwickler", "media", "mapper", "eventteam"];
  it("Support-Typ landet bei Support", () => {
    const answers = { ort: 0, staerke: 0, technik: 3, zeit: 2, stress: 0 };
    expect(scorePositions(answers, slugs)[0].slug).toBe("support");
  });
  it("Technik-Typ landet bei Entwickler", () => {
    expect(scorePositions({ ort: 2, staerke: 4, technik: 0, zeit: 1, stress: 2 }, slugs)[0].slug).toBe("entwickler");
  });
  it("nur vorhandene Stellen, jede Frage hat Antworten", () => {
    expect(scorePositions({ ort: 0 }, ["moderator"]).every((r) => r.slug === "moderator")).toBe(true);
    for (const q of MATCH_QUESTIONS) expect(q.options.length).toBeGreaterThan(1);
  });
});

describe("Review-Fixes 13.11.", () => {
  it("Rundenende an Tagen mit Zeitumstellung", () => {
    const b = berlinDayBounds("2026-10-25");
    expect(b.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-10-25T22:59:59.000Z");
    expect(berlinDayBounds("2026-03-29").end.toISOString()).toBe("2026-03-29T21:59:59.000Z");
  });
  it("Selbsttest: neu angelegte Stellen erscheinen (hinten)", () => {
    const r = scorePositions({ ort: 0, staerke: 0, technik: 3, zeit: 2, stress: 0 }, ["support", "fraktionsverwaltung"]);
    expect(r[0].slug).toBe("support");
    expect(r.map((x) => x.slug)).toContain("fraktionsverwaltung");
    expect(scorePositions({ ort: 0 }, ["fraktionsverwaltung"])).toEqual([{ slug: "fraktionsverwaltung", points: 1 }]);
  });
});
