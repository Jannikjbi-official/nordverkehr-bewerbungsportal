/**
 * Einmalige Übernahme MongoDB → Postgres (Umzug auf Neon, 11/2026).
 *
 * Liest jede Collection der alten MongoDB und schreibt sie in die gleichnamige
 * Postgres-Tabelle – IDs bleiben erhalten (sie waren schon Text/cuid), damit
 * alle Verweise stimmen. Ablauf in EINER Transaktion: Postgres-Tabellen leeren
 * (z. B. die beim ersten Aufruf angelegten Basisdaten), dann alles einfügen.
 * Schlägt etwas fehl, bleibt Postgres unverändert. MongoDB wird nur gelesen.
 *
 * Robust gegen Altlasten: Felder, die es nicht mehr gibt, werden ignoriert;
 * fehlende Felder bekommen den Standardwert; Verweise auf nicht vorhandene
 * Einträge werden geleert (optional) bzw. der Eintrag übersprungen (Pflicht).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

type Field = Prisma.DMMF.Field;
type Model = Prisma.DMMF.Model;

import { resolveMongoUrl } from "@/lib/setup/mongo-import-shared";

export { resolveMongoUrl };

/** Datenbankname aus der URL – wie früher: fehlt er, hieß sie „nordverkehr“. */
export function mongoDbName(url: string): string {
  const m = url.match(/^mongodb(?:\+srv)?:\/\/[^/?#]+\/([^?#]*)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : "nordverkehr";
}

const MODELS = Prisma.dmmf.datamodel.models;
const ENUMS = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, new Set(e.values.map((v) => v.name))]));

/** Prisma-Delegat zu einem Modell (z. B. „InterviewSlot“ → db.interviewSlot). */
const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

