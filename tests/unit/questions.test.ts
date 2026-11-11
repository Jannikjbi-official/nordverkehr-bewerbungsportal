import { describe, expect, it } from "vitest";
import { assembleForm, duplicateCheck, type RawSection } from "@/lib/applications/assemble";
import { KEY_PATTERN, findSimilarQuestions, similarity, suggestKey } from "@/lib/applications/similarity";
import { generalComplete, mergeProfile, prefillFromProfile, profileAnswersFrom } from "@/lib/applications/profile";
import { GENERAL_SECTIONS, POSITIONS, type SeedSection } from "@/lib/setup/seed-data";
import { LEGACY_LABELS, normalizeLabel } from "@/lib/setup/questions";
import type { FormQuestion } from "@/lib/applications/form";

let n = 0;
function raw(s: SeedSection, positionId: string | null, sortOrder: number, idPrefix = "x"): RawSection {
  return {
    id: `${idPrefix}-${s.key}-${n++}`,
    key: s.key,
    title: s.title,
    description: s.description ?? null,
    positionId,
    sortOrder,
    questions: s.questions.map((q, i) => ({
      id: `${idPrefix}-${q.key}-${n++}`,
      key: q.key,
      label: q.label,
      helpText: q.helpText ?? null,
      placeholder: q.placeholder ?? null,
      type: q.type,
      required: q.required ?? true,
      minLength: q.minLength ?? null,
      maxLength: q.maxLength ?? null,
      minValue: q.minValue ?? null,
      maxValue: q.maxValue ?? null,
      options: q.options ?? [],
      sortOrder: i,
    })),
  };
}

const general = () => GENERAL_SECTIONS.map((s, i) => raw(s, null, i, "g"));

describe("Seed-Fragen: eindeutige Struktur", () => {
  const all = [...GENERAL_SECTIONS, ...POSITIONS.flatMap((p) => p.sections)];

  it("jede Frage und jeder Abschnitt hat einen gültigen, eindeutigen Key", () => {
    const qKeys = all.flatMap((s) => s.questions.map((q) => q.key));
    const sKeys = all.map((s) => s.key);
    for (const k of [...qKeys, ...sKeys]) expect(k, k).toMatch(KEY_PATTERN);
    expect(new Set(qKeys).size).toBe(qKeys.length);
    expect(new Set(sKeys).size).toBe(sKeys.length);
  });

  it("positionsspezifische Keys tragen den Slug als Präfix", () => {
    for (const p of POSITIONS) for (const s of p.sections) for (const q of s.questions) expect(q.key.startsWith(`${p.slug}.`), q.key).toBe(true);
  });

  it("keine Fachfrage ähnelt einer allgemeinen Frage", () => {
    const existing = GENERAL_SECTIONS.flatMap((s) => s.questions.map((q) => ({ id: q.key, key: q.key, label: q.label, where: s.title })));
    for (const p of POSITIONS)
      for (const s of p.sections)
        for (const q of s.questions) expect(findSimilarQuestions({ id: q.key, key: q.key, label: q.label }, existing), `${p.slug}: ${q.label}`).toEqual([]);
  });

  it("Legacy-Texte zeigen auf existierende Keys", () => {
    const keys = new Set(all.flatMap((s) => s.questions.map((q) => q.key)));
    for (const [label, key] of Object.entries(LEGACY_LABELS)) {
      expect(label).toBe(normalizeLabel(label));
      if (!["callname", "eventteam.experience"].includes(key)) expect(keys.has(key), key).toBe(true);
    }
  });

  it.each(POSITIONS.map((p) => [p.slug, p] as const))("%s: kein Abschnitt heißt wie die Position, kein doppelter Fragetext", (_slug, p) => {
    const form = assembleForm([...general(), ...p.sections.map((s, i) => raw(s, p.slug, 100 + i))], p);
    expect(form.map((s) => s.title.toLowerCase())).not.toContain(p.title.toLowerCase());
    expect(duplicateCheck(form)).toEqual({ duplicateKeys: [], duplicateLabels: [] });
    expect(form.filter((s) => s.general).map((s) => s.key)).toEqual(GENERAL_SECTIONS.map((s) => s.key));
  });
});

describe("assembleForm", () => {
  const support = POSITIONS.find((p) => p.slug === "support")!;

  it("entfernt doppelt angelegte allgemeine Abschnitte (alter Race-Bug)", () => {
    const doubled = [...general(), ...general(), ...support.sections.map((s, i) => raw(s, "p", 100 + i))];
    const form = assembleForm(doubled, support);
    expect(duplicateCheck(form)).toEqual({ duplicateKeys: [], duplicateLabels: [] });
    expect(form).toHaveLength(GENERAL_SECTIONS.length + support.sections.length);
  });

  it("entfernt Fragen ohne Key mit gleichem Text und leere Abschnitte", () => {
    const g = general();
    const copy: RawSection = {
      ...g[0],
      id: "legacy",
      key: null,
      positionId: "p",
      sortOrder: 100,
      questions: g[0].questions.map((q) => ({ ...q, id: q.id + "-copy", key: null, label: q.label.toUpperCase() + " " })),
    };
    const form = assembleForm([...g, copy], support);
    expect(form.find((s) => s.id === "legacy")).toBeUndefined();
  });

  it("benennt einen Abschnitt mit Positionsnamen in „Fachfragen“ um", () => {
    const s = raw({ ...support.sections[0], title: "Support" }, "p", 100);
    const form = assembleForm([...general(), s], support);
    expect(form.at(-1)!.title).toBe("Fachfragen");
    expect(form.at(-1)!.general).toBe(false);
  });

  it("allgemeine Abschnitte stehen immer vorne", () => {
    const form = assembleForm([...support.sections.map((s, i) => raw(s, "p", -5 + i)), ...general()], support);
    const firstSpecific = form.findIndex((s) => !s.general);
    expect(form.slice(firstSpecific).every((s) => !s.general)).toBe(true);
  });
});

