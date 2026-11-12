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
  check(!(await db.application.findUnique({ where: { id: app1.id } }))!.interviewAt, "Ablehnung leert den selbst gebuchten Termin");

  // ── Zweites Gespräch: Gespräch → In Prüfung → Gespräch, dann neu buchen
  const appR = await db.application.create({ data: { userId: a1.id, positionId: pos.id, status: "INTERVIEW", publicId: "NV-F-R", submittedAt: new Date() } });
  await bookSlot(db, { userId: a1.id, applicationId: appR.id, slotId: s1.id });
  await changeStatus({ applicationId: appR.id, to: "IN_REVIEW", actorId: team.id });
  const r1 = await db.application.findUnique({ where: { id: appR.id } });
  check(!r1!.interviewAt && !r1!.interviewRemindedFor && !(await db.interviewSlot.findUnique({ where: { id: s1.id } }))!.applicationId, "Verlassen von „Gespräch“ leert interviewAt und gibt Slot frei");
  await changeStatus({ applicationId: appR.id, to: "INTERVIEW", actorId: team.id });
  await bookSlot(db, { userId: a1.id, applicationId: appR.id, slotId: s2.id });
  check((await db.interviewSlot.findUnique({ where: { id: s2.id } }))!.applicationId === appR.id, "Im zweiten Gespräch kann wieder gebucht werden");
  // Vom Team fest gesetzter Termin (ohne Slot) bleibt beim Statuswechsel
  const fixedAt = new Date(Date.now() + 48 * H);
  await db.interviewSlot.updateMany({ where: { applicationId: appR.id }, data: { applicationId: null, bookedAt: null } });
  await db.application.update({ where: { id: appR.id }, data: { interviewAt: fixedAt } });
  await changeStatus({ applicationId: appR.id, to: "IN_REVIEW", actorId: team.id });
  check((await db.application.findUnique({ where: { id: appR.id } }))!.interviewAt?.getTime() === fixedAt.getTime(), "Fester Team-Termin bleibt erhalten");
  // Alter, vergangener Termin wird beim erneuten Gespräch vergessen
  const pastSlot = await db.interviewSlot.create({ data: { startsAt: new Date(Date.now() - 48 * H), applicationId: appR.id, bookedAt: new Date(Date.now() - 72 * H) } });
  await db.application.update({ where: { id: appR.id }, data: { interviewAt: pastSlot.startsAt, interviewRemindedFor: pastSlot.startsAt } });
  await changeStatus({ applicationId: appR.id, to: "INTERVIEW", actorId: team.id });
  const r2 = await db.application.findUnique({ where: { id: appR.id }, include: { slot: true } });
  check(!r2!.interviewAt && !r2!.slot, "Erneut „Gespräch“: vergangener Termin wird gelöst");
  await changeStatus({ applicationId: appR.id, to: "REJECTED", actorId: team.id });
  await db.application.delete({ where: { id: appR.id } });

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
  // Voll geschlossen mit geplantem Startdatum → Startdatum wird geleert (sonst öffnet der Cron die volle Stelle wieder)
  await db.position.update({ where: { id: pos.id }, data: { status: "OPEN", opensAt: new Date(Date.now() - H) } });
  await closeIfFull(db, pos.id);
  const full = await db.position.findUnique({ where: { id: pos.id } });
  check(full!.status === "CLOSED" && !full!.opensAt && (await applyPositionSchedule(db)).length === 0, "Höchstzahl leert Startdatum, Cron öffnet nicht wieder");

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
  {
    const logs = () => db.outboxJob.count({ where: { applicationId: app4.id, type: "CHANNEL_MESSAGE" } });
    const l0 = await logs();
    const res = await Promise.all([applyGuildState(app4.id, true), applyGuildState(app4.id, true), applyGuildState(app4.id, true)]);
    check(res.filter((r) => r === "back").length === 1 && !(await db.application.findUnique({ where: { id: app4.id } }))!.guildLeftNotifiedAt, "Rückkehr setzt zurück – nur einmal, auch gleichzeitig");
    check((await logs()) - l0 <= 1, "Höchstens ein „wieder da“-Log");
  }
  check((await applyGuildState(app4.id, false)) === "notified" && (await sys()) === 2, "Erneuter Austritt → neue Nachricht");
  const msg = await db.message.findFirst({ where: { applicationId: app4.id, direction: "SYSTEM" } });
  check(!!msg && msg.deliveryStatus === "NOT_SENT" && msg.body.includes("discord.gg"), "Nachricht mit Einladung, ohne DM-Versuch");
  await changeStatus({ applicationId: app4.id, to: "REJECTED", actorId: team.id });
  await db.application.update({ where: { id: app4.id }, data: { guildLeftNotifiedAt: null } });
  check((await applyGuildState(app4.id, false)) === null, "Abgeschlossene Bewerbung bekommt keine Nachricht");

  // ── Erinnerung an liegengebliebene Entwürfe (einmal, nur offene Stelle, nicht gesperrt)
  {
    const { sendDraftReminders } = await import("../src/lib/applications/draft-reminder");
    const pd = await db.position.create({ data: { typeId: type.id, slug: "drafts", title: "Drafts", tagline: "x", description: "x", status: "OPEN" } });
    const pc = await db.position.create({ data: { typeId: type.id, slug: "drafts-zu", title: "Zu", tagline: "x", description: "x", status: "CLOSED" } });
    const d1 = await mk("Dora", "100000000000000031");
    const d2 = await mk("Emil", "100000000000000032");
    const later = new Date(Date.now() + 5 * 24 * H); // „in 5 Tagen“ statt alte updatedAt-Werte zu fälschen
    const draftOld = await db.application.create({ data: { userId: d1.id, positionId: pd.id, status: "DRAFT" } });
    await db.application.create({ data: { userId: d1.id, positionId: pc.id, status: "DRAFT" } });
    await db.application.create({ data: { userId: d2.id, positionId: pd.id, status: "DRAFT" } });
    await db.userBan.create({ data: { subjectId: d2.id, reason: "Test" } });
    const before = await db.outboxJob.count({ where: { type: "DM" } });
    const n1 = await sendDraftReminders(db, { now: later });
    const n2 = await sendDraftReminders(db, { now: later });
    check(n1 === 1 && n2 === 0 && (await db.outboxJob.count({ where: { type: "DM" } })) - before === 1, `Entwurfs-Erinnerung genau einmal, nur offene Stelle & ungesperrt (${n1}/${n2})`);
    check(!!(await db.application.findUnique({ where: { id: draftOld.id } }))!.draftRemindedAt, "draftRemindedAt gesetzt");
    check((await sendDraftReminders(db)) === 0, "Frischer Entwurf: keine Erinnerung");
  }

  // ── Persönliche Morgen-DM an Betreuer
  {
    const { sendPersonalDigests } = await import("../src/lib/team/daily-summary");
    const t2 = await mk("Kira", "100000000000000041", { isTeam: true });
    const t3 = await mk("Lars", "100000000000000042", { isTeam: true, digestOptOut: true });
    const p1 = await mk("Pia", "100000000000000043");
    const ca = await db.application.create({ data: { userId: p1.id, positionId: pos.id, status: "IN_REVIEW", publicId: "NV-F-D1", submittedAt: new Date(), claimedById: t2.id } });
    await db.message.create({ data: { applicationId: ca.id, direction: "APPLICANT_TO_TEAM", body: "Hallo?" } });
    const p2u = await mk("Ole", "100000000000000044");
    const cb = await db.application.create({ data: { userId: p2u.id, positionId: pos.id, status: "IN_REVIEW", publicId: "NV-F-D2", submittedAt: new Date(), claimedById: t3.id } });
    await db.message.create({ data: { applicationId: cb.id, direction: "APPLICANT_TO_TEAM", body: "Hallo?" } });
    const dmTo = async (discordId: string) => (await db.outboxJob.findMany({ where: { type: "DM" } })).filter((j) => (j.payload as { discordUserId?: string }).discordUserId === discordId).length;
    const n1 = await sendPersonalDigests(db);
    const n2 = await sendPersonalDigests(db);
    check(n2 === 0 && (await dmTo(t2.discordId)) === 1, `Betreuer bekommt genau eine Morgen-DM (${n1}/${n2})`);
    check((await dmTo(t3.discordId)) === 0, "Abgeschaltet → keine DM");
    check((await dmTo(team.discordId)) === 0, "Ohne offene Punkte → keine DM");
  }

  // ── Suche über Antworten
  {
    const { searchAnswers } = await import("../src/lib/team/answer-search");
    await db.answer.createMany({
      data: [
        { applicationId: app1.id, sectionTitle: "Über dich", label: "Erfahrung", type: "LONG_TEXT", value: "Zwei Jahre Moderation auf einem RP-Server" },
        { applicationId: app1.id, sectionTitle: "Über dich", label: "Programme", type: "MULTI_SELECT", value: ["Discord", "TeamSpeak"] },
        { applicationId: app2.id, sectionTitle: "Über dich", label: "Erfahrung", type: "LONG_TEXT", value: "Noch nie im Team gewesen (a.b)" },
      ],
    });
    const t0 = Date.now();
    const h1 = await searchAnswers(db, "moderation");
    check(h1.size === 1 && h1.get(app1.id)?.[0].match === "Moderation" && Date.now() - t0 < 1000, "Antwortsuche findet Teilwort, ohne Groß/Klein, < 1 s");
    check((await searchAnswers(db, "teamspeak")).has(app1.id), "Antwortsuche findet Auswahl-Antworten");
    check((await searchAnswers(db, "a.b")).size === 1 && (await searchAnswers(db, ".*")).size === 0, "Regex-Zeichen sind entschärft");
  }

  // ── Regel-Quiz: Auswertung beim Absenden, Lösung nie im Formular
  {
    const { submitApplication } = await import("../src/lib/applications/service");
    const { getFormDefinition } = await import("../src/lib/data/positions");
    const pq = await db.position.create({ data: { typeId: type.id, slug: "quiz", title: "Quiz", tagline: "x", description: "x", quizMinScore: 2 } });
    const sec = await db.formSection.create({ data: { typeId: type.id, positionId: pq.id, title: "Regeln", sortOrder: 1 } });
    const q1 = await db.question.create({ data: { sectionId: sec.id, label: "Was ist RDM?", type: "QUIZ", options: ["Erlaubt", "Verboten"], correctOption: "Verboten", sortOrder: 1 } });
    const q2 = await db.question.create({ data: { sectionId: sec.id, label: "Darf man metagamen?", type: "QUIZ", options: ["Ja", "Nein"], correctOption: "Nein", sortOrder: 2 } });
    const form = await getFormDefinition(pq);
    check(!JSON.stringify(form).includes("correctOption") && !JSON.stringify(form).includes("Verboten\"}"), "Formular enthält keine Lösung");
    const qu = await mk("Quinn", "100000000000000051");
    const draft = await db.application.create({ data: { userId: qu.id, positionId: pq.id, status: "DRAFT", createdAt: new Date(Date.now() - 3600_000) } });
    const r = await submitApplication(
      { ...qu, avatar: null },
      { draftId: draft.id, age: 20, data: { [q1.id]: "Verboten", [q2.id]: "Ja" }, confirmations: { voice: true, rules: true, truth: true, privacy: true } },
    );
    const done = await db.application.findUnique({ where: { id: r.applicationId }, include: { answers: true } });
    check(done!.quizCorrect === 1 && done!.quizTotal === 2, `Quiz ausgewertet: ${done!.quizCorrect}/${done!.quizTotal}`);
    check(done!.answers.find((a) => a.questionId === q1.id)?.correct === true && done!.answers.find((a) => a.questionId === q2.id)?.correct === false, "Pro Antwort richtig/falsch gespeichert");
  }

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
