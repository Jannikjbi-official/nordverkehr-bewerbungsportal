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