describe("Ähnlichkeit (Builder-Warnung)", () => {
  const existing = [
    { id: "1", key: "about_me", label: "Erzähl uns etwas über dich.", where: "Allgemein › Über dich" },
    { id: "2", key: "scenario_insult", label: "Jemand beleidigt dich – im Ticket, im Voice oder ingame. Wie reagierst du?", where: "Allgemein › Szenarien" },
  ];
  it("erkennt gleichen Key", () => {
    expect(findSimilarQuestions({ key: "about_me", label: "Ganz was anderes hier" }, existing)[0]).toMatchObject({ id: "1", reason: "key" });
  });
  it("erkennt umformulierten Text", () => {
    const hits = findSimilarQuestions({ label: "Wie reagierst du, wenn dich jemand im Voice beleidigt?" }, existing);
    expect(hits[0]?.id).toBe("2");
  });
  it("ignoriert die Frage selbst und unähnliche Texte", () => {
    expect(findSimilarQuestions({ id: "1", key: "about_me", label: "Erzähl uns etwas über dich." }, existing)).toEqual([]);
    expect(findSimilarQuestions({ label: "Welche Mapping-Tools nutzt du?" }, existing)).toEqual([]);
  });
  it("similarity ist symmetrisch genug und 1 bei gleichem Text", () => {
    expect(similarity("Was motiviert dich?", "Was motiviert dich?")).toBe(1);
  });
  it("suggestKey erzeugt gültige Keys", () => {
    expect(suggestKey("Wie viele Tickets hast du schon bearbeitet?", "support")).toMatch(KEY_PATTERN);
    expect(suggestKey("???", null)).toBe("frage");
  });
});

describe("Bewerberprofil (allgemeine Antworten wiederverwenden)", () => {
  const support = POSITIONS.find((p) => p.slug === "support")!;
  const media = POSITIONS.find((p) => p.slug === "media")!;
  const formA = assembleForm([...general(), ...support.sections.map((s, i) => raw(s, "a", 100 + i))], support);
  // zweites Formular mit anderen IDs (andere Position, gleiche Keys)
  const formB = assembleForm([...GENERAL_SECTIONS.map((s, i) => raw(s, null, i, "b")), ...media.sections.map((s, i) => raw(s, "b", 100 + i))], media);

  const fill = (q: FormQuestion) =>
    q.type === "NUMBER" ? Math.max(q.minValue ?? 1, 10)
    : q.type === "SELECT" ? q.options[0]
    : q.type === "MULTI_SELECT" ? [q.options[0]]
    : q.type === "CHECKBOX" ? true
    : q.type === "URL" ? "https://example.com"
    : q.type === "FILE" ? []
    : "x".repeat(Math.max(q.minLength ?? 0, 5));

  const answersA = Object.fromEntries(formA.flatMap((s) => s.questions.map((q) => [q.id, fill(q)])));

  it("speichert nur allgemeine Antworten, per Key", () => {
    const profile = profileAnswersFrom(formA, answersA);
    const generalKeys = GENERAL_SECTIONS.flatMap((s) => s.questions.filter((q) => q.type !== "FILE").map((q) => q.key));
    expect(Object.keys(profile).sort()).toEqual(generalKeys.sort());
  });

  it("füllt eine Bewerbung auf eine andere Position vor – Fachfragen bleiben leer", () => {
    const profile = profileAnswersFrom(formA, answersA);
    const { data, prefilled } = prefillFromProfile(formB, {}, profile);
    expect(generalComplete(formB, data)).toBe(true);
    const specificIds = formB.filter((s) => !s.general).flatMap((s) => s.questions.map((q) => q.id));
    for (const id of specificIds) expect(data[id]).toBeUndefined();
    expect(prefilled.length).toBeGreaterThan(0);
  });

  it("überschreibt keine Antworten aus dem Entwurf und überspringt ungültige Werte", () => {
    const generalQs = formB.filter((s) => s.general).flatMap((s) => s.questions);
    const first = generalQs.find((q) => ["SHORT_TEXT", "LONG_TEXT", "SCENARIO"].includes(q.type))!;
    const select = generalQs.find((q) => q.type === "SELECT");
    const profile = { ...profileAnswersFrom(formA, answersA), ...(select ? { [select.key!]: "Gibt es nicht mehr" } : {}) };
    const { data } = prefillFromProfile(formB, { [first.id]: "eigener Entwurf" }, profile);
    expect(data[first.id]).toBe("eigener Entwurf");
    if (select) expect(data[select.id]).toBeUndefined();
  });

  it("mergeProfile ersetzt geleerte Antworten und behält fremde Keys", () => {
    const q = formA[0].questions[0];
    const merged = mergeProfile(formA, { [q.key!]: "alt", fremd: "bleibt" }, { ...answersA, [q.id]: "" });
    expect(merged[q.key!]).toBeUndefined();
    expect(merged.fremd).toBe("bleibt");
  });
});
