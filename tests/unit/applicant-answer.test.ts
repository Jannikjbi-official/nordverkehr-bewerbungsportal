import { describe, expect, it } from "vitest";
import { PORTAL_ANSWER_LABEL, parseCustomId, portalAnswerUrl } from "@/lib/discord/interactions";
import { buildApplicantMessage, buildBotLogMessage } from "@/lib/messages/embed";

describe("Antworten nur im Portal (keine Discord-Fenster)", () => {
  it("alte Antwort-Knöpfe gelten als veraltet", () => {
    for (const id of ["nv:reply:abcdefghij12", "nv:replysubmit:abcdefghij12", "nv:answer:abcdefghij12", "nv:answersubmit:abcdefghij12"]) {
      expect(parseCustomId(id)).toBeNull();
    }
  });
  it("DM: nur Link „Im Portal antworten“ zum Antwortfeld", () => {
    const json = JSON.stringify(
      buildApplicantMessage({ title: "Nachricht", body: "Hallo", statusUrl: portalAnswerUrl("https://portal.example", "abcdefghij12"), buttonLabel: PORTAL_ANSWER_LABEL }),
    );
    expect(json).toContain('"label":"Im Portal antworten"');
    expect(json).toContain("https://portal.example/dashboard/abcdefghij12#antworten");
    expect(json).not.toContain("custom_id");
  });
  it("Bot-Log: Link-Knopf mit eigener Beschriftung, ohne Interaktion", () => {
    const json = JSON.stringify(buildBotLogMessage("💬 Neue Antwort", { url: "https://portal.example/team/bewerbungen/x#nachricht", linkLabel: "Im Portal antworten" }));
    expect(json).toContain('"label":"Im Portal antworten"');
    expect(json).not.toContain("custom_id");
    expect(JSON.stringify(buildBotLogMessage("x", { url: "https://p/x" }))).toContain('"label":"Öffnen"');
  });
});
