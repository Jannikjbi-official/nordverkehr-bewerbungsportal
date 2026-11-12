/**
 * Suche über die Antworten aller eingereichten Bewerbungen („Wer hat schon mal
 * Moderation gemacht?“). Teilwort-Suche ohne Groß-/Kleinschreibung direkt in
 * MongoDB (bei einigen hundert Bewerbungen schnell genug, kein Extra-Index nötig).
 * Nur für das Team. Suchbegriffe werden bewusst NICHT ins Audit-Log geschrieben.
 */
import type { PrismaClient } from "@prisma/client";

export interface AnswerHit {
  label: string;
  before: string;
  match: string;
  after: string;
}

const CONTEXT = 60;
const MAX_HITS_PER_APP = 2;

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text einer gespeicherten Antwort (String, Liste, Zahl, Ja/Nein). */
export function answerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string" || typeof v === "number").join(", ");
  return "";
}

/** Ausschnitt rund um den ersten Treffer, an Wortgrenzen gekürzt. */
export function snippet(text: string, query: string): Omit<AnswerHit, "label"> | null {
  const flat = text.replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return null;
  let start = Math.max(0, i - CONTEXT);
  let end = Math.min(flat.length, i + query.length + CONTEXT);
  if (start > 0) start = flat.indexOf(" ", start) + 1 || start;
  if (end < flat.length) end = flat.lastIndexOf(" ", end) > i + query.length ? flat.lastIndexOf(" ", end) : end;
  return {
    before: (start > 0 ? "… " : "") + flat.slice(start, i),
    match: flat.slice(i, i + query.length),
    after: flat.slice(i + query.length, end) + (end < flat.length ? " …" : ""),
  };
}

/** Treffer pro Bewerbung (höchstens 2 Ausschnitte). */
export async function searchAnswers(db: PrismaClient, query: string, limit = 500): Promise<Map<string, AnswerHit[]>> {
  const q = query.trim();
  const out = new Map<string, AnswerHit[]>();
  if (q.length < 2) return out;
  const res = (await db.$runCommandRaw({
    find: "Answer",
    filter: { value: { $regex: escapeRegex(q), $options: "i" }, type: { $ne: "FILE" } },
    projection: { applicationId: 1, label: 1, value: 1 },
    limit,
  })) as { cursor?: { firstBatch?: { applicationId: string; label: string; value: unknown }[] } };
  for (const a of res.cursor?.firstBatch ?? []) {
    const hits = out.get(a.applicationId) ?? [];
    if (hits.length >= MAX_HITS_PER_APP) continue;
    const s = snippet(answerText(a.value), q);
    if (!s) continue;
    hits.push({ label: a.label, ...s });
    out.set(a.applicationId, hits);
  }
  return out;
}
