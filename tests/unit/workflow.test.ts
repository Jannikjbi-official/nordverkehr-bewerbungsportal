import { describe, expect, it } from "vitest";
import { FOLLOW_UP_DAYS, canFollowUp, isInProcessing } from "@/lib/applications/status";
import { buildApplicantMessage, buildChangelogMessage, embedAuthor, v2Text } from "@/lib/messages/embed";
import { CHANGELOG, isPublished, todayBerlin } from "@/lib/changelog";
import { esc } from "@/lib/discord/botlog";

const DAY = 86_400_000;

describe("Rückzug: in Bearbeitung?", () => {
  it("eingegangen und nicht geclaimt → noch nicht in Bearbeitung (ohne Grund)", () => {
    expect(isInProcessing({ status: "SUBMITTED", claimedById: null })).toBe(false);
  });
  it("geclaimt, in Prüfung oder Gespräch → in Bearbeitung (mit Grund)", () => {
    expect(isInProcessing({ status: "SUBMITTED", claimedById: "u1" })).toBe(true);
    expect(isInProcessing({ status: "IN_REVIEW" })).toBe(true);
    expect(isInProcessing({ status: "INTERVIEW" })).toBe(true);
  });
  it("Rückfragen nur nach Rückzug während der Bearbeitung und innerhalb der Frist", () => {
    const now = Date.now();
    const recent = new Date(now - DAY);
    expect(canFollowUp({ status: "WITHDRAWN", withdrawnInReview: true, decidedAt: recent }, now)).toBe(true);
    expect(canFollowUp({ status: "WITHDRAWN", withdrawnInReview: false, decidedAt: recent }, now)).toBe(false);
    expect(canFollowUp({ status: "WITHDRAWN", withdrawnInReview: true, decidedAt: new Date(now - (FOLLOW_UP_DAYS + 1) * DAY) }, now)).toBe(false);
    expect(canFollowUp({ status: "REJECTED", withdrawnInReview: true, decidedAt: recent }, now)).toBe(false);
    // nach „Rückzug bestätigen“ ist Schluss
    expect(canFollowUp({ status: "WITHDRAWN", withdrawnInReview: true, decidedAt: recent, withdrawAckAt: new Date(now) }, now)).toBe(false);
  });
});

describe("Absender der DM", () => {
  it("als Team: Nordverkehr-Kopf mit Logo als Profilbild", () => {
    expect(embedAuthor(null).name).toBe("NORDVERKEHR // TEAM");
    const msg = buildApplicantMessage({ title: "Hi", body: "Text" });
    expect(v2Text(msg)).toContain("-# NORDVERKEHR // TEAM");
    expect(JSON.stringify(msg.components)).toContain("logo.png");
  });
  it("persönlich: Name + Avatar", () => {
    const msg = buildApplicantMessage({ title: "Hi", body: "Text", author: { name: "Jonas", iconUrl: "https://cdn.discordapp.com/x.png" } });
    expect(v2Text(msg)).toContain("-# Jonas · Nordverkehr-Team");
    expect(JSON.stringify(msg.components)).toContain("https://cdn.discordapp.com/x.png");
    expect(JSON.stringify(msg.components)).not.toContain("logo.png");
  });
});

describe("Changelog", () => {
  it("IDs eindeutig, Daten gültig, neueste zuerst", () => {
    const ids = CHANGELOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of CHANGELOG) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.items.length).toBeGreaterThan(0);
      expect(v2Text(buildChangelogMessage(e)).length).toBeLessThanOrEqual(4000);
      // Stil: jeder Punkt beginnt mit einem fetten Stichwort
      for (const i of e.items) expect(i.text, i.text).toMatch(/^\*\*.+\*\*/);
    }
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe("Changelog: Veröffentlichung um 0 Uhr", () => {
  const entry = { date: "2026-11-11" };
  it("der laufende Tag ist noch nicht veröffentlicht", () => {
    expect(isPublished(entry, new Date("2026-11-11T22:59:00Z"))).toBe(false); // 23:59 Berlin (Winter)
  });
  it("ab 0 Uhr deutscher Zeit ist er veröffentlicht", () => {
    expect(isPublished(entry, new Date("2026-11-11T23:00:00Z"))).toBe(true); // 00:00 Berlin
    expect(todayBerlin(new Date("2026-11-11T23:00:00Z"))).toBe("2026-11-12");
  });
  it("Sommerzeit: Mitternacht ist 22:00 UTC", () => {
    expect(todayBerlin(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(todayBerlin(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });
  it("Versionen eindeutig, neueste zuerst (mehrere am selben Tag erlaubt)", () => {
    expect(new Set(CHANGELOG.map((e) => e.version)).size).toBe(CHANGELOG.length);
    expect(new Set(CHANGELOG.map((e) => e.id)).size).toBe(CHANGELOG.length);
    const num = (v: string) => v.split(".").map(Number);
    for (let i = 1; i < CHANGELOG.length; i++) {
      const [a, b] = [num(CHANGELOG[i - 1].version), num(CHANGELOG[i].version)];
      expect(a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]), `${CHANGELOG[i - 1].version} vor ${CHANGELOG[i].version}`).toBe(true);
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
    for (const e of CHANGELOG) expect(e.version).toMatch(/^\d+\.\d+$/);
  });
});

describe("Bot-Log", () => {
  it("entschärft Discord-Markdown und Erwähnungen in Namen", () => {
    expect(esc("**fett** @everyone")).toBe("\\*\\*fett\\*\\* \\@everyone");
  });
});
