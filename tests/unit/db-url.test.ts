import { describe, expect, it } from "vitest";
import { withDatabaseName } from "@/lib/db";

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
