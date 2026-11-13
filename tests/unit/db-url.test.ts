import { describe, expect, it } from "vitest";
import { hasDatabaseUrl, resolveDatabaseUrl, resolveDirectUrl } from "@/lib/db";

const PG = "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const PRISMA = "postgres://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?pgbouncer=true&connect_timeout=15&sslmode=require";
const DIRECT = "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("resolveDatabaseUrl (Postgres/Neon)", () => {
  it("bevorzugt die Prisma-URL der Neon-Integration", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: PG, DATABASE_POSTGRES_PRISMA_URL: PRISMA })).toBe(PRISMA);
    expect(resolveDatabaseUrl({ DATABASE_URL: PG })).toBe(PG);
    expect(resolveDatabaseUrl({ POSTGRES_URL: PG })).toBe(PG);
  });
  it("überspringt alte MongoDB-Adressen", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "mongodb+srv://a.mongodb.net/x", POSTGRES_URL: PG })).toBe(PG);
    expect(hasDatabaseUrl({ DATABASE_URL: "mongodb://a/x", DATABASE_URL_MONGODB_URI: "mongodb://b/y" })).toBe(false);
    expect(() => resolveDatabaseUrl({ DATABASE_URL: "mongodb://a/x" })).toThrow(/Keine Postgres/);
    expect(() => resolveDatabaseUrl({})).toThrow(/Keine Postgres/);
  });
  it("Migrationen über die direkte Verbindung", () => {
    expect(resolveDirectUrl({ DATABASE_URL: PG, DATABASE_URL_UNPOOLED: DIRECT })).toBe(DIRECT);
    expect(resolveDirectUrl({ DATABASE_URL: PG, DATABASE_POSTGRES_URL_NON_POOLING: DIRECT })).toBe(DIRECT);
    expect(resolveDirectUrl({ DATABASE_URL: PG })).toBe(PG);
  });
});
