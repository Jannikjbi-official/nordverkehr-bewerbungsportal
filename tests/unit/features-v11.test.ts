import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { cleanScores, summarizeRatings } from "@/lib/team/ratings";
import { dueTransitions } from "@/lib/positions/schedule";
import { BOOK_LOCK_HOURS, canRebook, slotTimes } from "@/lib/team/slots";
import { claimCustomId, ephemeral, parseCustomId, verifyDiscordSignature } from "@/lib/discord/interactions";
import { onboardingItems, onboardingProgress, readOnboarding } from "@/lib/team/onboarding";
import { buildLogMessage, v2Text } from "@/lib/messages/embed";

describe("Bewertungsbogen", () => {
  it("übernimmt nur bekannte Kriterien mit 1–5 Punkten", () => {
    expect(cleanScores({ kommunikation: 4, erfahrung: 0, motivation: 6, zeit: 2.5, hacker: 5, teamfit: "5" })).toEqual({ kommunikation: 4 });
    expect(cleanScores(null)).toEqual({});
  });
  it("rechnet Schnitte pro Kriterium und insgesamt", () => {
    const s = summarizeRatings([{ scores: { kommunikation: 4, erfahrung: 2 } }, { scores: { kommunikation: 5 } }, { scores: {} }]);
    expect(s.raters).toBe(2);
    expect(s.perCriterion.kommunikation).toEqual({ avg: 4.5, count: 2 });
    expect(s.perCriterion.erfahrung).toEqual({ avg: 2, count: 1 });
    expect(s.perCriterion.zeit).toEqual({ avg: null, count: 0 });
    expect(s.overall).toBe(3.7);
    expect(summarizeRatings([]).overall).toBeNull();
  });
});

describe("Stellen automatisch öffnen & schließen", () => {
  const now = new Date("2026-11-20T00:05:00Z");
  const past = new Date("2026-11-19T23:00:00Z");
  const future = new Date("2026-11-25T00:00:00Z");
  it("öffnet geschlossene Stellen ab Startdatum und schließt offene ab Enddatum", () => {
    expect(
      dueTransitions(
        [
          { id: "a", status: "CLOSED", opensAt: past, closesAt: null },
          { id: "b", status: "OPEN", opensAt: null, closesAt: past },
          { id: "c", status: "OPEN", opensAt: null, closesAt: future },
          { id: "d", status: "CLOSED", opensAt: future, closesAt: null },
          { id: "e", status: "HIDDEN", opensAt: past, closesAt: null },
          { id: "f", status: "CLOSED", opensAt: past, closesAt: past },
        ],
        now,
      ),
    ).toEqual([
      { id: "a", to: "OPEN", reason: "opensAt" },
      { id: "b", to: "CLOSED", reason: "closesAt" },
    ]);
  });
});

describe("Gesprächstermine", () => {
  it("legt Termine am Stück an (mit Pause)", () => {
    const t = slotTimes(new Date("2026-11-20T18:00:00Z"), 3, 30, 10).map((d) => d.toISOString());
    expect(t).toEqual(["2026-11-20T18:00:00.000Z", "2026-11-20T18:40:00.000Z", "2026-11-20T19:20:00.000Z"]);
  });
  it("Umbuchen nur bis kurz vor dem Termin", () => {
    const now = new Date("2026-11-20T08:00:00Z");
    expect(canRebook(null, now)).toBe(true);
    expect(canRebook({ startsAt: new Date(now.getTime() + (BOOK_LOCK_HOURS + 1) * 3_600_000) }, now)).toBe(true);
    expect(canRebook({ startsAt: new Date(now.getTime() + 3_600_000) }, now)).toBe(false);
  });
});

describe("Discord-Knöpfe", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("hex");
  const body = JSON.stringify({ type: 1 });
  const ts = "1794443643";
  const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");

  it("prüft die Ed25519-Signatur von Discord", () => {
    expect(verifyDiscordSignature(rawPub, sig, ts, body)).toBe(true);
    expect(verifyDiscordSignature(rawPub, sig, ts, body + " ")).toBe(false);
    expect(verifyDiscordSignature(rawPub, sig, "1", body)).toBe(false);
    expect(verifyDiscordSignature(rawPub, null, ts, body)).toBe(false);
    expect(verifyDiscordSignature("kaputt", sig, ts, body)).toBe(false);
  });
  it("custom_id hin und zurück, fremde IDs werden ignoriert", () => {
    expect(parseCustomId(claimCustomId("cmwcj4q120024hxnktddvt999"))).toEqual({ kind: "claim", applicationId: "cmwcj4q120024hxnktddvt999" });
    expect(parseCustomId("nv:claim:../../x")).toBeNull();
    expect(parseCustomId("anderes")).toBeNull();
    expect(ephemeral("x").data.flags).toBe(64);
  });
  it("neue Bewerbung bekommt den Knopf nur, wenn eingeschaltet", () => {
    const base = { positionTitle: "Support", applicantDiscordId: "1", applicantName: "Jonas", applicantAvatarUrl: null, publicId: "NV-1", age: 20, teamUrl: "https://bewerbung.nordverkehr.xyz/team/bewerbungen/x", flags: [] };
    const withBtn = JSON.stringify(buildLogMessage({ ...base, claimCustomId: claimCustomId("abcdefghijkl") }));
    expect(withBtn).toContain('"custom_id":"nv:claim:abcdefghijkl"');
    expect(withBtn).toContain("Im Team-Bereich öffnen");
    expect(JSON.stringify(buildLogMessage(base))).not.toContain("custom_id");
    expect(v2Text(buildLogMessage(base))).toContain("Neue Bewerbung");
  });
});

describe("Einarbeitung", () => {
  it("liest Punkte aus den Einstellungen (ohne Leerzeilen/Doppelte)", () => {
    expect(onboardingItems("A\n\n B \nA\nC")).toEqual(["A", "B", "C"]);
  });
  it("Fortschritt und kaputte Daten", () => {
    const state = readOnboarding({ A: { at: "2026-11-12T10:00:00Z", by: "Jannik" }, B: "quatsch", C: null });
    expect(Object.keys(state)).toEqual(["A"]);
    expect(onboardingProgress(["A", "B"], state)).toEqual({ done: 1, total: 2, complete: false });
    expect(readOnboarding([])).toEqual({});
  });
});