/** Reihenfolge: zuerst Tabellen, auf die andere verweisen. */
export function importOrder(models: readonly Model[] = MODELS): Model[] {
  const deps = new Map<string, Set<string>>();
  for (const m of models) {
    const d = new Set<string>();
    for (const f of m.fields) if (f.kind === "object" && f.relationFromFields?.length && f.type !== m.name) d.add(f.type);
    deps.set(m.name, d);
  }
  const out: Model[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (m: Model) => {
    if (done.has(m.name)) return;
    if (visiting.has(m.name)) throw new Error(`Zyklische Verweise bei ${m.name}`);
    visiting.add(m.name);
    for (const dep of deps.get(m.name) ?? []) {
      const dm = models.find((x) => x.name === dep);
      if (dm) visit(dm);
    }
    visiting.delete(m.name);
    done.add(m.name);
    out.push(m);
  };
  for (const m of models) visit(m);
  return out;
}

/** JSON-fähig machen (Datumswerte, ObjectIds usw. aus MongoDB). */
function toJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

function convert(f: Field, v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  if (f.isList) return Array.isArray(v) ? v.map((x) => (f.type === "String" ? String(x) : x)) : [];
  switch (f.type) {
    case "String":
      return typeof v === "string" ? v : String(v);
    case "Int":
      return Math.trunc(Number(v));
    case "Float":
      return Number(v);
    case "BigInt":
      return BigInt(String(v));
    case "Boolean":
      return Boolean(v);
    case "DateTime": {
      const d = v instanceof Date ? v : new Date(String(v));
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    case "Json":
      return toJson(v);
    default:
      if (f.kind === "enum") return ENUMS.get(f.type)?.has(String(v)) ? String(v) : undefined;
      return v;
  }
}

/** Ersatzwert für Pflichtfelder ohne Standardwert, die im Altdokument fehlen. */
function fallback(f: Field): unknown {
  if (f.isList) return [];
  switch (f.type) {
    case "String":
      return "";
    case "Int":
    case "Float":
      return 0;
    case "Boolean":
      return false;
    case "DateTime":
      return new Date();
    case "Json":
      return {};
    default:
      return f.kind === "enum" ? [...(ENUMS.get(f.type) ?? [])][0] : undefined;
  }
}

export interface ImportTableReport {
  model: string;
  source: number;
  inserted: number;
  skipped: number;
}

export interface ImportReport {
  tables: ImportTableReport[];
  totalSource: number;
  totalInserted: number;
  /** Verweise auf fehlende Einträge, die geleert wurden */
  clearedRefs: number;
  /** Pflichtfelder, die im Altdokument fehlten und einen Ersatzwert bekamen */
  filledRequired: number;
  ms: number;
}

/** Wie viele Einträge liegen in MongoDB? (nur lesen) */
export async function mongoOverview(url: string): Promise<{ dbName: string; counts: Record<string, number> }> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const dbName = mongoDbName(url);
    const mdb = client.db(dbName);
    const existing = new Set((await mdb.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    const counts: Record<string, number> = {};
    for (const m of MODELS) counts[m.name] = existing.has(m.dbName ?? m.name) ? await mdb.collection(m.dbName ?? m.name).countDocuments() : 0;
    return { dbName, counts };
  } finally {
    await client.close();
  }
}

export async function importFromMongo(db: PrismaClient, url: string, opts: { log?: (m: string) => void } = {}): Promise<ImportReport> {
  const log = opts.log ?? (() => {});
  const started = Date.now();
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const mdb = client.db(mongoDbName(url));
    const existing = new Set((await mdb.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    const order = importOrder();

    // Erst alles lesen (außerhalb der Transaktion – die soll kurz bleiben)
    const docs = new Map<string, Record<string, unknown>[]>();
    for (const m of order) {
      const name = m.dbName ?? m.name;
      docs.set(m.name, existing.has(name) ? ((await mdb.collection(name).find({}).toArray()) as Record<string, unknown>[]) : []);
    }

    let clearedRefs = 0;
    let filledRequired = 0;
    const tables: ImportTableReport[] = [];

    await db.$transaction(
      async (tx) => {
        // Vorhandene Daten (Basisdaten der Ersteinrichtung, Logins seit dem Umzug) ersetzen
        const tableList = order.map((m) => `"${m.dbName ?? m.name}"`).join(", ");
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE`);

        const ids = new Map<string, Set<string>>();
        for (const m of order) {
          const idField = m.fields.find((f) => f.isId);
          const scalars = m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum");
          // Fremdschlüssel → Zielmodell, Pflicht?
          const fks = new Map<string, { target: string; required: boolean }>();
          for (const f of m.fields) {
            if (f.kind !== "object" || !f.relationFromFields?.length) continue;
            for (const fk of f.relationFromFields) fks.set(fk, { target: f.type, required: f.isRequired });
          }
          const rows: Record<string, unknown>[] = [];
          let skipped = 0;
          const seen = new Set<string>();
          for (const doc of docs.get(m.name) ?? []) {
            const row: Record<string, unknown> = {};
            let skip = false;
            for (const f of scalars) {
              const raw = f.isId ? doc._id : doc[f.dbName ?? f.name];
              let v = convert(f, raw);
              const fk = fks.get(f.name);
              if (fk && v !== undefined) {
                const known = fk.target === m.name ? true : ids.get(fk.target)?.has(String(v));
                if (!known) {
                  if (fk.required) {
                    skip = true;
                    break;
                  }
                  v = undefined;
                  clearedRefs++;
                }
              }
              if (v === undefined) {
                if (f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt) {
                  if (fk?.required || f.isId) {
                    skip = true;
                    break;
                  }
                  v = fallback(f);
                  // Leere Listen ließ MongoDB oft einfach weg – kein echter Ersatzwert
                  if (v !== undefined && !f.isList) filledRequired++;
                }
                if (v === undefined) continue;
              }
              row[f.name] = v;
            }
            const id = idField ? String(row[idField.name] ?? "") : "";
            if (skip || (idField && (!id || seen.has(id)))) {
              skipped++;
              continue;
            }
            if (idField) seen.add(id);
            rows.push(row);
          }

          // Selbstverweise (z. B. Pate) erst prüfen, wenn alle IDs der Tabelle bekannt sind
          for (const [fk, { target }] of fks) {
            if (target !== m.name) continue;
            for (const r of rows) if (r[fk] != null && !seen.has(String(r[fk]))) {
              r[fk] = null;
              clearedRefs++;
            }
          }

          const delegate = (tx as unknown as Record<string, { createMany: (a: { data: unknown[]; skipDuplicates: boolean }) => Promise<{ count: number }> }>)[delegateName(m.name)];
          let inserted = 0;
          for (let i = 0; i < rows.length; i += 500) inserted += (await delegate.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true })).count;
          ids.set(m.name, seen);
          const source = docs.get(m.name)?.length ?? 0;
          tables.push({ model: m.name, source, inserted, skipped: skipped + (rows.length - inserted) });
          if (source) log(`${m.name}: ${inserted}/${source}`);
        }
      },
      { timeout: 240_000, maxWait: 20_000 },
    );

    return {
      tables,
      totalSource: tables.reduce((n, t) => n + t.source, 0),
      totalInserted: tables.reduce((n, t) => n + t.inserted, 0),
      clearedRefs,
      filledRequired,
      ms: Date.now() - started,
    };
  } finally {
    await client.close();
  }
}
