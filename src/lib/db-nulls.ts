/**
 * MongoDB-Eigenheit mit Prisma: Optionale Felder, die beim Anlegen nicht
 * angegeben werden, landen gar nicht im Dokument. Filter wie
 * `{ liftedAt: null }` oder `{ readAt: null }` treffen solche Dokumente aber
 * NICHT (sie bräuchten `isSet: false`).
 *
 * Lösung an der Wurzel:
 *  1. `fillNulls` – beim Anlegen werden fehlende optionale Felder explizit auf
 *     `null` gesetzt (Prisma-Extension in db.ts).
 *  2. `backfillNulls` – setzt in bestehenden Dokumenten fehlende optionale
 *     Felder auf `null` (Migration + täglicher Cron als Sicherheitsnetz,
 *     z. B. für verschachtelte Creates).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

interface ModelInfo {
  /** Optionale Skalarfelder ohne Fremdschlüssel (keine Listen, kein Json) */
  plain: string[];
  /** Fremdschlüssel → Relationsfeld */
  foreignKeys: Record<string, string>;
  relationFields: Set<string>;
  dbName: string;
}

const MODELS: Record<string, ModelInfo> = {};
for (const m of Prisma.dmmf.datamodel.models) {
  const foreignKeys: Record<string, string> = {};
  const relationFields = new Set<string>();
  for (const f of m.fields) {
    if (f.kind !== "object") continue;
    relationFields.add(f.name);
    for (const fk of f.relationFromFields ?? []) foreignKeys[fk] = f.name;
  }
  const optional = m.fields.filter((f) => !f.isRequired && f.kind === "scalar" && !f.isList && f.type !== "Json");
  MODELS[m.name] = {
    plain: optional.filter((f) => !(f.name in foreignKeys)).map((f) => f.name),
    foreignKeys: Object.fromEntries(Object.entries(foreignKeys).filter(([fk]) => optional.some((f) => f.name === fk))),
    relationFields,
    dbName: m.dbName ?? m.name,
  };
}

/**
 * Ergänzt fehlende optionale Felder mit `null`. Fremdschlüssel nur, wenn die
 * Eingabe "unchecked" ist (keine Relationsobjekte wie `user: { connect }`) –
 * sonst würde Prisma die Mischung ablehnen.
 */
export function fillNulls<T>(model: string | undefined, data: T): T {
  const info = model ? MODELS[model] : undefined;
  if (!info || !data || typeof data !== "object" || Array.isArray(data)) return data;
  const d = { ...(data as Record<string, unknown>) };
  for (const f of info.plain) if (!(f in d)) d[f] = null;
  const checked = Object.keys(d).some((k) => info.relationFields.has(k));
  if (!checked) for (const fk of Object.keys(info.foreignKeys)) if (!(fk in d)) d[fk] = null;
  return d as T;
}

/** Fehlende optionale Felder in allen Collections auf `null` setzen. Gibt die Anzahl geänderter Dokumente zurück. */
export async function backfillNulls(db: PrismaClient) {
  let modified = 0;
  for (const info of Object.values(MODELS)) {
    const fields = [...info.plain, ...Object.keys(info.foreignKeys)];
    if (!fields.length) continue;
    const res = (await db.$runCommandRaw({
      update: info.dbName,
      updates: fields.map((f) => ({ q: { [f]: { $exists: false } }, u: { $set: { [f]: null } }, multi: true })),
    })) as { nModified?: number };
    modified += Number(res.nModified ?? 0);
  }
  return modified;
}

/** Prisma-Extension: Creates schreiben fehlende optionale Felder explizit als `null`. */
export const explicitNulls = Prisma.defineExtension({
  name: "explicit-nulls",
  query: {
    $allModels: {
      create({ model, args, query }) {
        args.data = fillNulls(model, args.data);
        return query(args);
      },
      createMany({ model, args, query }) {
        const data = args.data as unknown;
        (args as { data: unknown }).data = Array.isArray(data) ? data.map((d) => fillNulls(model, d)) : fillNulls(model, data);
        return query(args);
      },
      upsert({ model, args, query }) {
        args.create = fillNulls(model, args.create);
        return query(args);
      },
    },
  },
});
