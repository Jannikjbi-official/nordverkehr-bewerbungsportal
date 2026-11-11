/**
 * Automatische Löschfristen (läuft täglich im Worker).
 * Ohne `server-only`, damit der Worker es importieren kann.
 */
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { Prisma } from "@prisma/client";

const DAY = 86_400_000;

export interface CleanupResult {
  drafts: number;
  withdrawn: number;
  rejected: number;
  accepted: number;
  orphanUploads: number;
  audit: number;
  rateLimits: number;
  outbox: number;
  profiles: number;
}

async function deleteApplications(where: Prisma.ApplicationWhereInput) {
  // Uploads, Antworten, Nachrichten … werden per Cascade mitgelöscht
  return (await db.application.deleteMany({ where })).count;
}

export async function runRetention(now = new Date()): Promise<CleanupResult> {
  const s = await getSettings();
  const before = (days: number) => new Date(now.getTime() - days * DAY);

  const drafts = await deleteApplications({ status: "DRAFT", updatedAt: { lt: before(s["retention.draftDays"]) } });
  const withdrawn = await deleteApplications({ status: "WITHDRAWN", updatedAt: { lt: before(s["retention.withdrawnDays"]) } });
  const rejected = await deleteApplications({ status: "REJECTED", decidedAt: { lt: before(s["retention.rejectedDays"]) } });
  const accepted = await deleteApplications({ status: "ACCEPTED", decidedAt: { lt: before(s["retention.acceptedDays"]) } });

  // Hochgeladene, nie eingereichte Bilder nach 2 Tagen entfernen
  const orphans = await db.upload.deleteMany({ where: { applicationId: null, createdAt: { lt: before(2) } } });

  // Gespeicherte allgemeine Angaben: weg, sobald keine eingereichte Bewerbung mehr existiert
  const profiles = (
    await db.applicantProfile.deleteMany({
      where: { updatedAt: { lt: before(1) }, user: { applications: { none: { status: { not: "DRAFT" } } } } },
    })
  ).count;

  const audit = (await db.auditLog.deleteMany({ where: { createdAt: { lt: before(s["retention.auditDays"]) } } })).count;
  const rateLimits = (await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } })).count;
  const outbox = (await db.outboxJob.deleteMany({ where: { status: { in: ["DONE", "FAILED"] }, updatedAt: { lt: before(30) } } })).count;

  const result = { drafts, withdrawn, rejected, accepted, orphanUploads: orphans.count, audit, rateLimits, outbox, profiles };
  if (drafts + withdrawn + rejected + accepted + orphans.count > 0) {
    await db.auditLog.create({ data: { action: "retention.cleanup", meta: { ...result } } });
  }
  return result;
}
