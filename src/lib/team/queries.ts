import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { TAG_KEYS, type TagKey } from "@/lib/ai/tags";
import { searchAnswers, type AnswerHit } from "@/lib/team/answer-search";
import { hiddenPositionIds, type Viewer } from "@/lib/team/visibility";
import type { Prisma } from "@prisma/client";
import type { ApplicationStatus } from "@prisma/client";

const STATUSES = ["SUBMITTED", "IN_REVIEW", "INTERVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const;

const filterSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  /** Volltextsuche in den Antworten */
  text: z.string().trim().min(2).max(80).optional().catch(undefined),
  position: z.string().regex(/^[a-z0-9-]{1,60}$/).optional().catch(undefined),
  status: z
    .union([z.enum(STATUSES), z.array(z.enum(STATUSES))])
    .optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : undefined))
    .catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  view: z.enum(["tabelle", "board"]).default("tabelle").catch("tabelle"),
  sort: z.enum(["neu", "alt", "aktiv"]).default("neu").catch("neu"),
  page: z.coerce.number().int().min(1).max(1000).default(1).catch(1),
  flag: z.enum(["dm", "hinweise", "antwort"]).optional().catch(undefined),
  tag: z.enum(TAG_KEYS as [TagKey, ...TagKey[]]).optional().catch(undefined),
});

export type ApplicationFilters = z.infer<typeof filterSchema>;

export function parseFilters(sp: Record<string, string | string[] | undefined>): ApplicationFilters {
  return filterSchema.parse(sp);
}

export function filtersToQuery(f: Partial<ApplicationFilters>, patch: Partial<ApplicationFilters> = {}) {
  const merged = { ...f, ...patch };
  const qs = new URLSearchParams();
  if (merged.q) qs.set("q", merged.q);
  if (merged.text) qs.set("text", merged.text);
  if (merged.position) qs.set("position", merged.position);
  merged.status?.forEach((s) => qs.append("status", s));
  if (merged.from) qs.set("from", merged.from);
  if (merged.to) qs.set("to", merged.to);
  if (merged.view && merged.view !== "tabelle") qs.set("view", merged.view);
  if (merged.sort && merged.sort !== "neu") qs.set("sort", merged.sort);
  if (merged.flag) qs.set("flag", merged.flag);
  if (merged.tag) qs.set("tag", merged.tag);
  if (merged.page && merged.page > 1) qs.set("page", String(merged.page));
  return qs.toString();
}

export function buildWhere(f: ApplicationFilters): Prisma.ApplicationWhereInput {
  const where: Prisma.ApplicationWhereInput = { status: { not: "DRAFT" } };
  if (f.status?.length) where.status = { in: f.status as ApplicationStatus[] };
  if (f.position) where.position = { slug: f.position };
  if (f.from || f.to) {
    where.submittedAt = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00`) } : {}),
      ...(f.to ? { lte: new Date(`${f.to}T23:59:59`) } : {}),
    };
  }
  if (f.q) {
    const q = f.q.replace(/^@/, "");
    where.OR = [
      { publicId: { contains: q, mode: "insensitive" } },
      { user: { username: { contains: q, mode: "insensitive" } } },
      { user: { globalName: { contains: q, mode: "insensitive" } } },
      { user: { discordId: q } },
    ];
  }
  if (f.flag === "dm") where.confirmationDmStatus = { in: ["DM_CLOSED", "FAILED"] };
  if (f.flag === "hinweise") where.NOT = { flags: { equals: [] } };
  if (f.tag) where.aiTags = { has: f.tag };
  if (f.flag === "antwort") where.messages = { some: { direction: "APPLICANT_TO_TEAM", readAt: null } };
  return where;
}

export const PAGE_SIZE = 25;

export const applicationListInclude = {
  user: { select: { id: true, discordId: true, username: true, globalName: true, avatar: true } },
  position: { select: { title: true, slug: true, icon: true, quizMinScore: true } },
  votes: { select: { value: true, userId: true } },
  claimedBy: { select: { discordId: true, avatar: true, globalName: true, username: true } },
  _count: { select: { comments: true, messages: { where: { direction: "APPLICANT_TO_TEAM", readAt: null } } } },
} satisfies Prisma.ApplicationInclude;

export async function listApplications(f: ApplicationFilters, opts: { all?: boolean; viewer?: Viewer } = {}) {
  const where = buildWhere(f);
  // Zuständigkeit pro Stelle: nur Stellen, für die die Person zuständig ist
  if (opts.viewer) {
    const hidden = await hiddenPositionIds(opts.viewer);
    if (hidden.length) where.positionId = { notIn: hidden };
  }
  // Suche in den Antworten: nur Bewerbungen mit Treffer, Ausschnitte für die Liste
  let hits: Map<string, AnswerHit[]> | null = null;
  if (f.text) {
    hits = await searchAnswers(db, f.text);
    where.id = { in: [...hits.keys()] };
  }
  const orderBy: Prisma.ApplicationOrderByWithRelationInput =
    f.sort === "alt" ? { submittedAt: "asc" } : f.sort === "aktiv" ? { updatedAt: "desc" } : { submittedAt: "desc" };
  const take = opts.all ? 400 : PAGE_SIZE;
  const [rows, total] = await Promise.all([
    db.application.findMany({
      where,
      include: applicationListInclude,
      orderBy,
      take,
      skip: opts.all ? 0 : (f.page - 1) * PAGE_SIZE,
    }),
    db.application.count({ where }),
  ]);
  return { rows, total, hits };
}

export type ApplicationRow = Awaited<ReturnType<typeof listApplications>>["rows"][number];

export function voteSummary(votes: { value: string }[]) {
  return {
    pro: votes.filter((v) => v.value === "PRO").length,
    contra: votes.filter((v) => v.value === "CONTRA").length,
    abstain: votes.filter((v) => v.value === "ABSTAIN").length,
  };
}
