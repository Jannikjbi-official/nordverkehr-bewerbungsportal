import { describe, expect, it } from "vitest";
import { buildTemplateVars, combineTemplates, findPlaceholders, renderTemplate } from "@/lib/messages/placeholders";
import {
  BRAND_COLOR,
  COMPONENTS_V2,
  V2_TEXT_LIMIT,
  WARN_COLOR,
  buildApplicantMessage,
  buildBotLogMessage,
  buildChangelogMessage,
  buildLogMessage,
  v2Text,
} from "@/lib/messages/embed";
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

type Comp = { type: number; accent_color?: number; components?: Comp[]; url?: string };
const container = (m: { components?: unknown[] }) => (m.components as Comp[])[0];
const buttons = (m: { components?: unknown[] }) =>
  (container(m).components ?? []).filter((c) => c.type === 1).flatMap((r) => r.components ?? []);

describe("Discord-Nachrichten (Components V2)", () => {
  it("Bewerber-Nachricht: V2-Flag, Container in Markenfarbe, ohne content/embeds, ohne Pings", () => {
    const m = buildApplicantMessage({ title: "Hallo", body: "Text", publicId: "NV-1", statusUrl: "https://bewerbung.nordverkehr.xyz/x" });
    expect(m.flags).toBe(COMPONENTS_V2);
    expect(m.content).toBeUndefined();
    expect(m.embeds).toBeUndefined();
    expect(container(m)).toMatchObject({ type: 17, accent_color: BRAND_COLOR });
    expect(v2Text(m)).toContain("NV-1");
    expect(m.allowed_mentions).toEqual({ parse: [] });
    expect(buttons(m)).toHaveLength(1);
  });
  it("bleibt unter dem 4000-Zeichen-Limit für Text", () => {
    const m = buildApplicantMessage({ title: "x".repeat(300), body: "a".repeat(9000), publicId: "NV-1" });
    expect(v2Text(m).length).toBeLessThanOrEqual(V2_TEXT_LIMIT);
  });
  it("Link-Button nur bei https", () => {
    expect(buttons(buildApplicantMessage({ title: "x", body: "y", statusUrl: "http://localhost:3000/dashboard" }))).toHaveLength(0);
  });
  it("Bewerbungs-Post mit Position, Hinweisen und Button, ohne Ping", () => {
    const m = buildLogMessage({
      positionTitle: "Support",
      applicantDiscordId: "111",
      applicantName: "Jonas",
      publicId: "NV-2026-0008",
      age: 24,
      teamUrl: "https://bewerbung.nordverkehr.xyz/team/bewerbungen/x",
      flags: ["Sehr kurze Antworten"],
    });
    expect(m.flags).toBe(COMPONENTS_V2);
    expect(v2Text(m)).toContain("**Position:** Support");
    expect(v2Text(m)).toContain("Sehr kurze Antworten");
    expect(buttons(m)[0]?.url).toContain("/team/bewerbungen/x");
    expect(m.allowed_mentions).toEqual({ parse: [] });
  });
  it("Bot-Log und Changelog ebenfalls als V2", () => {
    const log = buildBotLogMessage("📥 Neue Bewerbung", { tone: "warn", url: "https://bewerbung.nordverkehr.xyz/team" });
    expect(log.flags).toBe(COMPONENTS_V2);
    expect(container(log).accent_color).toBe(WARN_COLOR);
    const cl = buildChangelogMessage(
      { title: "Update", date: "2026-11-11", items: [{ kind: "neu", text: "A" }, { kind: "fix", text: "B" }, { kind: "neu", text: "C" }] },
      "https://bewerbung.nordverkehr.xyz/team/changelog",
    );
    expect(cl.flags).toBe(COMPONENTS_V2);
    const t = v2Text(cl);
    expect(t).toContain("### ✨ Neu\n- A\n- C");
    expect(t).toContain("### 🐛 Behoben\n- B");
    expect(t).not.toContain("Verbessert");
    expect(t).toContain("11. November 2026");
    expect(JSON.stringify(cl.components)).not.toContain("logo.png");
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
