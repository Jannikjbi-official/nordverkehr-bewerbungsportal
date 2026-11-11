import { describe, expect, it } from "vitest";
import { buildJobsMessage, buildSpotlightMessage, type JobPosition } from "@/lib/messages/jobs";
import { COMPONENTS_V2, V2_TEXT_LIMIT, v2Text } from "@/lib/messages/embed";
import { POSITIONS } from "@/lib/setup/seed-data";

const positions: JobPosition[] = POSITIONS.map((p) => ({
  slug: p.slug,
  title: p.title,
  tagline: p.tagline,
  description: p.description,
  icon: p.icon,
  status: p.status as JobPosition["status"],
  tasks: p.tasks,
  requirements: p.requirements,
  minAge: null,
  acceptRoleId: null,
}));
const opts = { appUrl: "https://bewerbung.nordverkehr.xyz", defaultMinAge: 18, updatedAt: new Date("2026-11-11T12:00:00Z") };
const buttons = (m: ReturnType<typeof buildJobsMessage>) =>
  JSON.parse(JSON.stringify(m.components)).flatMap(function walk(c: { type: number; components?: unknown[] }): unknown[] {
    return c.type === 2 ? [c] : (c.components ?? []).flatMap((x) => walk(x as { type: number; components?: unknown[] }));
  }) as { label: string; url: string }[];

describe("Stellenaufruf", () => {
  const m = buildJobsMessage(positions, opts);
  const t = v2Text(m);

  it("Components V2, ohne Pings, unter dem Textlimit", () => {
    expect(m.flags).toBe(COMPONENTS_V2);
    expect(m.allowed_mentions).toEqual({ parse: [] });
    expect(t.length).toBeLessThanOrEqual(V2_TEXT_LIMIT);
    expect(t).toContain("## Wir suchen neue Teammitglieder!");
  });

  it("offene Stellen ausführlich, geschlossene nur in der Statusübersicht", () => {
    expect(t).toContain(POSITIONS.find((p) => p.slug === "support")!.description);
    expect(t).not.toContain(POSITIONS.find((p) => p.slug === "eventteam")!.description);
    expect(t).toMatch(/Eventteam: 🔴 Geschlossen/);
    expect(t).toMatch(/Support: 🟢 Offen/);
    expect(t).toContain("Mindestalter 18 Jahre");
  });

  it("versteckte Stellen tauchen nicht auf", () => {
    const hidden = buildJobsMessage(positions.map((p) => (p.slug === "media" ? { ...p, status: "HIDDEN" as const } : p)), opts);
    expect(v2Text(hidden)).not.toContain("Media");
  });

  it("Knöpfe: Portal + je offene Stelle, max. 5 pro Reihe, nur https", () => {
    const b = buttons(m);
    const open = positions.filter((p) => p.status === "OPEN").length;
    expect(b).toHaveLength(open + 1);
    expect(b[0].url).toBe("https://bewerbung.nordverkehr.xyz");
    expect(b.slice(1).every((x) => x.url.startsWith("https://bewerbung.nordverkehr.xyz/positionen/"))).toBe(true);
    const rows = JSON.parse(JSON.stringify(m.components))[0].components.filter((c: { type: number }) => c.type === 1);
    expect(rows.every((r: { components: unknown[] }) => r.components.length <= 5)).toBe(true);
    expect(buttons(buildJobsMessage(positions, { ...opts, appUrl: "http://localhost:3000" }))).toHaveLength(0);
  });

  it("Rolle wird erwähnt, wenn hinterlegt (ohne Ping)", () => {
    const withRole = buildJobsMessage(positions.map((p) => (p.slug === "support" ? { ...p, acceptRoleId: "123456789012345678" } : p)), opts);
    expect(v2Text(withRole)).toContain("<@&123456789012345678>");
  });

  it("keine offenen Stellen → freundlicher Hinweis", () => {
    const none = buildJobsMessage(positions.map((p) => ({ ...p, status: "CLOSED" as const })), opts);
    expect(v2Text(none)).toContain("alle Stellen besetzt");
  });
});

describe("Einzelaufruf pro Stelle", () => {
  const support = positions.find((p) => p.slug === "support")!;

  it("ein Block: Titel, Aufgaben + Voraussetzungen als Zitat, Interesse, Fußzeile", () => {
    const m = buildSpotlightMessage(support, opts);
    const t = v2Text(m);
    expect(m.flags).toBe(COMPONENTS_V2);
    expect(t).toContain("## Wir suchen **Support**!");
    expect(t).toContain("🔧 **Das solltest du mitbringen:**");
    for (const r of support.requirements) expect(t).toContain(`> ${r}`);
    expect(t).toContain("📩 **Interesse?**");
    expect(t).toContain("Nordverkehr Roleplay");
    // genau ein großer Textblock vor Knöpfen/Fußzeile
    const kids = JSON.parse(JSON.stringify(m.components))[0].components as { type: number }[];
    expect(kids[0].type).toBe(10);
    expect(kids.filter((k) => k.type === 10)).toHaveLength(2); // Inhalt + Fußzeile
  });

  it("Knopf direkt zur Bewerbung, Rolle als Erwähnung", () => {
    const m = buildSpotlightMessage({ ...support, acceptRoleId: "123456789012345678" }, opts);
    expect(v2Text(m)).toContain("## Wir suchen <@&123456789012345678>!");
    expect(buttons(m)[0].url).toBe("https://bewerbung.nordverkehr.xyz/positionen/support");
  });

  it("geschlossene Stelle: kein Bewerbungs-Knopf, Hinweis statt Aufruf", () => {
    const m = buildSpotlightMessage({ ...support, status: "CLOSED" }, opts);
    expect(buttons(m)).toHaveLength(0);
    expect(v2Text(m)).toContain("gerade geschlossen");
  });
});

describe("Gesamtaufruf als ein Block", () => {
  it("nur ein Inhalts-Textblock (wie ein Embed)", () => {
    const kids = JSON.parse(JSON.stringify(buildJobsMessage(positions, opts).components))[0].components as { type: number }[];
    expect(kids.filter((k) => k.type === 10)).toHaveLength(2); // Inhalt + Fußzeile
  });
});
