/**
 * Speicher-Übersicht für Admins: Größe der Datenbank und der größten Tabellen,
 * dazu die Bilder (liegen als Bytes in der Datenbank).
 */
import "server-only";
import { db } from "@/lib/db";

export interface StorageInfo {
  totalBytes: number;
  tables: { name: string; bytes: number }[];
  uploads: { count: number; bytes: number; decided: number; decidedBytes: number };
}

export async function storageInfo(): Promise<StorageInfo> {
  const [total, tables, uploads, decided] = await Promise.all([
    db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database())::bigint AS size`,
    db.$queryRaw<{ name: string; size: bigint }[]>`
      SELECT c.relname::text AS name, pg_total_relation_size(c.oid)::bigint AS size
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname = current_schema()
      ORDER BY size DESC LIMIT 6`,
    db.upload.aggregate({ _count: true, _sum: { size: true } }),
    db.upload.aggregate({ _count: true, _sum: { size: true }, where: { application: { status: { in: ["ACCEPTED", "REJECTED", "WITHDRAWN"] } } } }),
  ]);
  return {
    totalBytes: Number(total[0]?.size ?? 0),
    tables: tables.map((t) => ({ name: t.name, bytes: Number(t.size) })),
    uploads: { count: uploads._count, bytes: uploads._sum.size ?? 0, decided: decided._count, decidedBytes: decided._sum.size ?? 0 },
  };
}

export const formatBytes = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2).replace(".", ",")} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
