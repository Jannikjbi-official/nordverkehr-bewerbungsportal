import { describe, expect, it } from "vitest";
import { modalValue, parseCustomId, replyCustomId, replyModal } from "@/lib/discord/interactions";
import { buildBotLogMessage, buildLogMessage } from "@/lib/messages/embed";

describe("Discord-Knöpfe: Status & Antworten", () => {
  it("custom_ids", () => {
    expect(parseCustomId("nv:status:INTERVIEW:abcdefghij12")).toEqual({ kind: "status", to: "INTERVIEW", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:status:ACCEPTED:abcdefghij12")).toBeNull();
    expect(parseCustomId(replyCustomId("abcdefghij12"))).toEqual({ kind: "reply", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:replysubmit:abcdefghij12")).toEqual({ kind: "replySubmit", applicationId: "abcdefghij12" });
  });
  it("Fenster und Auslesen", () => {
    const m = replyModal("abcdefghij12", "NV-2026-0001");
    expect(m.type).toBe(9);
    expect(m.data.custom_id).toBe("nv:replysubmit:abcdefghij12");
    expect(modalValue({ components: [{ components: [{ custom_id: "body", value: "Hallo!" }] }] }, "body")).toBe("Hallo!");
    expect(modalValue({}, "body")).toBe("");
  });
  it("Bot-Log mit Antworten-Knopf, Bewerbungs-Post mit Status-Knöpfen", () => {
    const log = JSON.stringify(buildBotLogMessage("x", { url: "https://x/y", actions: [{ label: "Antworten", customId: "nv:reply:abcdefghij12" }] }));
    expect(log).toContain("nv:reply:abcdefghij12");
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
