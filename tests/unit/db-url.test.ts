import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl, withDatabaseName } from "@/lib/db";

describe("withDatabaseName", () => {
  it("ergänzt den Datenbanknamen, wenn er fehlt (Vercel-Atlas-Integration)", () => {
    expect(withDatabaseName("mongodb+srv://u:p@cluster0.abc.mongodb.net/?retryWrites=true&w=majority")).toBe(
      "mongodb+srv://u:p@cluster0.abc.mongodb.net/nordverkehr?retryWrites=true&w=majority",
    );
    expect(withDatabaseName("mongodb+srv://u:p@cluster0.abc.mongodb.net")).toBe("mongodb+srv://u:p@cluster0.abc.mongodb.net/nordverkehr");
  });
  it("lässt vorhandene Namen unverändert", () => {
    const url = "mongodb://127.0.0.1:27017/test?replicaSet=rs0&directConnection=true";
    expect(withDatabaseName(url)).toBe(url);
  });
});

describe("resolveDatabaseUrl", () => {
  it("nimmt DATABASE_URL, sonst die Variable der Atlas-Integration", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "mongodb://a/x" })).toBe("mongodb://a/x");
    expect(resolveDatabaseUrl({ DATABASE_URL: "", DATABASE_URL_MONGODB_URI: "mongodb+srv://b.mongodb.net/?w=majority" })).toBe(
      "mongodb+srv://b.mongodb.net/nordverkehr?w=majority",
    );
    expect(resolveDatabaseUrl({ MONGODB_URI: "mongodb://c/y" })).toBe("mongodb://c/y");
  });
  it("wirft ohne jede Variable", () => {
    expect(() => resolveDatabaseUrl({})).toThrow(/Keine Datenbank-URL/);
  });
});
