import { describe, expect, it } from "vitest";
import { checkEligibility, cooldownUntil, type EligibilityInput } from "@/lib/applications/rules";
import { validateAll, validateAnswer, type FormQuestion } from "@/lib/applications/form";
import { computeFlags, jaccard, shingles } from "@/lib/applications/flags";
import { canTeamTransition } from "@/lib/applications/status";
import { parseSettings } from "@/lib/settings";

const NOW = new Date("2026-11-11T12:00:00Z");
const DAY = 86_400_000;

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    now: NOW,
    position: { id: "p1", status: "OPEN", cooldownDays: null, minAge: null },
    settings: { cooldownDays: 30, minAge: 18 },
    previous: [],
    activeBan: null,
    ...over,
  };
}

describe("checkEligibility", () => {
  it("erlaubt die erste Bewerbung", () => {
    expect(checkEligibility(input())).toEqual({ ok: true, draftId: null });
  });
  it("gibt einen bestehenden Entwurf zurück", () => {
    expect(checkEligibility(input({ previous: [{ id: "d1", status: "DRAFT", decidedAt: null }] }))).toEqual({ ok: true, draftId: "d1" });
  });
  it("nur eine offene Bewerbung pro Position", () => {
    expect(checkEligibility(input({ previous: [{ id: "a1", status: "IN_REVIEW", decidedAt: null }] }))).toMatchObject({
      ok: false,
      code: "open_exists",
      applicationId: "a1",
    });
  });
  it("Sperrfrist nach Ablehnung", () => {
    const r = checkEligibility(input({ previous: [{ id: "a1", status: "REJECTED", decidedAt: new Date(NOW.getTime() - 10 * DAY) }] }));
    expect(r).toMatchObject({ ok: false, code: "cooldown" });
    if (!r.ok) expect(r.until?.getTime()).toBe(NOW.getTime() + 20 * DAY);
  });
  it("nach Ablauf der Sperrfrist wieder erlaubt", () => {
    expect(checkEligibility(input({ previous: [{ id: "a1", status: "REJECTED", decidedAt: new Date(NOW.getTime() - 31 * DAY) }] })).ok).toBe(true);
  });
  it("Positions-Sperrfrist überschreibt die globale", () => {
    const r = checkEligibility(
      input({
        position: { id: "p1", status: "OPEN", cooldownDays: 0, minAge: null },
        previous: [{ id: "a1", status: "REJECTED", decidedAt: new Date(NOW.getTime() - DAY) }],
      }),
    );
    expect(r.ok).toBe(true);
  });
  it("gesperrte Nutzer können sich nicht bewerben, abgelaufene Sperre zählt nicht", () => {
    expect(checkEligibility(input({ activeBan: { reason: "x", expiresAt: null } }))).toMatchObject({ ok: false, code: "banned" });
    expect(checkEligibility(input({ activeBan: { reason: "x", expiresAt: new Date(NOW.getTime() - 1) } })).ok).toBe(true);
  });
  it("geschlossene Positionen nehmen nichts an", () => {
    expect(checkEligibility(input({ position: { id: "p1", status: "CLOSED", cooldownDays: null, minAge: null } }))).toMatchObject({ ok: false, code: "closed" });
  });
  it("cooldownUntil", () => {
    expect(cooldownUntil(null, 30)).toBeNull();
    expect(cooldownUntil(NOW, 0)).toBeNull();
  });
});

const q = (over: Partial<FormQuestion>): FormQuestion => ({
  id: "q1",
  label: "Frage",
  helpText: null,
  placeholder: null,
  type: "LONG_TEXT",
  required: true,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  options: [],
  ...over,
});

