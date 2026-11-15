import { describe, expect, it } from "vitest";
import { AI_SCORE_CONSENT, aiScoreAllowed } from "@/lib/applications/form";
import { GLOBAL_TEMPLATES, KI_CONSENT_TEMPLATE_BODY, KI_CONSENT_TEMPLATE_BODY_V1, TEAM_ONLY_TEMPLATE_TITLES, TEMPLATES } from "@/lib/setup/seed-data";
import { KIND_SEEDS } from "@/lib/setup/kinds-seed";
import { PLACEHOLDERS } from "@/lib/messages/placeholders";

describe("KI-Zustimmung per Pop-up (#80)", () => {
  const old = { consentVersion: "2026-11-v1", aiConsentOverrideAt: null };
  const fresh = { consentVersion: AI_SCORE_CONSENT, aiConsentOverrideAt: null };

  it("alte Bewerbung: erst nach „Erlauben“", () => {
    expect(aiScoreAllowed({ ...old, aiConsentAnswer: null })).toBe(false);
    expect(aiScoreAllowed({ ...old, aiConsentAnswer: "granted" })).toBe(true);
  });

  it("„Ablehnen“ gilt immer – auch gegen Einwilligung beim Absenden oder Admin-Freigabe", () => {
    expect(aiScoreAllowed({ ...fresh, aiConsentAnswer: "denied" })).toBe(false);
    expect(aiScoreAllowed({ ...old, aiConsentOverrideAt: new Date(), aiConsentAnswer: "denied" })).toBe(false);
    expect(aiScoreAllowed({ ...fresh, aiConsentAnswer: null })).toBe(true);
  });

  it("Baustein verweist auf die Knöpfe statt auf „Ja“", () => {
    expect(KI_CONSENT_TEMPLATE_BODY).toContain("**Erlauben**");
    expect(KI_CONSENT_TEMPLATE_BODY).not.toContain("**„Ja“**");
    expect(KI_CONSENT_TEMPLATE_BODY_V1).toContain("**„Ja“**");
  });
});

describe("Globale Bausteine", () => {
  const known = new Set<string>(PLACEHOLDERS.map((p) => p.key));
  const allTitles = [...TEMPLATES, ...GLOBAL_TEMPLATES, ...KIND_SEEDS.flatMap((k) => k.templates)].map((t) => t.title);

  it("Titel sind eindeutig (Migration legt nach Titel an)", () => {
    expect(new Set(allTitles).size).toBe(allTitles.length);
  });

  it("nur bekannte Platzhalter und keine Team-Begriffe", () => {
    for (const t of GLOBAL_TEMPLATES) {
      for (const m of t.body.matchAll(/\{([a-z_]+)\}/g)) expect(known.has(m[1]), `${t.title}: {${m[1]}}`).toBe(true);
      expect(t.body).not.toMatch(/Probezeit|Gespräch|Willkommen im Team/);
      expect(TEAM_ONLY_TEMPLATE_TITLES).not.toContain(t.title);
    }
  });
});

describe("Wartungsmodus (#107)", () => {
  it("ist standardmäßig aus und hat einen Hinweistext", async () => {
    const { settingsSchema } = await import("@/lib/settings");
    const s = settingsSchema.parse({});
    expect(s["maintenance.enabled"]).toBe(false);
    expect(s["maintenance.message"].length).toBeGreaterThan(10);
  });
});

describe("@Erwähnungen (#97)", async () => {
  const { parseMentions, mentionQueryAt, MAX_MENTIONS } = await import("@/lib/team/mentions");
  it("erkennt Benutzernamen, eindeutig und klein", () => {
    expect(parseMentions("@Jonas.hh schau mal, @lea_nord auch. @jonas.hh")).toEqual(["jonas.hh", "lea_nord"]);
  });
  it("ignoriert E-Mails und doppelte @", () => {
    expect(parseMentions("mail an a@b.de und @@x")).toEqual([]);
  });
  it("Satzzeichen am Ende gehören nicht zum Namen", () => {
    expect(parseMentions("danke @kim.")).toEqual(["kim"]);
  });
  it("höchstens MAX_MENTIONS", () => {
    expect(parseMentions("@aa @bb @cc @dd @ee @ff @gg")).toHaveLength(MAX_MENTIONS);
  });
  it("Vorschläge nur direkt nach @", () => {
    expect(mentionQueryAt("hallo @jo", 9)).toBe("jo");
    expect(mentionQueryAt("hallo @", 7)).toBe("");
    expect(mentionQueryAt("hallo @jo du", 12)).toBeNull();
    expect(mentionQueryAt("a@b", 3)).toBeNull();
  });
});

describe("Frist-Countdown (#101)", async () => {
  const { daysUntil, deadlineLabel, reminderDue } = await import("@/lib/positions/deadline");
  const now = new Date("2026-11-15T21:30:00Z"); // 22:30 in Deutschland
  it("zählt Kalendertage in deutscher Zeit", () => {
    expect(daysUntil(new Date("2026-11-15T23:30:00Z"), now)).toBe(1); // 00:30 am 16.11. (DE)
    expect(daysUntil(new Date("2026-11-20T08:00:00Z"), now)).toBe(5);
  });
  it("Text nur in den letzten 14 Tagen", () => {
    expect(deadlineLabel(new Date("2026-11-15T22:59:00Z"), now)).toBe("endet heute"); // 23:59 in DE
    expect(deadlineLabel(new Date("2026-11-15T23:30:00Z"), now)).toBe("endet morgen");
    expect(deadlineLabel(new Date("2026-11-15T12:00:00Z"), now)).toBe("endet heute");
    expect(deadlineLabel(new Date("2026-11-18T12:00:00Z"), now)).toBe("endet in 3 Tagen");
    expect(deadlineLabel(new Date("2026-12-31T12:00:00Z"), now)).toBeNull();
    expect(deadlineLabel(new Date("2026-11-10T12:00:00Z"), now)).toBeNull();
    expect(deadlineLabel(null, now)).toBeNull();
  });
  it("Erinnerung am Vortag oder Fristtag", () => {
    expect(reminderDue(new Date("2026-11-16T12:00:00Z"), now)).toBe(true);
    expect(reminderDue(new Date("2026-11-17T12:00:00Z"), now)).toBe(false);
  });
});
