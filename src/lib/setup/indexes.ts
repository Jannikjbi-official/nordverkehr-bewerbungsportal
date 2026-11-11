/**
 * Alle MongoDB-Indizes des Portals – idempotent.
 *
 * Enthält die Indizes aus prisma/schema.prisma (gleiche Namen wie bei
 * `prisma db push`) plus die partiellen Indizes, die Prisma nicht abbilden kann.
 * Dadurch lässt sich die Datenbank auch direkt auf Vercel einrichten, ohne
 * die Datenbank-URL lokal zu kennen.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type IndexSpec = {
  key: Record<string, 1 | -1>;
  name: string;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  expireAfterSeconds?: number;
};

const OPEN = ["DRAFT", "SUBMITTED", "IN_REVIEW", "INTERVIEW"];

const idx = (fields: string[], model: string, unique = false): IndexSpec => ({
  key: Object.fromEntries(fields.map((f) => [f, 1 as const])),
  name: `${model}_${fields.join("_")}_${unique ? "key" : "idx"}`,
  ...(unique ? { unique: true } : {}),
});

export const INDEXES: Record<string, IndexSpec[]> = {
  User: [idx(["discordId"], "User", true)],
  UserNote: [idx(["subjectId"], "UserNote")],
  UserBan: [idx(["subjectId"], "UserBan")],
  ApplicationType: [idx(["key"], "ApplicationType", true)],
  Position: [idx(["slug"], "Position", true), idx(["typeId", "status"], "Position")],
  FormSection: [
    idx(["typeId", "positionId"], "FormSection"),
    // Eindeutige Abschnitts-Keys (nur wenn gesetzt) – verhindert doppelte Abschnitte, auch bei parallelen Einrichtungen
    { key: { key: 1 }, name: "section_key_unique_when_set", unique: true, partialFilterExpression: { key: { $type: "string" } } },
  ],
  Question: [
    idx(["sectionId"], "Question"),
    // Eindeutige Fragen-Keys (nur wenn gesetzt)
    { key: { key: 1 }, name: "question_key_unique_when_set", unique: true, partialFilterExpression: { key: { $type: "string" } } },
  ],
  ApplicantProfile: [idx(["userId"], "ApplicantProfile", true)],
  Application: [
    idx(["publicId"], "Application"),
    idx(["status"], "Application"),
    idx(["positionId"], "Application"),
    idx(["userId"], "Application"),
    idx(["submittedAt"], "Application"),
    // Bewerbungs-ID eindeutig – aber nur, wenn gesetzt (Entwürfe haben noch keine)
    { key: { publicId: 1 }, name: "publicId_unique_when_set", unique: true, partialFilterExpression: { publicId: { $type: "string" } } },
    // Pro Discord-Account nur eine offene Bewerbung (inkl. Entwurf) pro Position
    { key: { userId: 1, positionId: 1 }, name: "one_open_per_position", unique: true, partialFilterExpression: { status: { $in: OPEN } } },
  ],
  Answer: [idx(["applicationId"], "Answer")],
  Upload: [idx(["applicationId"], "Upload"), idx(["ownerId"], "Upload")],
  StatusChange: [idx(["applicationId"], "StatusChange")],
  Vote: [idx(["applicationId", "userId"], "Vote", true)],
  Comment: [idx(["applicationId"], "Comment")],
  Message: [idx(["applicationId", "createdAt"], "Message")],
  MessageTemplate: [idx(["category", "sortOrder"], "MessageTemplate")],
  AuditLog: [idx(["createdAt"], "AuditLog"), idx(["targetType", "targetId"], "AuditLog"), idx(["actorId"], "AuditLog")],
  AiUsage: [idx(["createdAt"], "AiUsage"), idx(["userId", "createdAt"], "AiUsage"), idx(["feature", "createdAt"], "AiUsage")],
  // Abgelaufene Rate-Limit-Einträge räumt MongoDB selbst auf (TTL)
  RateLimit: [{ key: { resetAt: 1 }, name: "ttl_resetAt", expireAfterSeconds: 3600 }],
  OutboxJob: [idx(["status", "runAt"], "OutboxJob")],
};

/** Alte, fehlerhafte Indizes entfernen (vollständiges @unique auf optionaler publicId). */
const OBSOLETE: [string, string][] = [["Application", "Application_publicId_key"]];

export async function ensureIndexes(db: PrismaClient) {
  for (const [collection, name] of OBSOLETE) {
    await db.$runCommandRaw({ dropIndexes: collection, index: name }).catch(() => {});
  }
  for (const [collection, indexes] of Object.entries(INDEXES)) {
    await db.$runCommandRaw({ createIndexes: collection, indexes: indexes as unknown as Prisma.InputJsonValue });
  }
}
