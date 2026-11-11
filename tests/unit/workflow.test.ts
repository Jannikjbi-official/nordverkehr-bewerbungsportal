import { describe, expect, it } from "vitest";
import { FOLLOW_UP_DAYS, canFollowUp, isInProcessing } from "@/lib/applications/status";
import { buildApplicantMessage, buildChangelogMessage, embedAuthor, v2Text } from "@/lib/messages/embed";
import { CHANGELOG } from "@/lib/changelog";
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
  });
});

describe("Absender der DM", () => {
  it("als Team: Nordverkehr-Kopf, ohne großes Logo", () => {
    expect(embedAuthor(null).name).toBe("NORDVERKEHR // TEAM");
    const msg = buildApplicantMessage({ title: "Hi", body: "Text" });
    expect(v2Text(msg)).toContain("-# NORDVERKEHR // TEAM");
    expect(JSON.stringify(msg.components)).not.toContain("logo.png");
  });
  it("persönlich: Name + Avatar", () => {
    const msg = buildApplicantMessage({ title: "Hi", body: "Text", author: { name: "Jonas", iconUrl: "https://cdn.discordapp.com/x.png" } });
    expect(v2Text(msg)).toContain("-# Jonas · Nordverkehr-Team");
    expect(JSON.stringify(msg.components)).toContain("https://cdn.discordapp.com/x.png");
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

describe("Bot-Log", () => {
  it("entschärft Discord-Markdown und Erwähnungen in Namen", () => {
    expect(esc("**fett** @everyone")).toBe("\\*\\*fett\\*\\* \\@everyone");
  });
});
