/**
 * Integrationstest gegen eine Wegwerf-DB: Claimen/Übernehmen/Freigeben,
 * Senden als Team bzw. persönlich, Components-V2-Payloads, Bot-Logs und
 * explizite null-Felder (Sperr-Filter).
 *
 *   npm run db:dev
 *   npm run db:test-workflow
 */
import "dotenv/config";
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/nordverkehr_claimtest";
process.env.DATABASE_URL = url.toString();
const { db } = await import("../src/lib/db");
const { setClaim, sendTeamMessage, changeStatus, acknowledgeWithdrawal } = await import("../src/lib/team/service");
const { backfillNulls } = await import("../src/lib/db-nulls");
let fails = 0;
const check = (ok: boolean, m: string) => { console.log(ok ? "✓" : "✗", m); if (!ok) fails++; };
try {
  await db.$runCommandRaw({ dropDatabase: 1 });
  const type = await db.applicationType.create({ data: { key: "team", name: "Team" } });
  const pos = await db.position.create({ data: { typeId: type.id, slug: "support", title: "Support", tagline: "x", description: "x" } });
  const mk = (n: string, id: string, isAdmin = false) => db.user.create({ data: { discordId: id, username: n, globalName: n, discordCreatedAt: new Date("2020-01-01"), isTeam: true, isAdmin } });
  const applicant = await mk("Bewerber", "100000000000000010");
  const jonas = await mk("Jonas", "100000000000000011");
  const lea = await mk("Lea", "100000000000000012");
  const app = await db.application.create({ data: { userId: applicant.id, positionId: pos.id, status: "SUBMITTED", publicId: "NV-T-1", submittedAt: new Date() } });

  // Explizite nulls & Sperr-Filter
  const ban = await db.userBan.create({ data: { subjectId: applicant.id, reason: "Test" } });
  check((await db.userBan.count({ where: { id: ban.id, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })) === 1, "Sperre wird mit liftedAt:null/expiresAt:null gefunden");
  await db.$runCommandRaw({ insert: "UserBan", documents: [{ _id: "legacyban000000000000000001", subjectId: applicant.id, reason: "alt", createdAt: { $date: new Date().toISOString() } }] });
  check((await db.userBan.count({ where: { liftedAt: null } })) === 1, "Altdokument ohne Feld wird vorher nicht gefunden (Bug bestätigt)");
  const n = await backfillNulls(db);
  check((await db.userBan.count({ where: { liftedAt: null } })) === 2 && n > 0, `Backfill ergänzt fehlende Felder (${n} Dokumente)`);

  await setClaim({ applicationId: app.id, actor: jonas, action: "claim" });
  check((await db.application.findUnique({ where: { id: app.id } }))?.claimedById === jonas.id, "Jonas claimt");
  let err = ""; try { await setClaim({ applicationId: app.id, actor: lea, action: "release" }); } catch (e) { err = (e as Error).message; }
  check(err.includes("Nur wer"), "Lea (kein Admin) darf nicht freigeben");
  await setClaim({ applicationId: app.id, actor: lea, action: "claim" });
  check((await db.application.findUnique({ where: { id: app.id } }))?.claimedById === lea.id, "Lea übernimmt");
  await setClaim({ applicationId: app.id, actor: lea, action: "release" });
  check((await db.application.findUnique({ where: { id: app.id } }))?.claimedById === null, "Lea gibt frei");
  await setClaim({ applicationId: app.id, actor: jonas, action: "claim" });
  check((await db.application.findUnique({ where: { id: app.id } }))?.claimedById === jonas.id, "nach Freigabe erneut claimbar");

  const personal = await sendTeamMessage({ applicationId: app.id, actor: jonas, title: "Moin", body: "Hallo {name}, Gruß {teammitglied}", templateIds: [] });
  const asTeam = await sendTeamMessage({ applicationId: app.id, actor: jonas, asTeam: true, title: "Moin", body: "Gruß {teammitglied}", templateIds: [] });
  const m1 = await db.message.findUniqueOrThrow({ where: { id: personal.messageId } });
  const m2 = await db.message.findUniqueOrThrow({ where: { id: asTeam.messageId } });
  check(!m1.asTeam && m1.body.includes("Gruß Jonas"), "persönlich: {teammitglied} = Jonas");
  check(m2.asTeam && m2.body.includes("das Nordverkehr-Team"), "als Team: {teammitglied} = das Nordverkehr-Team");
  check((await db.message.count({ where: { readAt: null } })) === 2, "neue Nachrichten mit readAt:null auffindbar");
  const p1 = JSON.stringify((await db.outboxJob.findFirstOrThrow({ where: { messageId: m1.id } })).payload);
  const p2 = JSON.stringify((await db.outboxJob.findFirstOrThrow({ where: { messageId: m2.id } })).payload);
  check(p1.includes('"flags":32768') && p1.includes("Jonas · Nordverkehr-Team") && !p1.includes('"embeds"'), "DM persönlich: V2, Jonas im Kopf");
  check(p2.includes("NORDVERKEHR // TEAM") && !p2.includes("Jonas"), "DM als Team: kein Name");

  await changeStatus({ applicationId: app.id, to: "IN_REVIEW", actorId: jonas.id });
  const logs = await db.outboxJob.findMany({ where: { type: "CHANNEL_MESSAGE" } });
  const all = logs.map((l) => JSON.stringify(l.payload)).join("\n");
  check(logs.length > 0 && logs.every((l) => JSON.stringify(l.payload).includes('"flags":32768')), `alle ${logs.length} Kanal-Posts sind V2`);
  check(all.includes("1569736621019111515"), "Bot-Logs gehen in 1569736621019111515");
  for (const s of ["betreut jetzt", "übernommen von", "freigegeben", "geschrieben (als Team)", "In Prüfung"]) check(all.includes(s), `Bot-Log enthält „${s}“`);
  // Rückzug während der Bearbeitung bestätigen
  await db.application.update({ where: { id: app.id }, data: { status: "WITHDRAWN", withdrawnInReview: true, withdrawReason: "Keine Zeit mehr", decidedAt: new Date() } });
  const ack = await acknowledgeWithdrawal({ applicationId: app.id, actor: lea });
  const again = await acknowledgeWithdrawal({ applicationId: app.id, actor: jonas });
  const acked = await db.application.findUniqueOrThrow({ where: { id: app.id } });
  check(!!acked.withdrawAckAt && acked.withdrawAckById === lea.id, "Rückzug bestätigt (von Lea)");
  check(ack.jobIds.length === 2 && again.jobIds.length === 0, "Bestätigung: DM + Bot-Log, zweiter Klick tut nichts");
  const ackMsg = await db.message.findFirst({ where: { applicationId: app.id, direction: "SYSTEM" }, orderBy: { createdAt: "desc" } });
  check(!!ackMsg?.body.includes("Rückzug") && !!ackMsg.body.includes("bestätigt"), "Bewerber bekommt Bestätigung im Portal");
  const ackLog = JSON.stringify((await db.outboxJob.findMany({ where: { type: "CHANNEL_MESSAGE" } })).map((j) => j.payload));
  check(ackLog.includes("Rückzug von"), "Bot-Log: Rückzug bestätigt");

  // Daten zurücksetzen
  const { resetAllApplications, countApplications } = await import("../src/lib/team/reset");
  await db.application.create({ data: { userId: lea.id, positionId: pos.id, status: "DRAFT" } });
  await db.applicantProfile.create({ data: { userId: applicant.id, answers: { about_me: "x" } } });
  await db.counter.create({ data: { key: "publicId:2026", value: 7 } });
  check((await countApplications(db)).all === 2, "vorher 2 Bewerbungen (1 eingereicht, 1 Entwurf)");
  const counts = await resetAllApplications(db, { resetNumbering: false });
  check(counts.applications === 2 && counts.messages >= 2, `Reset meldet ${counts.applications} Bewerbungen, ${counts.messages} Nachrichten`);
  const left = await Promise.all([db.application.count(), db.message.count(), db.answer.count(), db.vote.count(), db.comment.count(), db.statusChange.count(), db.applicantProfile.count(), db.outboxJob.count({ where: { applicationId: { not: null } } })]);
  check(left.every((n) => n === 0), `nichts Bewerbungsbezogenes übrig (${left.join("/")})`);
  check((await db.user.count()) === 3 && (await db.position.count()) === 1 && (await db.userBan.count()) === 2, "Konten, Positionen und Sperren bleiben");
  check((await db.counter.findUnique({ where: { key: "publicId:2026" } }))?.value === 7, "Nummerierung bleibt ohne Haken");
  await resetAllApplications(db, { resetNumbering: true });
  check(!(await db.counter.findUnique({ where: { key: "publicId:2026" } })), "mit Haken beginnt die Nummerierung neu");

  console.log(fails ? `${fails} fehlgeschlagen` : "Alle Prüfungen bestanden.");
} finally {
  await db.$runCommandRaw({ dropDatabase: 1 }).catch(() => {});
  await db.$disconnect();
}
