import { describe, expect, it } from "vitest";
import { suggestionSchema, notifyText, STATUSES, STATUS_LABEL, KIND_LABEL } from "@/lib/suggestions";

describe("Ideen & Fehler", () => {
  it("Eingaben prüfen", () => {
    expect(suggestionSchema.safeParse({ kind: "IDEA", title: "Dunkles Design", body: "Bitte ein dunkles Design für alles." }).success).toBe(true);
    expect(suggestionSchema.safeParse({ kind: "IDEA", title: "abc", body: "Bitte ein dunkles Design." }).success).toBe(false);
    expect(suggestionSchema.safeParse({ kind: "BUG", title: "Upload hängt", body: "kurz" }).success).toBe(false);
    expect(suggestionSchema.safeParse({ kind: "SPAM", title: "Upload hängt", body: "Upload hängt bei 99 %" }).success).toBe(false);
    const p = suggestionSchema.parse({ kind: "BUG", title: "  Upload hängt ", body: "Upload hängt bei 99 %", location: "" });
    expect(p.title).toBe("Upload hängt");
    expect(p.location).toBeUndefined();
  });
  it("Alle Status und Arten haben Beschriftungen", () => {
    for (const s of STATUSES) expect(STATUS_LABEL[s]).toBeTruthy();
    expect(Object.keys(KIND_LABEL)).toEqual(["IDEA", "FEEDBACK", "BUG"]);
  });
  it("DM-Text je Status", () => {
    expect(notifyText("Anna", "BUG", "Upload hängt", "DONE", null)).toContain("Fehler ist behoben");
    expect(notifyText("Anna", "IDEA", "Dark Mode", "DONE", null)).toContain("umgesetzt");
    expect(notifyText("Anna", "IDEA", "Dark Mode", "PLANNED", null)).toContain("eingeplant");
    const d = notifyText("Anna", "IDEA", "Dark Mode", "DECLINED", "Passt nicht zu uns.");
    expect(d).toContain("vorerst nicht");
    expect(d).toContain("**Anmerkung vom Team:** Passt nicht zu uns.");
    expect(d.startsWith("Moin Anna")).toBe(true);
  });
});
