/**
 * `prisma db push` + MongoDB-Indizes. Ergänzt den Datenbanknamen im
 * Connection String, falls er fehlt (z. B. bei der Vercel-Atlas-Integration).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolveDatabaseUrl } from "../src/lib/db";

let url: string;
try {
  url = resolveDatabaseUrl();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
// Prisma CLI liest DATABASE_URL aus dem Schema
const env = { ...process.env, DATABASE_URL: url };
const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("npx", ["prisma", "db", "push", ...process.argv.slice(2)]);
run("npx", ["tsx", "scripts/mongo-indexes.ts"]);
