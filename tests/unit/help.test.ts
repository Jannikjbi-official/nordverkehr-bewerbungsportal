import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP, HELP_IDS } from "@/lib/help";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("Hilfe & Begriffe", () => {
  it("IDs sind eindeutig und als Sprungmarke geeignet", () => {
    const ids = [...HELP.map((s) => s.id), ...HELP_IDS];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("jeder „Was heißt das?“-Link zeigt auf einen existierenden Begriff", () => {
    const used = files(join(process.cwd(), "src")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<HelpLink id="([^"]+)"/g)].map((m) => ({ file: f, id: m[1] })),
    );
    expect(used.length).toBeGreaterThan(5);
    for (const u of used) expect(HELP_IDS, `${u.id} in ${u.file}`).toContain(u.id);
  });
});
