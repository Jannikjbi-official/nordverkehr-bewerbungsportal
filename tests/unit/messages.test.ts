import { describe, expect, it } from "vitest";
import { buildTemplateVars, combineTemplates, findPlaceholders, renderTemplate } from "@/lib/messages/placeholders";
import { BRAND_COLOR, EMBED_DESCRIPTION_LIMIT, buildApplicantMessage, buildLogMessage } from "@/lib/messages/embed";
import { csvCell } from "@/lib/csv";

describe("renderTemplate", () => {
  it("ersetzt alle bekannten Platzhalter", () => {
    const r = renderTemplate("Moin {name}, deine Bewerbung {bewerbungs_id} als {position}.", {
      name: "Lea",
      bewerbungs_id: "NV-2026-0002",
      position: "Moderator",
    });
    expect(r.text).toBe("Moin Lea, deine Bewerbung NV-2026-0002 als Moderator.");
    expect(r.missing).toEqual([]);
  });
  it("lässt fehlende Werte sichtbar stehen und meldet sie", () => {
    const r = renderTemplate("Termin: {termin}, Grund: {grund}", { termin: "" });
    expect(r.text).toBe("Termin: {termin}, Grund: {grund}");
    expect(r.missing.sort()).toEqual(["grund", "termin"]);
  });
  it("lässt unbekannte geschweifte Klammern unangetastet", () => {
    expect(renderTemplate("{foo} und {name}", { name: "X" }).text).toBe("{foo} und X");
  });
  it("ersetzt mehrfach vorkommende Platzhalter", () => {
    expect(renderTemplate("{name} {name}", { name: "A" }).text).toBe("A A");
  });
  it("Werte werden nicht erneut ausgewertet", () => {
    expect(renderTemplate("Hallo {name}", { name: "{grund}", grund: "X" }).text).toBe("Hallo {grund}");
  });
});

describe("combineTemplates & findPlaceholders", () => {
  it("verbindet Bausteine mit Leerzeile und ignoriert leere", () => {
    expect(combineTemplates(["Absage. ", "", " Tipps."])).toBe("Absage.\n\nTipps.");
  });
  it("findet nur bekannte Platzhalter, eindeutig", () => {
    expect(findPlaceholders("{name} {x} {name} {sperrfrist}")).toEqual(["name", "sperrfrist"]);
  });
});

describe("buildTemplateVars", () => {
  it("Anzeigename, sonst Benutzername; Daten auf Deutsch", () => {
    const v = buildTemplateVars({
      applicant: { username: "lea_nord", globalName: null },
      positionTitle: "Support",
      publicId: "NV-2026-0001",
      submittedAt: new Date("2026-11-11T10:00:00Z"),
      cooldownUntil: new Date("2026-12-11T10:00:00Z"),
    });
    expect(v.name).toBe("lea_nord");
    expect(v.discord_tag).toBe("@lea_nord");
    expect(v.datum).toBe("11. November 2026");
    expect(v.sperrfrist).toBe("11. Dezember 2026");
    expect(v.termin).toBeUndefined();
  });
});

describe("Discord-Embeds", () => {
  it("Bewerber-Nachricht im Nordverkehr-Design, ohne Pings", () => {
    const m = buildApplicantMessage({ title: "Hallo", body: "Text", publicId: "NV-1", statusUrl: "https://bewerbung.nordverkehr.xyz/x" });
    expect(m.embeds?.[0].color).toBe(BRAND_COLOR);
    expect(m.embeds?.[0].footer?.text).toContain("NV-1");
    expect(m.allowed_mentions).toEqual({ parse: [] });
    expect(m.components).toHaveLength(1);
  });
  it("kürzt zu lange Texte aufs Discord-Limit", () => {
    expect(buildApplicantMessage({ title: "x", body: "a".repeat(5000) }).embeds?.[0].description?.length).toBe(EMBED_DESCRIPTION_LIMIT);
  });
  it("Link-Button nur bei https", () => {
    expect(buildApplicantMessage({ title: "x", body: "y", statusUrl: "http://localhost:3000/dashboard" }).components).toBeUndefined();
  });
  it("Log-Post mit Position & Hinweisen, ohne Ping", () => {
    const m = buildLogMessage({
      positionTitle: "Support",
      applicantDiscordId: "111",
      applicantName: "Jonas",
      publicId: "NV-2026-0008",
      age: 24,
      teamUrl: "https://bewerbung.nordverkehr.xyz/team/bewerbungen/x",
      flags: ["Sehr kurze Antworten"],
    });
    const fields = m.embeds?.[0].fields ?? [];
    expect(fields.find((f) => f.name === "Position")?.value).toBe("Support");
    expect(fields.find((f) => f.name === "Hinweise")?.value).toContain("Sehr kurze Antworten");
    expect(m.allowed_mentions).toEqual({ parse: [] });
  });
});

describe("CSV-Export", () => {
  it("entschärft Formel-Injection und quotet Sonderzeichen", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('sag "moin"')).toBe('"sag ""moin"""');
    expect(csvCell(null)).toBe("");
  });
});
