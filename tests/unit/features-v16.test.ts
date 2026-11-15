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

describe("Team-Jubiläen (#104)", async () => {
  const { anniversaryYears, anniversaryText } = await import("@/lib/team/anniversary");
  it("Jahrestag in deutscher Zeit", () => {
    expect(anniversaryYears(new Date("2025-11-15T10:00:00Z"), new Date("2026-11-15T09:00:00Z"))).toBe(1);
    expect(anniversaryYears(new Date("2024-11-15T10:00:00Z"), new Date("2026-11-15T09:00:00Z"))).toBe(2);
    expect(anniversaryYears(new Date("2025-11-14T23:30:00Z"), new Date("2026-11-15T09:00:00Z"))).toBe(1); // 00:30 am 15.11. (DE)
    expect(anniversaryYears(new Date("2025-11-16T10:00:00Z"), new Date("2026-11-15T09:00:00Z"))).toBe(0);
    expect(anniversaryYears(new Date("2026-11-15T08:00:00Z"), new Date("2026-11-15T09:00:00Z"))).toBe(0); // selber Tag, kein Jubiläum
  });
  it("29. Februar feiert in Nicht-Schaltjahren am 28.", () => {
    expect(anniversaryYears(new Date("2024-02-29T12:00:00Z"), new Date("2025-02-28T12:00:00Z"))).toBe(1);
    expect(anniversaryYears(new Date("2024-02-29T12:00:00Z"), new Date("2028-02-29T12:00:00Z"))).toBe(4);
  });
  it("Text", () => {
    expect(anniversaryText("seit {jahre}", 1)).toBe("seit einem Jahr");
    expect(anniversaryText("seit {jahre}", 3)).toBe("seit 3 Jahren");
  });
});

describe("Quiz: Fragenpool & Reihenfolge (#96)", async () => {
  const { personalizeQuiz, quizSeed } = await import("@/lib/applications/quiz-pool");
  type S = import("@/lib/applications/form").FormSectionDef;
  const q = (id: string, type: "QUIZ" | "TEXT" = "QUIZ") => ({ id, key: null, label: id, helpText: null, placeholder: null, type, required: true, minLength: null, maxLength: null, minValue: null, maxValue: null, options: type === "QUIZ" ? ["a", "b", "c", "d"] : [] });
  const sections = [
    { id: "s1", key: null, general: false, title: "Quiz", description: null, questions: [q("intro", "TEXT"), ...["q1", "q2", "q3", "q4", "q5", "q6"].map((x) => q(x))] },
  ] as unknown as S[];
  const ids = (s: S[]) => s.flatMap((x) => x.questions.map((y) => y.id));

  it("gleicher Schlüssel → gleiche Fragen, Reihenfolge und Antworten", () => {
    const a = personalizeQuiz(sections, quizSeed("u1", "p1", 0), 3);
    const b = personalizeQuiz(sections, quizSeed("u1", "p1", 0), 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("Pool: genau N Quizfragen, andere Fragen bleiben an ihrem Platz", () => {
    const a = personalizeQuiz(sections, quizSeed("u1", "p1", 0), 3);
    expect(ids(a)[0]).toBe("intro");
    expect(ids(a).filter((x) => x !== "intro")).toHaveLength(3);
  });
  it("ohne Pool alle Fragen, Antworten bleiben vollständig", () => {
    const a = personalizeQuiz(sections, quizSeed("u2", "p1", 0), null);
    expect(new Set(ids(a))).toEqual(new Set(ids(sections)));
    for (const x of a[0].questions.filter((y) => y.type === "QUIZ")) expect([...x.options].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("verschiedene Personen/Versuche → (fast immer) andere Reihenfolge", () => {
    const orders = new Set(["u1", "u2", "u3", "u4", "u5"].map((u) => ids(personalizeQuiz(sections, quizSeed(u, "p1", 0), null)).join()));
    expect(orders.size).toBeGreaterThan(1);
    expect(ids(personalizeQuiz(sections, quizSeed("u1", "p1", 1), 3)).join()).not.toBe(ids(personalizeQuiz(sections, quizSeed("u1", "p1", 0), 3)).join());
  });
  it("Pool größer als Fragenzahl → alle", () => {
    expect(ids(personalizeQuiz(sections, "x", 50))).toHaveLength(7);
  });
});

describe("Gespeicherte Ansichten (#93)", async () => {
  const { readViews, upsertView, MAX_VIEWS } = await import("@/lib/team/saved-views");
  it("liest nur gültige Einträge", () => {
    expect(readViews([{ name: "A", query: "x=1" }, { name: "", query: "" }, 5, null])).toEqual([{ name: "A", query: "x=1" }]);
    expect(readViews("kaputt")).toEqual([]);
  });
  it("gleicher Name ersetzt, höchstens MAX_VIEWS", () => {
    const v = upsertView([{ name: "Offen", query: "a" }], { name: "offen", query: "b" });
    expect(v).toEqual([{ name: "offen", query: "b" }]);
    let many = [] as { name: string; query: string }[];
    for (let i = 0; i < MAX_VIEWS + 3; i++) many = upsertView(many, { name: `v${i}`, query: "" });
    expect(many).toHaveLength(MAX_VIEWS);
    expect(many.at(-1)?.name).toBe(`v${MAX_VIEWS + 2}`);
  });
});

describe("Fehler-Alarm", async () => {
  const { isControlFlowError, cleanPath } = await import("@/lib/team/error-alert");
  it("Weiterleitung/404 zählen nicht", () => {
    expect(isControlFlowError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }))).toBe(true);
    expect(isControlFlowError(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBe(true);
    expect(isControlFlowError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
  it("Pfad ohne Query und ohne IDs", () => {
    expect(cleanPath("/team/bewerbungen/cmwh7dlai005bsc7d5stb03my?name=1")).toBe("/team/bewerbungen/…");
    expect(cleanPath("/dashboard#x")).toBe("/dashboard");
  });
});
