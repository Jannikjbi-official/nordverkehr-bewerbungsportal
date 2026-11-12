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

import { criteriaFor, cleanScores, summarizeRatings, STANDARD_CRITERIA } from "@/lib/team/ratings";
import { nickWithPrefix } from "@/lib/discord/outbox";
import { acceptRoles, parseRoleIds, welcomeText } from "@/lib/discord/roles";
import { idleSinceClaim } from "@/lib/team/claim-nudge";
import { dueTransitions } from "@/lib/positions/schedule";

describe("Bewertungsbogen pro Stelle", () => {
  it("ohne eigene Kriterien → Standard", () => expect(criteriaFor({ ratingCriteria: [] })).toBe(STANDARD_CRITERIA));
  it("eigene Kriterien mit Hinweis, ohne Dubletten", () => {
    const c = criteriaFor({ ratingCriteria: ["Regelkenntnis | Kennt die Regeln?", "Regelkenntnis", "Ruhe im Ticket"] });
    expect(c.map((x) => x.label)).toEqual(["Regelkenntnis", "Ruhe im Ticket"]);
    expect(c[0]).toMatchObject({ key: "p_regelkenntnis", hint: "Kennt die Regeln?" });
  });
  it("Punkte nur für die Kriterien der Stelle", () => {
    const c = criteriaFor({ ratingCriteria: ["Regelkenntnis"] });
    expect(cleanScores({ p_regelkenntnis: 4, kommunikation: 5 }, c)).toEqual({ p_regelkenntnis: 4 });
    expect(summarizeRatings([{ scores: { p_regelkenntnis: 2 } }, { scores: { p_regelkenntnis: 5 } }], c).overall).toBe(3.5);
  });
});

describe("Annahme: Rollen, Präfix, Gruß", () => {
  it("Präfix setzen und wieder entfernen", () => {
    expect(nickWithPrefix("Jonas", "[Support]", "add")).toBe("[Support] Jonas");
    expect(nickWithPrefix("[Support] Jonas", "[Support]", "add")).toBeUndefined();
    expect(nickWithPrefix("[Support] Jonas", "[Support]", "remove")).toBe("Jonas");
    expect(nickWithPrefix("Jonas", "[Support]", "remove")).toBeUndefined();
    expect(nickWithPrefix("[Support]", "[Support]", "remove")).toBeNull();
    expect(nickWithPrefix("x".repeat(40), "[S]", "add")!.length).toBe(32);
  });
  it("Rollen der Stelle + zusätzliche, ohne Dubletten", () => {
    expect(parseRoleIds("123456789012345678, 223456789012345678 abc")).toEqual(["123456789012345678", "223456789012345678"]);
    expect(acceptRoles({ acceptRoleId: "123456789012345678" }, "123456789012345678,323456789012345678")).toEqual(["123456789012345678", "323456789012345678"]);
    expect(acceptRoles({ acceptRoleId: null }, "")).toEqual([]);
  });
  it("Willkommensgruß", () => expect(welcomeText("Hi {mention} ({name}) als {stelle}", { discordId: "1", name: "Lea", position: "Support" })).toBe("Hi <@1> (Lea) als Support"));
});

describe("Claim-Erinnerung & Kontingent", () => {
  const claimed = new Date("2026-11-01T10:00:00Z");
  it("nur ohne Aktivität seit dem Claim", () => {
    expect(idleSinceClaim(claimed, [null, new Date("2026-10-30T10:00:00Z")])).toBe(true);
    expect(idleSinceClaim(claimed, [new Date("2026-11-02T10:00:00Z")])).toBe(false);
  });
  it("volle Stelle (0 Plätze) öffnet nicht automatisch", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const base = { status: "CLOSED" as const, opensAt: new Date("2026-11-11T10:00:00Z"), closesAt: null };
    expect(dueTransitions([{ id: "a", ...base, seats: 0 }], now)).toEqual([]);
    expect(dueTransitions([{ id: "b", ...base, seats: 2 }], now)).toHaveLength(1);
  });
});
