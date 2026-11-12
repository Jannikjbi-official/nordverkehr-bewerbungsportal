import { describe, expect, it } from "vitest";
import { DEFAULT_NIGHT_HELD, DELIVERY_KIND_KEYS, deliveryKind, isNight, nightEndsAt, nightHoldUntil, type NightSettings } from "@/lib/night";

const S = (over: Partial<NightSettings> = {}): NightSettings => ({
  "night.enabled": true,
  "night.start": "22:00",
  "night.end": "10:00",
  "night.aiReply": true,
  "night.held": [...DEFAULT_NIGHT_HELD],
  "night.portalNotice": true,
  ...over,
});

describe("Nachtruhe: Zeitfenster", () => {
  it("22–10 Uhr über Mitternacht, deutsche Zeit (Winter: UTC+1)", () => {
    expect(isNight(S(), new Date("2026-01-15T20:59:00Z"))).toBe(false); // 21:59
    expect(isNight(S(), new Date("2026-01-15T21:00:00Z"))).toBe(true); // 22:00
    expect(isNight(S(), new Date("2026-01-16T03:00:00Z"))).toBe(true); // 04:00
    expect(isNight(S(), new Date("2026-01-16T08:59:00Z"))).toBe(true); // 09:59
    expect(isNight(S(), new Date("2026-01-16T09:00:00Z"))).toBe(false); // 10:00
  });
  it("Sommerzeit (UTC+2)", () => {
    expect(isNight(S(), new Date("2026-07-15T20:00:00Z"))).toBe(true); // 22:00
    expect(isNight(S(), new Date("2026-07-15T08:00:00Z"))).toBe(false); // 10:00
  });
  it("Fenster ohne Mitternacht und ausgeschaltet", () => {
    expect(isNight(S({ "night.start": "01:00", "night.end": "06:00" }), new Date("2026-01-15T02:00:00Z"))).toBe(true); // 03:00
    expect(isNight(S({ "night.start": "01:00", "night.end": "06:00" }), new Date("2026-01-15T22:00:00Z"))).toBe(false); // 23:00
    expect(isNight(S({ "night.enabled": false }), new Date("2026-01-16T03:00:00Z"))).toBe(false);
    expect(isNight(S({ "night.start": "10:00", "night.end": "10:00" }), new Date("2026-01-16T03:00:00Z"))).toBe(false);
  });
  it("Ende der Nachtruhe: nächstes 10:00 deutscher Zeit", () => {
    expect(nightEndsAt(S(), new Date("2026-01-15T21:30:00Z")).toISOString()).toBe("2026-01-16T09:00:00.000Z"); // 22:30 → morgen 10:00 (Winter)
    expect(nightEndsAt(S(), new Date("2026-01-16T03:00:00Z")).toISOString()).toBe("2026-01-16T09:00:00.000Z"); // 04:00 → heute 10:00
    expect(nightEndsAt(S(), new Date("2026-07-15T21:00:00Z")).toISOString()).toBe("2026-07-16T08:00:00.000Z"); // Sommer
    // Nacht der Zeitumstellung (29.03.2026: 02:00 → 03:00)
    expect(nightEndsAt(S(), new Date("2026-03-28T22:00:00Z")).toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });
});

describe("Nachtruhe: was wartet", () => {
  const night = new Date("2026-01-16T01:00:00Z"); // 02:00
  const day = new Date("2026-01-16T12:00:00Z"); // 13:00
  const end = "2026-01-16T09:00:00.000Z";
  it("Standard: Wichtiges geht immer sofort (Bot-Log, Infos, Team-Nachrichten, neue Bewerbungen …)", () => {
    for (const purpose of ["team_message", "status", "reminder", "digest", "confirmation", "autoreply"]) {
      expect(nightHoldUntil({ type: "DM", purpose }, S(), night), purpose).toBeNull();
    }
    for (const kind of ["botlog", "applications", "threads", "summary", undefined]) {
      expect(nightHoldUntil({ type: "CHANNEL_MESSAGE", kind }, S(), night), String(kind)).toBeNull();
    }
  });
  it("Standard: nur Changelog, Entwurfs-Erinnerungen und Rundmails warten", () => {
    expect(nightHoldUntil({ type: "CHANNEL_MESSAGE", kind: "changelog" }, S(), night)?.toISOString()).toBe(end);
    expect(nightHoldUntil({ type: "DM", purpose: "draft_reminder" }, S(), night)?.toISOString()).toBe(end);
    expect(nightHoldUntil({ type: "DM", purpose: "notify" }, S(), night)?.toISOString()).toBe(end);
    expect(nightHoldUntil({ type: "DM", purpose: "notify" }, S(), day)).toBeNull();
  });
  it("Admin kann jede Art einzeln auf „warten“ stellen – Bestätigung, Auto-Antwort und Rollen nie", () => {
    const all = S({ "night.held": [...DELIVERY_KIND_KEYS] });
    expect(nightHoldUntil({ type: "DM", purpose: "team_message" }, all, night)?.toISOString()).toBe(end);
    expect(nightHoldUntil({ type: "CHANNEL_MESSAGE", kind: "botlog" }, all, night)?.toISOString()).toBe(end);
    expect(nightHoldUntil({ type: "DM", purpose: "confirmation" }, all, night)).toBeNull();
    expect(nightHoldUntil({ type: "DM", purpose: "autoreply" }, all, night)).toBeNull();
    expect(nightHoldUntil({ type: "ADD_ROLE" }, all, night)).toBeNull();
    expect(nightHoldUntil({ type: "DM", purpose: "reminder", ignoreNight: true }, all, night)).toBeNull();
  });
  it("Zuordnung der Arten", () => {
    expect(deliveryKind({ type: "DM", purpose: "reminder" })).toBe("interview_reminder");
    expect(deliveryKind({ type: "CHANNEL_MESSAGE" })).toBe("botlog");
    expect(deliveryKind({ type: "DM", purpose: "confirmation" })).toBeNull();
  });
});
