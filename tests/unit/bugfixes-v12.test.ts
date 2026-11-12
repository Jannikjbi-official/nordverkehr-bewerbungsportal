import { describe, expect, it } from "vitest";
import { clearStaleSchedule, dueTransitions } from "@/lib/positions/schedule";
import { berlinHour, isScheduledHour } from "@/lib/cron";

describe("Stelle: Datumsregeln nach manuellem Statuswechsel", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const past = new Date("2026-11-19T00:00:00Z");
  const future = new Date("2026-11-25T00:00:00Z");

  it("manuell geöffnet: Startdatum weg, abgelaufenes Enddatum weg, künftiges bleibt", () => {
    expect(clearStaleSchedule("OPEN", { opensAt: future, closesAt: past }, now)).toEqual({ opensAt: null, closesAt: null });
    expect(clearStaleSchedule("OPEN", { opensAt: null, closesAt: future }, now)).toEqual({});
  });

  it("manuell geschlossen: Enddatum weg, erreichtes Startdatum weg, künftiges bleibt", () => {
    expect(clearStaleSchedule("CLOSED", { opensAt: future, closesAt: future }, now)).toEqual({ closesAt: null });
    expect(clearStaleSchedule("CLOSED", { opensAt: past, closesAt: null }, now)).toEqual({ opensAt: null });
  });

  it("nach dem Aufräumen löst der Cron keine Umschaltung mehr aus", () => {
    const pos = { id: "a", status: "OPEN" as const, opensAt: future, closesAt: past };
    const fixed = { ...pos, ...clearStaleSchedule("OPEN", pos, now) };
    expect(dueTransitions([fixed], now)).toEqual([]);
  });

  it("versteckt: nichts ändern", () => {
    expect(clearStaleSchedule("HIDDEN", { opensAt: past, closesAt: past }, now)).toEqual({});
  });
});

describe("Crons zur deutschen Uhrzeit (Sommer-/Winterzeit)", () => {
  const cron = (ua = "vercel-cron/1.0") => new Request("https://x.test/api/cron/outbox", { headers: { "user-agent": ua } });

  it("rechnet die deutsche Stunde", () => {
    expect(berlinHour(new Date("2026-01-15T23:00:00Z"))).toBe(0); // Winter: UTC+1
    expect(berlinHour(new Date("2026-07-15T22:00:00Z"))).toBe(0); // Sommer: UTC+2
    expect(berlinHour(new Date("2026-07-15T23:00:00Z"))).toBe(1);
  });

  it("nur der passende Zwillings-Lauf arbeitet", () => {
    // Winter: 23 UTC ist 0 Uhr, 22 UTC ist 23 Uhr
    expect(isScheduledHour(cron(), 0, new Date("2026-01-15T23:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 0, new Date("2026-01-15T22:00:00Z"))).toBe(false);
    // Sommer: 22 UTC ist 0 Uhr, 23 UTC ist 1 Uhr
    expect(isScheduledHour(cron(), 0, new Date("2026-07-15T22:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 0, new Date("2026-07-15T23:00:00Z"))).toBe(false);
    // Team-Übersicht 8 Uhr
    expect(isScheduledHour(cron(), 8, new Date("2026-01-15T07:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 8, new Date("2026-07-15T06:00:00Z"))).toBe(true);
    expect(isScheduledHour(cron(), 8, new Date("2026-07-15T07:00:00Z"))).toBe(false);
  });

  it("Aufrufe ohne Vercel-Cron (externer Scheduler, von Hand) laufen immer", () => {
    expect(isScheduledHour(cron("curl/8.0"), 0, new Date("2026-07-15T12:00:00Z"))).toBe(true);
  });
});
