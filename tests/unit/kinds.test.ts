import { describe, expect, it } from "vitest";
import { KINDS, kindOf } from "@/lib/kinds";
import { confirmationsFor, confirmationsSchemaFor } from "@/lib/applications/form";
import { allowedTeamTargets, canTeamTransition, statusHintFor, timelineFor } from "@/lib/applications/status";
import { buildLogMessage } from "@/lib/messages/embed";
import { buildSpotlightMessage } from "@/lib/messages/jobs";
import { KIND_SEEDS } from "@/lib/setup/kinds-seed";
import { TEAM_ONLY_TEMPLATE_TITLES, TEMPLATES } from "@/lib/setup/seed-data";

describe("Bewerbungsarten", () => {
  it("unbekannte Art → Team", () => {
    expect(kindOf(undefined).key).toBe("team");
    expect(kindOf("gibtsnicht").key).toBe("team");
    expect(kindOf("beta").interview).toBe(false);
  });
  it("Bestätigungen je Art", () => {
    expect(confirmationsFor("team").map((c) => c.key)).toEqual(["voice", "rules", "unpaid", "truth", "privacy"]);
    expect(confirmationsFor("whitelist").map((c) => c.key)).not.toContain("unpaid");
    expect(confirmationsFor("beta").map((c) => c.key)).toContain("betaTest");
    expect(confirmationsFor("whitelist")[0].label).toContain("Whitelist-Gespräch");
    const beta = confirmationsSchemaFor("beta");
    expect(beta.safeParse({ voice: true, rules: true, betaTest: true, truth: true, privacy: true }).success).toBe(true);
    expect(beta.safeParse({ voice: true, rules: true, truth: true, privacy: true }).success).toBe(false);
    expect(confirmationsSchemaFor("whitelist").safeParse({ voice: true, rules: true, truth: true, privacy: true }).success).toBe(true);
  });
  it("Beta ohne Gespräch", () => {
    expect(allowedTeamTargets("SUBMITTED", { interview: false })).not.toContain("INTERVIEW");
    expect(allowedTeamTargets("SUBMITTED")).toContain("INTERVIEW");
    expect(canTeamTransition("IN_REVIEW", "INTERVIEW", { interview: false })).toBe(false);
    expect(canTeamTransition("IN_REVIEW", "ACCEPTED", { interview: false })).toBe(true);
    // Altfall: steht schon im Gespräch → darf weiter
    expect(canTeamTransition("INTERVIEW", "ACCEPTED", { interview: false })).toBe(true);
    expect(timelineFor(false)).toEqual(["SUBMITTED", "IN_REVIEW", "ACCEPTED"]);
    expect(timelineFor(true)).toContain("INTERVIEW");
  });
  it("Hinweis nach Annahme je Art", () => {
    expect(statusHintFor("ACCEPTED", KINDS.team)).toContain("Team");
    expect(statusHintFor("ACCEPTED", KINDS.whitelist)).toContain("gewhitelistet");
    expect(statusHintFor("IN_REVIEW", KINDS.beta)).toBe(statusHintFor("IN_REVIEW", KINDS.team));
  });
  it("Bewerbungs-Post: Beta ohne „Zum Gespräch“", () => {
    const base = { positionTitle: "Beta-Test", applicantDiscordId: "1", applicantName: "A", publicId: "NV-1", age: 20, teamUrl: "https://x/y", flags: [], claimCustomId: "nv:claim:abcdefghij12" };
    expect(JSON.stringify(buildLogMessage({ ...base, interview: false }))).not.toContain("nv:status:INTERVIEW");
    expect(JSON.stringify(buildLogMessage(base))).toContain("nv:status:INTERVIEW");
  });
  it("Einzelaufruf: eigene Texte für Whitelist", () => {
    const p = { slug: "whitelist", title: "Whitelist", tagline: "t", description: "d", icon: "id", status: "OPEN" as const, tasks: ["a"], requirements: [], minAge: null, acceptRoleId: null, type: { key: "whitelist" } };
    const json = JSON.stringify(buildSpotlightMessage(p, { appUrl: "https://portal.example", defaultMinAge: 16 }));
    expect(json).toContain("Die Whitelist ist offen!");
    expect(json).toContain("So läuft");
    expect(json).toContain("Jetzt zur Whitelist bewerben");
  });
  it("Startinhalte: eindeutige Keys, Quiz mit Lösung", () => {
    const keys = KIND_SEEDS.flatMap((k) => k.position.sections.flatMap((s) => [s.key, ...s.questions.map((q) => q.key)]));
    expect(new Set(keys).size).toBe(keys.length);
    for (const q of KIND_SEEDS.flatMap((k) => k.position.sections.flatMap((s) => s.questions)).filter((q) => q.type === "QUIZ")) {
      expect(q.options).toContain(q.correctOption);
    }
  });
  it("Bausteine: jede Art hat in jeder Kategorie mindestens einen", () => {
    const categories = ["EINGANG", "RUECKFRAGE", "EINLADUNG", "ANNAHME", "ABLEHNUNG", "ERINNERUNG", "SONSTIGES"];
    const all = [
      ...TEMPLATES.map((t) => ({ category: t.category, title: t.title, kinds: TEAM_ONLY_TEMPLATE_TITLES.includes(t.title) ? ["team"] : [] })),
      ...KIND_SEEDS.flatMap((k) => k.templates.map((t) => ({ category: t.category, title: t.title, kinds: [k.type.key] }))),
    ];
    for (const kind of ["team", "whitelist", "beta"]) {
      for (const c of categories) {
        const own = all.filter((t) => t.category === c && t.kinds.includes(kind));
        expect(own.length, `${kind} / ${c}`).toBeGreaterThan(0);
      }
    }
    const titles = all.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
