import { describe, expect, it } from "vitest";
import { canAmend, formatDays, queueText } from "@/lib/applications/queue";
import { pickAssignee } from "@/lib/team/assign";
import { buildIcs, fold, isTokenShaped, newCalendarToken } from "@/lib/team/calendar";
import { canSeePosition } from "@/lib/team/visibility";
import { followUpReminderText } from "@/lib/applications/followup";
import { topError } from "@/lib/team/alerts";
import { buildWeeklyMessage, isMondayBerlin } from "@/lib/team/weekly-report";
import { acceptRuleText } from "@/lib/team/service";
import { v2Text } from "@/lib/messages/embed";
import { backupSchema } from "@/lib/admin/config-backup";

describe("Warteschlange (#7)", () => {
  it("Platz und Bearbeitungszeit in Klartext", () => {
    const t = queueText({ place: 4, total: 9, firstReviewDays: 1.6, decisionDays: 5.2 }, "SUBMITTED", "Support");
    expect(t).toBe("Du bist Nr. 4 von 9 offenen Bewerbungen für Support. Bis zur ersten Sichtung dauert es gerade etwa 2 Tage. Bis zur Entscheidung im Schnitt etwa 5 Tage.");
    expect(queueText({ place: 1, total: 3, firstReviewDays: null, decisionDays: null }, "IN_REVIEW", "Support")).toBe("Das Team liest deine Bewerbung gerade (3 offene Bewerbungen für Support).");
    expect(formatDays(0.4)).toBe("weniger als einen Tag");
    expect(formatDays(1.2)).toBe("etwa einen Tag");
  });
});

describe("Nachreichen (#6)", () => {
  it("nur eingereicht, nicht übernommen, nicht gesichtet", () => {
    expect(canAmend({ status: "SUBMITTED", claimedById: null, firstReviewedAt: null })).toBe(true);
    expect(canAmend({ status: "SUBMITTED", claimedById: "u1", firstReviewedAt: null })).toBe(false);
    expect(canAmend({ status: "IN_REVIEW", claimedById: null, firstReviewedAt: new Date() })).toBe(false);
  });
});

describe("Faire Verteilung (#4)", () => {
  it("wenigste offene, bei Gleichstand am längsten nichts bekommen", () => {
    expect(pickAssignee([{ id: "a", open: 3, lastAssignedAt: null }, { id: "b", open: 1, lastAssignedAt: new Date() }])).toBe("b");
    expect(pickAssignee([{ id: "a", open: 1, lastAssignedAt: new Date("2026-11-10") }, { id: "b", open: 1, lastAssignedAt: new Date("2026-11-01") }])).toBe("b");
    expect(pickAssignee([{ id: "a", open: 1, lastAssignedAt: new Date("2026-11-10") }, { id: "c", open: 1, lastAssignedAt: null }])).toBe("c");
    expect(pickAssignee([])).toBeNull();
  });
});