describe("validateAnswer", () => {
  it("Pflichtfeld", () => {
    expect(validateAnswer(q({}), "")).toBeTruthy();
    expect(validateAnswer(q({ required: false }), "")).toBeNull();
  });
  it("Mindestlänge zählt ohne Leerzeichen am Rand", () => {
    expect(validateAnswer(q({ minLength: 10 }), "   kurz   ")).toMatch(/mindestens 10/);
    expect(validateAnswer(q({ minLength: 4 }), "lang genug")).toBeNull();
  });
  it("Auswahl nur aus den Optionen", () => {
    expect(validateAnswer(q({ type: "SELECT", options: ["a", "b"] }), "c")).toBeTruthy();
    expect(validateAnswer(q({ type: "SELECT", options: ["a", "b"] }), "a")).toBeNull();
    expect(validateAnswer(q({ type: "MULTI_SELECT", options: ["a", "b"], minValue: 1 }), ["a", "x"])).toBeTruthy();
  });
  it("URL nur http/https", () => {
    expect(validateAnswer(q({ type: "URL" }), "javascript:alert(1)")).toBeTruthy();
    expect(validateAnswer(q({ type: "URL" }), "https://github.com/nv")).toBeNull();
  });
  it("Checkbox muss bestätigt sein", () => {
    expect(validateAnswer(q({ type: "CHECKBOX" }), false)).toBeTruthy();
    expect(validateAnswer(q({ type: "CHECKBOX" }), true)).toBeNull();
  });
  it("Zahl mit Grenzen", () => {
    expect(validateAnswer(q({ type: "NUMBER", minValue: 1, maxValue: 5 }), 7)).toBeTruthy();
    expect(validateAnswer(q({ type: "NUMBER", minValue: 1, maxValue: 5 }), 3)).toBeNull();
  });
  it("validateAll sammelt Fehler pro Frage", () => {
    const r = validateAll([{ id: "s", title: "S", description: null, questions: [q({ id: "a" }), q({ id: "b", required: false })] }], {});
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toEqual(["a"]);
  });
});

describe("computeFlags (Hinweise, kein Score)", () => {
  const base = { discordCreatedAt: new Date("2020-01-01"), now: NOW, minAccountDays: 30, otherApplications: [] };
  it("markiert viele sehr kurze Antworten", () => {
    const flags = computeFlags({
      ...base,
      textAnswers: [
        { label: "A", value: "kurz", minExpected: 80 },
        { label: "B", value: "auch kurz", minExpected: 80 },
      ],
    });
    expect(flags.map((f) => f.code)).toContain("short_answers");
  });
  it("markiert identische Antworten", () => {
    const t = "Das ist eine längere Antwort, die ich einfach zweimal eingefügt habe.";
    const flags = computeFlags({ ...base, textAnswers: [{ label: "A", value: t, minExpected: 0 }, { label: "B", value: t, minExpected: 0 }] });
    expect(flags.map((f) => f.code)).toContain("duplicate_answers");
  });
  it("markiert junge Discord-Accounts", () => {
    expect(computeFlags({ ...base, discordCreatedAt: new Date(NOW.getTime() - 5 * DAY), textAnswers: [] }).map((f) => f.code)).toContain("young_account");
  });
  it("erkennt sehr ähnliche Bewerbungen", () => {
    const text = Array.from({ length: 40 }, (_, i) => `wort${i}`).join(" ");
    const flags = computeFlags({ ...base, textAnswers: [{ label: "A", value: text, minExpected: 0 }], otherApplications: [{ publicId: "NV-1", text }] });
    expect(flags.find((f) => f.code === "similar_to_other")?.message).toContain("NV-1");
  });
  it("jaccard ist 0 bei leeren Mengen", () => {
    expect(jaccard(shingles(""), shingles("a b c"))).toBe(0);
  });
});

describe("Statuswechsel", () => {
  it("Team darf Entwürfe und zurückgezogene Bewerbungen nicht ändern", () => {
    expect(canTeamTransition("DRAFT", "ACCEPTED")).toBe(false);
    expect(canTeamTransition("WITHDRAWN", "IN_REVIEW")).toBe(false);
  });
  it("übliche Wege sind erlaubt", () => {
    expect(canTeamTransition("SUBMITTED", "IN_REVIEW")).toBe(true);
    expect(canTeamTransition("INTERVIEW", "ACCEPTED")).toBe(true);
    expect(canTeamTransition("REJECTED", "IN_REVIEW")).toBe(true);
  });
});

describe("Einstellungen", () => {
  it("ungültige Werte fallen auf Standard zurück, Booleans aus Text", () => {
    const s = parseSettings([
      { key: "applications.minAge", value: "abc" },
      { key: "ai.enabled", value: "false" },
      { key: "ai.autoReplyEnabled", value: true },
      { key: "unbekannt", value: 1 },
    ]);
    expect(s["applications.minAge"]).toBe(18);
    expect(s["ai.enabled"]).toBe(false);
    expect(s["ai.autoReplyEnabled"]).toBe(true);
  });
});
