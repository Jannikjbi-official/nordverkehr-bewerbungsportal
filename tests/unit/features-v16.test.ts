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