describe("Kalender-Abo (#2)", () => {
  it("gültiges iCalendar, Sonderzeichen entschärft, lange Zeilen gefaltet", () => {
    const ics = buildIcs(
      [{ uid: "a1", start: new Date("2026-11-20T18:00:00Z"), end: new Date("2026-11-20T18:30:00Z"), summary: "Gespräch Support (NV-1), Test; x", description: "Zeile 1\nZeile 2 ".repeat(10), url: "https://x.test/a" }],
      new Date("2026-11-12T00:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261120T180000Z");
    expect(ics).toContain("SUMMARY:Gespräch Support (NV-1)\\, Test\; x");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
  it("Schlüssel sind lang und zufällig", () => {
    const a = newCalendarToken();
    expect(isTokenShaped(a)).toBe(true);
    expect(a).not.toBe(newCalendarToken());
    expect(isTokenShaped("../../etc")).toBe(false);
  });
});

describe("Zuständigkeit pro Stelle (#5)", () => {
  it("ohne Rollen: alle; mit Rollen: nur passende, Admins immer", () => {
    expect(canSeePosition({ isAdmin: false, roleIds: [] }, { teamRoleIds: [] })).toBe(true);
    expect(canSeePosition({ isAdmin: false, roleIds: ["1"] }, { teamRoleIds: ["2"] })).toBe(false);
    expect(canSeePosition({ isAdmin: false, roleIds: ["1", "2"] }, { teamRoleIds: ["2"] })).toBe(true);
    expect(canSeePosition({ isAdmin: true, roleIds: [] }, { teamRoleIds: ["2"] })).toBe(true);
  });
});

describe("Vier-Augen-Prinzip (#3)", () => {
  it("Regeltext", () => {
    expect(acceptRuleText({ minProVotes: null, requireAdminApproval: false })).toBeNull();
    expect(acceptRuleText({ minProVotes: 2, requireAdminApproval: true })).toBe("Annahme nur mit mindestens 2 Pro-Stimmen und Freigabe durch einen Admin.");
    expect(acceptRuleText({ minProVotes: 1, requireAdminApproval: false })).toBe("Annahme nur mit mindestens 1 Pro-Stimme.");
  });
});

describe("Rückfrage mit Frist (#1), Alarm (#10), Wochenbericht (#11)", () => {
  it("Erinnerungstext nennt Stelle und Frist", () => {
    const t = followUpReminderText("Anna", "Support", 4);
    expect(t).toContain("**Support**");
    expect(t).toContain("nächsten 4 Tagen");
  });
  it("häufigster Fehler", () => {
    expect(topError(["DM geschlossen", "Timeout", "DM geschlossen", null])).toBe("DM geschlossen");
    expect(topError([])).toBeNull();
  });
  it("Montag in deutscher Zeit", () => {
    expect(isMondayBerlin(new Date("2026-11-16T07:00:00Z"))).toBe(true); // Mo 08:00
    expect(isMondayBerlin(new Date("2026-11-15T23:30:00Z"))).toBe(true); // Mo 00:30 (UTC noch Sonntag)
    expect(isMondayBerlin(new Date("2026-11-17T07:00:00Z"))).toBe(false);
  });
  it("Wochenbericht mit Quote, Zeit und Absagegründen", () => {
    const t = v2Text(
      buildWeeklyMessage(
        { from: new Date("2026-11-09T07:00:00Z"), to: new Date("2026-11-16T07:00:00Z"), submitted: 12, accepted: 3, rejected: 5, withdrawn: 1, avgDecisionDays: 4.25, open: 9, unclaimed: 2, topRejections: [{ label: "Zu wenig Erfahrung", count: 3 }], feedbackAvg: 4.5, feedbackCount: 4 },
        "https://x.test",
      ),
    );
    expect(t).toContain("**12** neue Bewerbungen");
    expect(t).toContain("Annahmequote **38 %**");
    expect(t).toContain("4,3 Tage");
    expect(t).toContain("Zu wenig Erfahrung: 3");
  });
});

describe("Einstellungen sichern (#12)", () => {
  it("lehnt fremde Dateien ab", () => {
    expect(backupSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(backupSchema.safeParse({ version: 1, exportedAt: "x", settings: {}, positions: [], sections: [], templates: [] }).success).toBe(true);
  });
});

import { POSITION_QUIZ } from "@/lib/setup/quiz-questions";
import { POSITION_SECTIONS } from "@/lib/setup/questions";
import { isPublished } from "@/lib/changelog";
import { claimNoticeText } from "@/lib/team/claim-notice";

describe("Regel-Quiz pro Stelle", () => {
  it("jede Stelle hat ein Quiz mit sechs gültigen Fragen", () => {
    for (const slug of Object.keys(POSITION_SECTIONS)) {
      const q = POSITION_QUIZ[slug];
      expect(q, slug).toBeDefined();
      expect(q.key).toBe(`${slug}.quiz`);
      expect(q.questions).toHaveLength(6);
      for (const x of q.questions) {
        expect(x.type).toBe("QUIZ");
        expect(x.options, x.key).toHaveLength(4);
        expect(x.options!.filter((o) => o === x.correctOption), x.key).toHaveLength(1);
        expect(new Set(x.options).size).toBe(4);
        expect(x.key.startsWith(`${slug}.`)).toBe(true);
      }
    }
  });
  it("Keys sind eindeutig und die richtige Antwort steht nicht immer an derselben Stelle", () => {
    const all = Object.values(POSITION_QUIZ).flatMap((s) => s.questions);
    expect(new Set(all.map((q) => q.key)).size).toBe(all.length);
    const positions = new Set(all.map((q) => q.options!.indexOf(q.correctOption!)));
    expect(positions.size).toBeGreaterThan(2);
  });
});

describe("Changelog veröffentlichen", () => {
  const e = { date: "2026-11-12" };
  it("Standard 00:00: erst nach Ende des Tages", () => {
    expect(isPublished(e, new Date("2026-11-12T20:00:00Z"))).toBe(false); // 21:00 am selben Tag
    expect(isPublished(e, new Date("2026-11-12T23:01:00Z"))).toBe(true); // 00:01 am Folgetag
  });
  it("Uhrzeit am selben Tag", () => {
    const rule = { time: "20:00", through: "" };
    expect(isPublished(e, new Date("2026-11-12T18:59:00Z"), rule)).toBe(false); // 19:59
    expect(isPublished(e, new Date("2026-11-12T19:00:00Z"), rule)).toBe(true); // 20:00
    expect(isPublished({ date: "2026-11-13" }, new Date("2026-11-12T22:00:00Z"), rule)).toBe(false); // Zukunft
  });
  it("„Jetzt veröffentlichen“ gilt bis einschließlich dem Tag", () => {
    const rule = { time: "00:00", through: "2026-11-12" };
    expect(isPublished(e, new Date("2026-11-12T08:00:00Z"), rule)).toBe(true);
    expect(isPublished({ date: "2026-11-13" }, new Date("2026-11-13T08:00:00Z"), rule)).toBe(false);
  });
});

describe("Claim-Nachricht an den Bewerber", () => {
  it("nennt Betreuer, Stelle und ID", () => {
    const t = claimNoticeText("Anna", "Support", "NV-2026-0001", "Jonas", false);
    expect(t).toContain("**Jonas**");
    expect(t).toContain("**Support** (NV-2026-0001)");
    expect(claimNoticeText("Anna", "Support", null, "Lea", true)).toContain("ab sofort kümmert sich **Lea**");
  });
});

describe("ICS-Zeilenfaltung (RFC 5545)", () => {
  it("höchstens 75 Bytes pro Zeile, Umlaute/Emoji bleiben ganz", () => {
    const line = "DESCRIPTION:" + "Ä😀ö".repeat(40);
    const parts = fold(line).split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });
  it("kurze Zeilen bleiben unverändert", () => expect(fold("SUMMARY:Gespräch")).toBe("SUMMARY:Gespräch"));
});
