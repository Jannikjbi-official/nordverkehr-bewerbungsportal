import { describe, expect, it } from "vitest";
import { buildDailySummaryMessage, buildEscalationMessage, isQuiet, summaryStats, type DailySummary, type SummaryItem } from "@/lib/messages/summary";
import { COMPONENTS_V2, V2_TEXT_LIMIT, v2Text } from "@/lib/messages/embed";
import { endOfBerlinDay, lastTeamActivity } from "@/lib/team/daily-summary";

const URL = "https://bewerbung.nordverkehr.xyz";
const item = (n: number, extra: Partial<SummaryItem> = {}): SummaryItem => ({
  id: `app${n}xxxxxxxx`,
  publicId: `NV-2026-00${n}`,
  name: `Person ${n}`,
  position: "Leitstelle",
  claimer: null,
  at: new Date("2026-11-12T09:30:00Z"),
  ...extra,
});
const empty: DailySummary = {
  date: "2026-11-12",
  open: 0,
  newSince: 0,
  unclaimed: 0,
  dmProblems: 0,
  interviews: [],
  waiting: [],
  stale: [],
  withdrawals: [],
  probation: [],
  leftGuild: [],
  escalations: [],
  staleDays: 3,
  escalateDays: 7,
};

describe("Team-Übersicht", () => {
  it("ist ruhig, wenn nichts ansteht", () => {
    expect(isQuiet(empty)).toBe(true);
    expect(isQuiet({ ...empty, open: 4 })).toBe(true); // offene allein, die alle betreut + aktiv sind
    expect(isQuiet({ ...empty, newSince: 1 })).toBe(false);
    expect(isQuiet({ ...empty, waiting: [item(1)] })).toBe(false);
    expect(isQuiet({ ...empty, probation: [item(9)] })).toBe(false);
    expect(isQuiet({ ...empty, leftGuild: [item(8)] })).toBe(false);
  });

  it("baut eine V2-Nachricht mit allen Listen, Links und Betreuer", () => {
    const s: DailySummary = {
      ...empty,
      open: 5,
      newSince: 2,
      unclaimed: 1,
      dmProblems: 1,
      interviews: [item(1, { claimer: "Jannik" })],
      waiting: [item(2)],
      stale: [item(3, { claimer: "Max_*" })],
      withdrawals: [item(4)],
      probation: [item(5, { claimer: "Jannik" })],
      leftGuild: [item(6)],
    };
    const m = buildDailySummaryMessage(s, URL);
    expect(m.flags).toBe(COMPONENTS_V2);
    const t = v2Text(m);
    expect(t.length).toBeLessThan(V2_TEXT_LIMIT);
    expect(t).toContain("TEAM-ÜBERSICHT · DONNERSTAG, 12. NOVEMBER 2026");
    expect(t).toContain("Gespräche heute");
    expect(t).toContain("Wartet auf Antwort");
    expect(t).toContain("Seit 3+ Tagen nichts passiert");
    expect(t).toContain("Rückzug noch nicht bestätigt");
    expect(t).toContain("Probezeit endet bald");
    expect(t).toContain("Nicht mehr auf dem Discord");
    expect(t).toContain(`[**NV-2026-002**](${URL}/team/bewerbungen/app2xxxxxxxx)`);
    expect(t).toContain("📌 Jannik");
    expect(t).toContain("🙋 ohne Betreuer");
    expect(t).toContain("Max\\_\\*"); // Markdown im Namen entschärft
    expect(summaryStats(s)).toBe("📥 **5** offen · 🆕 **2** neu seit gestern · 🙋 **1** ohne Betreuer · ⚠️ **1** DM-Problem");
  });

  it("kürzt lange Listen und bleibt unter dem Discord-Limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => item(i, { name: "X".repeat(60) }));
    const m = buildDailySummaryMessage({ ...empty, open: 30, waiting: many, stale: many, interviews: many, withdrawals: many, probation: many, leftGuild: many }, URL);
    const t = v2Text(m);
    expect(t).toMatch(/… und 2\d weitere/);
    expect(t).not.toMatch(/\]\(https:[^)]*…/); // kein abgeschnittener Link
    expect(t.length).toBeLessThan(V2_TEXT_LIMIT);
  });

  it("meldet „alles erledigt“, wenn nichts ansteht (nur beim manuellen Posten)", () => {
    expect(v2Text(buildDailySummaryMessage(empty, URL))).toContain("Alles erledigt");
  });

  it("Hinweis an die Leitung nur bei Eskalationen", () => {
    expect(buildEscalationMessage(empty, URL)).toBeNull();
    const m = buildEscalationMessage({ ...empty, escalations: [item(1), item(2)] }, URL)!;
    const t = v2Text(m);
    expect(t).toContain("2 Bewerbungen seit über 7 Tagen ohne Reaktion");
    expect(t).toContain("HINWEIS FÜR DIE LEITUNG");
  });
});

describe("Zeit-Helfer", () => {
  it("Ende des Tages in deutscher Zeit (Winter, UTC+1)", () => {
    expect(endOfBerlinDay(new Date("2026-11-12T07:00:00Z")).toISOString()).toBe("2026-11-12T23:00:00.000Z");
  });
  it("Ende des Tages in deutscher Zeit (Sommer, UTC+2)", () => {
    expect(endOfBerlinDay(new Date("2026-07-01T06:00:00Z")).toISOString()).toBe("2026-07-01T22:00:00.000Z");
  });
  it("letzte Team-Aktivität = jüngstes Ereignis", () => {
    const d = (s: string) => new Date(s);
    expect(
      lastTeamActivity({
        submittedAt: d("2026-11-01T10:00:00Z"),
        createdAt: d("2026-10-30T10:00:00Z"),
        statusChanges: [{ createdAt: d("2026-11-03T10:00:00Z") }],
        comments: [{ createdAt: d("2026-11-05T10:00:00Z") }],
        teamMessages: [],
      }).toISOString(),
    ).toBe("2026-11-05T10:00:00.000Z");
  });
});
