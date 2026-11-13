/**
 * "Daten zurücksetzen": löscht ALLE Bewerbungen samt allem, was daran hängt
 * (Antworten, Bilder, Nachrichten, Abstimmungen, Kommentare, Statusverlauf,
 * Zustellaufträge) und die gemerkten Basisantworten der Bewerber.
 *
 * Bleibt erhalten: Nutzerkonten, Positionen & Fragen, Bausteine,
 * Einstellungen, Sperren, Notizen, Audit-Log, Changelog-Markierungen.
 *
 * Die Kinder-Tabellen werden ausdrücklich gelöscht (nicht nur über die
 * Kaskade) – so bleibt die Aktion nachvollziehbar und zählt alles mit.
 */
import type { PrismaClient } from "@prisma/client";

/** Diesen Satz muss der Admin exakt eintippen. */
export const RESET_CONFIRM_PHRASE = "ALLE BEWERBUNGEN LÖSCHEN";

export interface ResetCounts {
  applications: number;
  answers: number;
  uploads: number;
  messages: number;
  votes: number;
  comments: number;
  statusChanges: number;
  outboxJobs: number;
  profiles: number;
  counters: number;
}

export async function countApplications(db: PrismaClient) {
  const [all, drafts] = await Promise.all([db.application.count(), db.application.count({ where: { status: "DRAFT" } })]);
  return { all, drafts, submitted: all - drafts };
}

export async function resetAllApplications(db: PrismaClient, opts: { resetNumbering: boolean }): Promise<ResetCounts> {
  // Alles oder nichts: bricht ein Schritt ab, bleibt alles wie es war
  const r = await db.$transaction([
      db.answer.deleteMany({}),
      db.upload.deleteMany({}),
      // Zustellaufträge zu Bewerbungen (DMs, Kanal-Posts) – sonst gingen sie noch raus
      db.outboxJob.deleteMany({ where: { applicationId: { not: null } } }),
      db.outboxJob.deleteMany({ where: { messageId: { not: null } } }),
      db.message.deleteMany({}),
      db.vote.deleteMany({}),
      db.comment.deleteMany({}),
      db.statusChange.deleteMany({}),
      db.application.deleteMany({}),
      db.applicantProfile.deleteMany({}),
      db.counter.deleteMany({ where: opts.resetNumbering ? { key: { startsWith: "publicId:" } } : { key: "__nie__" } }),
      // Bewertungen, Feedback, gebuchte Termine (Termine selbst bleiben, werden wieder frei)
      db.rating.deleteMany({}),
      db.feedback.deleteMany({}),
      db.interviewNote.deleteMany({}),
      db.interviewCheck.deleteMany({}),
      db.interviewSlot.updateMany({ where: { applicationId: { not: null } }, data: { applicationId: null, bookedAt: null } }),
  ]);
  const [answers, uploads, jobsA, jobsM, messages, votes, comments, statusChanges, applications, profiles, counters] = r.map((x) => x.count);
  return { applications, answers, uploads, messages, votes, comments, statusChanges, outboxJobs: jobsA + jobsM, profiles, counters };
}
