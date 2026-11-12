import { describe, expect, it } from "vitest";
import { normalizePublicId, openListReply, parseCustomId, cancelConfirmReply, ALL_COMMANDS } from "@/lib/discord/interactions";
import { interviewBlockText } from "@/lib/team/service";
import { buildApplicantMessage } from "@/lib/messages/embed";

describe("Phase-2-Hürde (Sterne)", () => {
  it("ohne Bewertung gesperrt", () => expect(interviewBlockText(null, 3)).toContain("erst nach der Bewertung"));
  it("unter der Grenze gesperrt", () => expect(interviewBlockText(2.9, 3)).toContain("Unter 3"));
  it("ab der Grenze frei", () => {
    expect(interviewBlockText(3, 3)).toBeNull();
    expect(interviewBlockText(4.5, 3)).toBeNull();
  });
  it("0 = keine Hürde", () => expect(interviewBlockText(null, 0)).toBeNull());
});

describe("/claim: Bewerbungs-ID", () => {
  it("volle und kurze Schreibweisen", () => {
    expect(normalizePublicId("NV-2026-0012", 2026)).toBe("NV-2026-0012");
    expect(normalizePublicId("nv-2026-12", 2026)).toBe("NV-2026-0012");
    expect(normalizePublicId(" nv 2026 12 ", 2026)).toBe("NV-2026-0012");
    expect(normalizePublicId("12", 2026)).toBe("NV-2026-0012");
    expect(normalizePublicId("#7", 2027)).toBe("NV-2027-0007");
  });
  it("eigenes Präfix und Unsinn", () => {
    expect(normalizePublicId("ab-2026-3", 2026, "AB")).toBe("AB-2026-0003");
    expect(normalizePublicId("NV-2026-3", 2026, "AB")).toBeNull();
    expect(normalizePublicId("hallo", 2026)).toBeNull();
  });
});

describe("Knöpfe & Befehle", () => {
  it("custom_ids", () => {
    expect(parseCustomId("nv:claim:abcdefghij12")).toEqual({ kind: "claim", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:cancel:abcdefghij12")).toEqual({ kind: "cancelInterview", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:cancelok:abcdefghij12")).toEqual({ kind: "cancelInterviewConfirmed", applicationId: "abcdefghij12" });
    expect(parseCustomId("nv:cancel:../../x")).toBeNull();
  });
  it("Rückfrage vor dem Absagen ist ephemeral mit Bestätigungsknopf", () => {
    const r = cancelConfirmReply("abcdefghij12", "morgen");
    expect(r.data.flags).toBe(64);
    expect(JSON.stringify(r)).toContain("nv:cancelok:abcdefghij12");
  });
  it("Befehle haben eindeutige Namen", () => {
    const names = ALL_COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(["bewerbung", "offen", "claim"]));
  });
  it("/offen-Liste", () => {
    expect(openListReply([], 0, "https://x")).toContain("Keine offenen");
    const t = openListReply([{ id: "a1", publicId: "NV-2026-0001", statusLabel: "Eingereicht", position: "Support", submittedAt: null, claimedBy: null }], 3, "https://x");
    expect(t).toContain("**frei**");
    expect(t).toContain("https://x/team/bewerbungen/a1");
    expect(t).toContain("2 weitere");
  });
  it("Erinnerungs-DM mit Absage-Knopf", () => {
    const msg = buildApplicantMessage({ title: "Heute", body: "x", statusUrl: "https://x/d", action: { label: "Ich kann nicht", customId: "nv:cancel:abcdefghij12" } });
    const json = JSON.stringify(msg.components);
    expect(json).toContain("nv:cancel:abcdefghij12");
    expect(json).toContain("https://x/d");
  });
});
