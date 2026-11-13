import { describe, expect, it } from "vitest";
import { ANSWER_BUTTON, PORTAL_ANSWER_LABEL, answerAction, answerCustomId, answerModal, parseCustomId, portalAnswerUrl } from "@/lib/discord/interactions";
import { buildApplicantMessage } from "@/lib/messages/embed";

describe("Bewerber: „Zurückschreiben“ aus der DM", () => {
  it("custom_ids", () => {
    expect(parseCustomId(answerCustomId("abcdefghij12"))).toEqual({ kind: "answer", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:answersubmit:abcdefghij12")).toEqual({ kind: "answerSubmit", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:answer:../x")).toBeNull();
  });
  it("Fenster", () => {
    const m = answerModal("abcdefghij12", "NV-2026-0001");
    expect(m.type).toBe(9);
    expect(m.data.custom_id).toBe("nv:answersubmit:abcdefghij12");
    expect(m.data.title.length).toBeLessThanOrEqual(45);
    expect(m.data.components[0].components[0]).toMatchObject({ custom_id: "body", min_length: 2, max_length: 2000 });
  });
  it("Knopf nur, wenn Discord-Interaktionen eingerichtet sind", () => {
    expect(answerAction("abcdefghij12", false)).toBeNull();
    expect(answerAction("abcdefghij12", true)).toEqual({ label: ANSWER_BUTTON.label, customId: "nv:answer:abcdefghij12", emoji: "✍️" });
  });
  it("DM: Zurückschreiben + Im Portal antworten (Sprung zum Antwortfeld)", () => {
    const msg = buildApplicantMessage({
      title: "Nachricht",
      body: "Hallo",
      statusUrl: portalAnswerUrl("https://portal.example", "abcdefghij12"),
      buttonLabel: PORTAL_ANSWER_LABEL,
      action: answerAction("abcdefghij12", true),
    });
    const json = JSON.stringify(msg);
    expect(json).toContain('"custom_id":"nv:answer:abcdefghij12"');
    expect(json).toContain('"label":"Im Portal antworten"');
    expect(json).toContain("https://portal.example/dashboard/abcdefghij12#antworten");
    // Ohne Interaktionen: nur der Link-Knopf
    const plain = JSON.stringify(buildApplicantMessage({ title: "x", body: "y", statusUrl: "https://p/d", buttonLabel: PORTAL_ANSWER_LABEL, action: answerAction("abcdefghij12", false) }));
    expect(plain).not.toContain("nv:answer:");
    expect(plain).toContain("Im Portal antworten");
  });
});
