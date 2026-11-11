/**
 * `prisma db push` + MongoDB-Indizes. Ergänzt den Datenbanknamen im
 * Connection String, falls er fehlt (z. B. bei der Vercel-Atlas-Integration).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { withDatabaseName } from "../src/lib/db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: withDatabaseName(url) };
const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("npx", ["prisma", "db", "push", ...process.argv.slice(2)]);
run("npx", ["tsx", "scripts/mongo-indexes.ts"]);
