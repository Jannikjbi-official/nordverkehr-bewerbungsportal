/**
 * Integrationstest (Wegwerf-DB) für Termine, Bewertungen, Stellen-Automatik,
 * Einarbeitung/Probezeit, Feedback und Team-Übersicht. Kein Discord-Versand.
 *
 *   npm run db:dev
 *   npm run db:test-features
 */
import "dotenv/config";
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/nordverkehr_featuretest";
process.env.DATABASE_URL = url.toString();
process.env.DISCORD_BOT_TOKEN = ""; // nichts an Discord schicken
const { db } = await import("../src/lib/db");
const { ensureIndexes } = await import("../src/lib/setup/indexes");
const { bookSlot, sendInterviewReminders, SlotError } = await import("../src/lib/team/slots");
const { changeStatus } = await import("../src/lib/team/service");
const { applyPositionSchedule, closeIfFull } = await import("../src/lib/positions/schedule");
const { collectDailySummary } = await import("../src/lib/team/daily-summary");
const { applyGuildState } = await import("../src/lib/applications/guild-watch");
let fails = 0;
const check = (ok: boolean, m: string) => { console.log(ok ? "✓" : "✗", m); if (!ok) fails++; };
const H = 3_600_000;
try {
  await db.$runCommandRaw({ dropDatabase: 1 });
  await ensureIndexes(db);
  const type = await db.applicationType.create({ data: { key: "team", name: "Team" } });
  const pos = await db.position.create({ data: { typeId: type.id, slug: "support", title: "Support", tagline: "x", description: "x", maxApplications: 2 } });
  const mk = (n: string, id: string, extra = {}) => db.user.create({ data: { discordId: id, username: n, globalName: n, discordCreatedAt: new Date("2020-01-01"), ...extra } });
  const a1 = await mk("Anna", "100000000000000021");
  const a2 = await mk("Ben", "100000000000000022", { notifyNewPositions: true });
  const team = await mk("Jonas", "100000000000000023", { isTeam: true });
  const app1 = await db.application.create({ data: { userId: a1.id, positionId: pos.id, status: "INTERVIEW", publicId: "NV-F-1", submittedAt: new Date() } });
  const app2 = await db.application.create({ data: { userId: a2.id, positionId: pos.id, status: "INTERVIEW", publicId: "NV-F-2", submittedAt: new Date() } });

  // ── Termine
  const s1 = await db.interviewSlot.create({ data: { startsAt: new Date(Date.now() + 24 * H) } });
  const s2 = await db.interviewSlot.create({ data: { startsAt: new Date(Date.now() + 26 * H) } });
  await db.interviewSlot.create({ data: { startsAt: new Date(Date.now() + 28 * H) } }); // zweiter freier Slot: partieller Index erlaubt mehrere null
  await bookSlot(db, { userId: a1.id, applicationId: app1.id, slotId: s1.id });
  check((await db.application.findUnique({ where: { id: app1.id } }))!.interviewAt?.getTime() === s1.startsAt.getTime(), "Buchung setzt interviewAt");
  let err = "";
  try { await bookSlot(db, { userId: a2.id, applicationId: app2.id, slotId: s1.id }); } catch (e) { err = e instanceof SlotError ? e.message : String(e); }
  check(err.includes("gerade jemand"), "Doppelbuchung wird abgelehnt");
  await bookSlot(db, { userId: a1.id, applicationId: app1.id, slotId: s2.id });
  check(!(await db.interviewSlot.findUnique({ where: { id: s1.id } }))!.applicationId && (await db.interviewSlot.findUnique({ where: { id: s2.id } }))!.applicationId === app1.id, "Umbuchen gibt alten Slot frei");
  err = "";
  try { await bookSlot(db, { userId: a2.id, applicationId: app1.id, slotId: s1.id }); } catch (e) { err = String(e); }
  check(err.includes("nicht gefunden"), "Fremde Bewerbung kann nicht buchen");
  await changeStatus({ applicationId: app1.id, to: "REJECTED", actorId: team.id });
  check(!(await db.interviewSlot.findUnique({ where: { id: s2.id } }))!.applicationId, "Ablehnung gibt künftigen Slot frei");

  // ── Erinnerung (Termin heute in 1 h, nach deutscher Zeit noch heute?)
  const soon = new Date(Date.now() + 30 * 60_000);
  await db.application.update({ where: { id: app2.id }, data: { interviewAt: soon } });
  const n1 = await sendInterviewReminders(db);
  const n2 = await sendInterviewReminders(db);
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(soon) === new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  check(sameDay ? n1 === 1 && n2 === 0 : n1 === 0, `Erinnerung genau einmal (${n1}/${n2})`);

  // ── Bewertung (unique)
  await db.rating.create({ data: { applicationId: app2.id, userId: team.id, scores: { kommunikation: 4 } } });
  let dup = false;
  try { await db.rating.create({ data: { applicationId: app2.id, userId: team.id, scores: {} } }); } catch { dup = true; }
  check(dup, "Eine Bewertung pro Teammitglied");

  // ── Höchstzahl: 2 eingereicht → schließt
  check(await closeIfFull(db, pos.id), "Höchstzahl erreicht → Stelle geschlossen");
  check((await db.position.findUnique({ where: { id: pos.id } }))!.status === "CLOSED", "Status CLOSED");

  // ── Datum: öffnet wieder, Vorgemerkte bekommen DM-Auftrag
  await db.position.update({ where: { id: pos.id }, data: { opensAt: new Date(Date.now() - H), maxApplications: null } });
  const before = await db.outboxJob.count({ where: { type: "DM" } });
  const t = await applyPositionSchedule(db);
  check(t.length === 1 && t[0].to === "OPEN", "Startdatum öffnet die Stelle");
  const p2 = await db.position.findUnique({ where: { id: pos.id } });
  check(p2!.status === "OPEN" && !p2!.opensAt, "Startdatum verbraucht");
  const dms = await db.outboxJob.findMany({ where: { type: "DM" }, skip: before });
  check(dms.some((j) => (j.payload as { purpose?: string; discordUserId?: string }).purpose === "notify" && (j.payload as { discordUserId?: string }).discordUserId === a2.discordId), "Vorgemerkte bekommen DM");
  check((await applyPositionSchedule(db)).length === 0, "Zweiter Lauf ändert nichts");

  // ── Annahme → Probezeit, Übersicht
  const app3 = await db.application.create({ data: { userId: a1.id, positionId: pos.id, status: "INTERVIEW", publicId: "NV-F-3", submittedAt: new Date() } });
  await changeStatus({ applicationId: app3.id, to: "ACCEPTED", actorId: team.id });
  const acc = await db.application.findUnique({ where: { id: app3.id } });
  check(!!acc!.probationUntil && acc!.probationUntil.getTime() > Date.now() + 13 * 24 * H, "Annahme startet 14 Tage Probezeit");
  await db.application.update({ where: { id: app3.id }, data: { probationUntil: new Date(Date.now() + 24 * H) } });
  const sum = await collectDailySummary(db, { staleDays: 3, escalateDays: 7 });
  check(sum.probation.some((p) => p.publicId === "NV-F-3"), "Probezeit-Ende steht in der Übersicht");

  // ── Discord verlassen → automatische Bot-Nachricht, einmal pro Austritt
  const a4 = await mk("Cleo", "100000000000000024");
  const app4 = await db.application.create({ data: { userId: a4.id, positionId: pos.id, status: "IN_REVIEW", publicId: "NV-F-4", submittedAt: new Date() } });
  const sys = () => db.message.count({ where: { applicationId: app4.id, direction: "SYSTEM" } });
  check((await applyGuildState(app4.id, false)) === "notified" && (await sys()) === 1, "Austritt → Bot-Nachricht im Portal");
  check((await applyGuildState(app4.id, false)) === null && (await sys()) === 1, "Kein zweites Mal beim selben Austritt");
  check((await collectDailySummary(db, { staleDays: 3, escalateDays: 7 })).leftGuild.some((x) => x.publicId === "NV-F-4"), "Steht in der Team-Übersicht");
  check((await applyGuildState(app4.id, true)) === "back" && !(await db.application.findUnique({ where: { id: app4.id } }))!.guildLeftNotifiedAt, "Rückkehr setzt zurück");
  check((await applyGuildState(app4.id, false)) === "notified" && (await sys()) === 2, "Erneuter Austritt → neue Nachricht");
  const msg = await db.message.findFirst({ where: { applicationId: app4.id, direction: "SYSTEM" } });
  check(!!msg && msg.deliveryStatus === "NOT_SENT" && msg.body.includes("discord.gg"), "Nachricht mit Einladung, ohne DM-Versuch");
  await changeStatus({ applicationId: app4.id, to: "REJECTED", actorId: team.id });
  await db.application.update({ where: { id: app4.id }, data: { guildLeftNotifiedAt: null } });
  check((await applyGuildState(app4.id, false)) === null, "Abgeschlossene Bewerbung bekommt keine Nachricht");

  // ── Feedback (eins pro Bewerbung)
  await db.feedback.create({ data: { applicationId: app1.id, rating: 5 } });
  dup = false;
  try { await db.feedback.create({ data: { applicationId: app1.id, rating: 1 } }); } catch { dup = true; }
  check(dup, "Ein Feedback pro Bewerbung");
} finally {
  await db.$runCommandRaw({ dropDatabase: 1 }).catch(() => {});
  await db.$disconnect();
}
console.log(fails ? `\n${fails} Fehler` : "\nAlles grün");
process.exit(fails ? 1 : 0);
