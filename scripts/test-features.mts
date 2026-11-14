/**
 * Integrationstest (Wegwerf-DB) für Termine, Bewertungen, Stellen-Automatik,
 * Einarbeitung/Probezeit, Feedback und Team-Übersicht. Kein Discord-Versand.
 *
 *   npm run db:dev
 *   npm run db:test-features
 */
import "dotenv/config";
import { freshTestDatabase } from "./test-db";
const testDb = await freshTestDatabase("features");
process.env.DISCORD_BOT_TOKEN = ""; // nichts an Discord schicken
process.env.DISCORD_GUILD_ID ||= "523456789012345678"; // für Rollen-Jobs (werden nur angelegt, nie ausgeführt)
const { db } = await import("../src/lib/db");
const { bookSlot, sendInterviewReminders, SlotError } = await import("../src/lib/team/slots");
const { changeStatus } = await import("../src/lib/team/service");
const { applyPositionSchedule, closeIfFull } = await import("../src/lib/positions/schedule");
const { collectDailySummary } = await import("../src/lib/team/daily-summary");
const { applyGuildState } = await import("../src/lib/applications/guild-watch");
let fails = 0;
const check = (ok: boolean, m: string) => { console.log(ok ? "✓" : "✗", m); if (!ok) fails++; };
const H = 3_600_000;
try {
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
  // Phase-2-Hürde: ohne Bewertung bzw. unter 3 Sternen nicht ins Gespräch
  let gateErr = "";
  try { await changeStatus({ applicationId: appR.id, to: "INTERVIEW", actorId: team.id }); } catch (e) { gateErr = (e as Error).message; }
  check(gateErr.includes("erst nach der Bewertung"), "Ohne Bewertung kein Gespräch (Phase 2)");
  const low = await db.rating.create({ data: { applicationId: appR.id, userId: team.id, scores: { kommunikation: 2, motivation: 3 } } });
  gateErr = "";
  try { await changeStatus({ applicationId: appR.id, to: "INTERVIEW", actorId: team.id }); } catch (e) { gateErr = (e as Error).message; }
  check(gateErr.includes("Unter 3"), "Team-Schnitt 2,5 → kein Gespräch");
  await db.rating.update({ where: { id: low.id }, data: { scores: { kommunikation: 3, motivation: 4 } } });
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
  // Bewerber sagt selbst ab (Knopf in der DM / im Portal)
  {
    const { cancelInterviewByApplicant } = await import("../src/lib/team/slots");
    const cs = await db.interviewSlot.create({ data: { startsAt: new Date(Date.now() + 72 * H) } });
    await bookSlot(db, { userId: a1.id, applicationId: appR.id, slotId: cs.id });
    const stale = await cancelInterviewByApplicant(db, { applicationId: appR.id, discordId: a1.discordId, expectAt: Math.floor(cs.startsAt.getTime() / 1000) - 3600 });
    check(!stale.ok && (await db.application.findUniqueOrThrow({ where: { id: appR.id } })).interviewAt !== null, "Alter DM-Knopf (anderer Termin) sagt nichts ab");
    const foreign = await cancelInterviewByApplicant(db, { applicationId: appR.id, userId: a2.id });
    check(!foreign.ok, "Fremde Person kann den Termin nicht absagen");
    const c1 = await cancelInterviewByApplicant(db, { applicationId: appR.id, discordId: a1.discordId });
    const after1 = await db.application.findUniqueOrThrow({ where: { id: appR.id } });
    check(c1.ok && !after1.interviewAt && after1.status === "INTERVIEW", "Absage: Termin leer, Status bleibt Gespräch");
    check(!(await db.interviewSlot.findUniqueOrThrow({ where: { id: cs.id } })).applicationId, "Absage: Slot wieder frei");
    check(!!(await db.message.findFirst({ where: { applicationId: appR.id, direction: "SYSTEM", body: { contains: "abgesagt" } } })), "Absage: Hinweis im Portal");
    const c2 = await cancelInterviewByApplicant(db, { applicationId: appR.id, discordId: a1.discordId });
    check(!c2.ok, "Zweite Absage ohne Termin wird abgelehnt");
  }
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
      { draftId: draft.id, age: 20, data: { [q1.id]: "Verboten", [q2.id]: "Ja" }, confirmations: { voice: true, rules: true, unpaid: true, truth: true, privacy: true } },
    );
    const done = await db.application.findUnique({ where: { id: r.applicationId }, include: { answers: true } });
    check(done!.quizCorrect === 1 && done!.quizTotal === 2, `Quiz ausgewertet: ${done!.quizCorrect}/${done!.quizTotal}`);
    check(done!.answers.find((a) => a.questionId === q1.id)?.correct === true && done!.answers.find((a) => a.questionId === q2.id)?.correct === false, "Pro Antwort richtig/falsch gespeichert");
  }

  // ── Testbewerbungen: pro Stelle und Szenario, sicher (keine DMs), löschbar
  {
    const { createTestApplications, deleteTestApplications, TEST_SCENARIO_KEYS } = await import("../src/lib/setup/test-applications");
    const { getFormDefinition } = await import("../src/lib/data/positions");
    const { getAccess } = await import("../src/lib/auth/user-access");
    const { countingWhere } = await import("../src/lib/positions/schedule");
    const pt = await db.position.create({ data: { typeId: type.id, slug: "testpos", title: "Testpos", tagline: "x", description: "x", minAge: 16 } });
    const st = await db.formSection.create({ data: { typeId: type.id, positionId: pt.id, title: "Fach", sortOrder: 1 } });
    await db.question.create({ data: { sectionId: st.id, label: "Erfahrung?", type: "LONG_TEXT", minLength: 80, sortOrder: 1 } });
    await db.question.create({ data: { sectionId: st.id, label: "Jemand beleidigt dich im Ticket – was tust du?", type: "SCENARIO", minLength: 80, sortOrder: 2 } });
    for (const [k, l] of ["Was reizt dich am Team?", "Wie gehst du mit Kritik um?", "Was machst du bei Stress?", "Wie erklärst du Neulingen die Regeln?"].entries())
      await db.question.create({ data: { sectionId: st.id, label: l, type: "LONG_TEXT", minLength: 80, sortOrder: 10 + k } });
    await db.question.create({ data: { sectionId: st.id, label: "Was ist RDM?", type: "QUIZ", options: ["Erlaubt", "Verboten"], correctOption: "Verboten", sortOrder: 3 } });
    const realCount = await db.application.count({ where: countingWhere(pt.id) });
    const created = await createTestApplications(db, getFormDefinition, { positionIds: [pt.id], scenarios: TEST_SCENARIO_KEYS, actorId: team.id });
    check(created.length === TEST_SCENARIO_KEYS.length && created.every((c) => c.publicId.startsWith("TEST-")), `Eine Testbewerbung pro Szenario (${created.length})`);
    const apps = await db.application.findMany({ where: { id: { in: created.map((c) => c.id) } }, include: { user: true, answers: true } });
    const SC: Record<string, string> = { "Test Vorbildlich": "stark", "Test Solide": "solide", "Test Knapp": "knapp", "Test Beleidigend": "beleidigend", "Test Manipulation": "manipulation", "Test Kopie": "kopie", "Test Neuling": "neu", "Test Grenzfall": "alter", "Test Name": "name" };
    const by = (label: string) => apps.find((a) => a.testScenario === SC[label])!;
    const codes = (a: (typeof apps)[number]) => (a.flags as { code: string }[]).map((f) => f.code);
    check(codes(by("Test Knapp")).includes("short_answers"), "Knapp → Hinweis kurze Antworten");
    check(codes(by("Test Kopie")).includes("similar_to_other"), "Kopie → Ähnlichkeits-Hinweis");
    check(codes(by("Test Neuling")).join(",") === "young_account", `Neuer Account → nur Hinweis junger Account (${codes(by("Test Neuling")).join(",")})`);
    check(!codes(by("Test Grenzfall")).includes("similar_to_other") && !codes(by("Test Vorbildlich")).length, "Andere Szenarien ohne falsche Hinweise");
    check(apps.every((a) => !codes(a).includes("duplicate_answers")), "Keine „identische Antwort“ innerhalb einer Bewerbung");
    check(codes(by("Test Name")).join(",") === "inappropriate_name", `Unpassender Name → nur Namens-Hinweis (${by("Test Name").user.globalName}: ${codes(by("Test Name")).join(",")})`);
    check(apps.filter((a) => a.testScenario !== "name").every((a) => !codes(a).includes("inappropriate_name") && !/^Test /.test(a.user.globalName ?? "")), "Realistische Namen ohne Namens-Hinweis");
    check(by("Test Grenzfall").age === 16, "Grenzfall Alter = Mindestalter der Stelle");
    check(by("Test Vorbildlich").quizCorrect === 1 && by("Test Beleidigend").quizCorrect === 0, "Quiz je nach Szenario richtig/falsch");
    check(by("Test Manipulation").answers.some((a) => String(a.value).includes("Ignoriere alle vorherigen Anweisungen")), "Manipulationsversuch steht in den Antworten");
    check(apps.every((a) => a.isTest && a.user.isTest && a.user.discordId.startsWith("0000")), "Als Test markiert, Discord-ID 0000…");
    check((await db.application.count({ where: countingWhere(pt.id) })) === realCount, "Zählt nicht für die Höchstzahl");
    check((await getAccess(by("Test Solide").user)).inGuild === true, "Kein Discord-Abfrage, gilt als auf dem Server");
    check((await db.application.count({ where: { isTest: { not: true }, positionId: pt.id } })) === 0 && (await db.application.count({ where: { isTest: { not: true } } })) > 0, "isTest-Filter trifft echte Bewerbungen");
    // Nachricht an Testbewerber → Job wird übersprungen, nicht verschickt
    const { sendTeamMessage } = await import("../src/lib/team/service");
    const { processJob } = await import("../src/lib/discord/outbox");
    const { prismaOutboxStore } = await import("../src/lib/discord/outbox-db");
    const msg = await sendTeamMessage({ applicationId: by("Test Solide").id, actor: { ...team, isAdmin: false }, title: "Hallo", body: "Moin, Test!", templateIds: [] });
    const dmJob = await db.outboxJob.findFirst({ where: { messageId: msg.messageId, type: "DM" } });
    await processJob(dmJob!, { openDm: async () => { throw new Error("darf nicht aufgerufen werden"); } } as never, prismaOutboxStore);
    check((await db.message.findUnique({ where: { id: msg.messageId } }))!.deliveryStatus === "NOT_SENT", "DM an Testbewerber wird nicht verschickt");
    const del = await deleteTestApplications(db);
    check(del.applications === created.length && (await db.user.count({ where: { isTest: true } })) === 0, `Löschen entfernt alles (${del.applications}/${del.users})`);
  }

  // ── Nachtruhe: DMs/Team-Posts warten, Bestätigung & Nacht-Antwort sofort
  {
    const { saveSettings } = await import("../src/lib/settings");
    const { berlinMinutes } = await import("../src/lib/night");
    const { enqueue, runOutbox } = await import("../src/lib/discord/outbox-db");
    const { setDiscordApiForTests } = await import("../src/lib/discord/client");
    const { maybeAutoReply } = await import("../src/lib/ai/autoreply");
    const hhmm = (m: number) => `${String(Math.floor(((m + 1440) % 1440) / 60)).padStart(2, "0")}:${String((m + 1440) % 60).padStart(2, "0")}`;
    const m = berlinMinutes(new Date());
    await saveSettings({ "night.enabled": true, "night.start": hhmm(m - 60), "night.end": hhmm(m + 120), "night.aiReply": true, "night.held": ["changelog", "draft_reminder", "notify", "team_message"] }, team.id);
    const sent: string[] = [];
    setDiscordApiForTests({
      getMember: async () => null,
      openDm: async (u: string) => `dm-${u}`,
      postMessage: async (ch: string) => (sent.push(ch), "msg"),
      editMessage: async () => {},
      deleteMessage: async () => {},
      addRole: async () => {},
      removeRole: async () => {},
      setNick: async () => {},
      startThread: async () => "t",
      archiveThread: async () => {},
    });
    const held = await enqueue({ type: "DM", discordUserId: a1.discordId, purpose: "team_message", message: { content: "x" } });
    const post = await enqueue({ type: "CHANNEL_MESSAGE", kind: "changelog", channelId: "123456789012345678", message: { content: "x" } });
    const log = await enqueue({ type: "CHANNEL_MESSAGE", kind: "botlog", channelId: "123456789012345678", message: { content: "x" } });
    const conf = await enqueue({ type: "DM", discordUserId: a2.discordId, purpose: "confirmation", message: { content: "x" } });
    await runOutbox({ ids: [held.id, post.id, conf.id, log.id] });
    const jobs = await db.outboxJob.findMany({ where: { id: { in: [held.id, post.id, conf.id, log.id] } } });
    const st = (id: string) => jobs.find((j) => j.id === id)!;
    check(st(held.id).status === "PENDING" && st(held.id).runAt > new Date(Date.now() + 60 * 60_000), "Nachts: als „warten“ eingestellte Art wartet bis Ende der Nachtruhe");
    check(st(post.id).status === "PENDING", "Nachts: Changelog-Post wartet");
    check(st(log.id).status === "DONE", "Nachts: Bot-Log geht sofort raus");
    check(st(conf.id).status === "DONE", "Nachts: Bestätigung nach dem Absenden geht sofort raus");
    // Bewerber schreibt nachts → Nacht-Antwort (KI aus → feste Antwort) sofort
    const nUser = await mk("Nora", "100000000000000061");
    const appN = await db.application.create({ data: { userId: nUser.id, positionId: pos.id, status: "SUBMITTED", publicId: "NV-F-N", submittedAt: new Date() } });
    await db.user.update({ where: { id: team.id }, data: { lastTeamActiveAt: new Date() } }); // Team wirkt „online“
    const q = await db.message.create({ data: { applicationId: appN.id, direction: "APPLICANT_TO_TEAM", body: "Wann meldet ihr euch?" } });
    const r = await maybeAutoReply(q.id);
    const reply = r.kind !== "skipped" ? await db.message.findUnique({ where: { id: r.messageId } }) : null;
    check(r.kind === "static" && !!reply?.body.includes("Nachtruhe") && reply.deliveryStatus === "SENT", `Nachts antwortet der Bot sofort, auch wenn das Team online wirkt (${r.kind})`);
    await saveSettings({ "night.enabled": false }, team.id);
    const later = await db.message.create({ data: { applicationId: appN.id, direction: "APPLICANT_TO_TEAM", body: "Noch da?" } });
    check((await maybeAutoReply(later.id)).kind === "skipped", "Tagsüber (Auto-Antwort aus) antwortet niemand automatisch");
    setDiscordApiForTests(null);
  }

  // ── Ideen-Paket: Rückfrage, Vier-Augen, Verteilung, Zuständigkeit, Termin-Abgleich, Bann, Alarm, Bericht, Sicherung
  {
    const { saveSettings } = await import("../src/lib/settings");
    const { sendTeamMessage } = await import("../src/lib/team/service");
    const { sendFollowUpReminders } = await import("../src/lib/applications/followup");
    const { collectDailySummary } = await import("../src/lib/team/daily-summary");
    const D = 86_400_000;
    const mkApp = async (n: string, id: string, data: Record<string, unknown> = {}) => {
      const u = await mk(n, id);
      return db.application.create({ data: { userId: u.id, positionId: pos.id, status: "IN_REVIEW", publicId: `NV-I-${id.slice(-3)}`, submittedAt: new Date(), ...data } });
    };

    // #1 Rückfrage mit Frist
    const fa = await mkApp("Fiona", "100000000000000071");
    await sendTeamMessage({ applicationId: fa.id, actor: { ...team, isAdmin: false }, title: "Frage", body: "Wann hast du Zeit?", templateIds: [], expectReply: true });
    check(!!(await db.application.findUnique({ where: { id: fa.id } }))!.awaitingReplySince, "Rückfrage: Frist läuft");
    const r1 = await sendFollowUpReminders(db, new Date(Date.now() + 4 * D));
    const r2 = await sendFollowUpReminders(db, new Date(Date.now() + 5 * D));
    check(r1 === 1 && r2 === 0 && (await db.message.count({ where: { applicationId: fa.id, direction: "SYSTEM" } })) === 1, `Rückfrage: genau eine Erinnerung, nur an diese Bewerbung (${r1}/${r2})`);
    const sum = await collectDailySummary(db, { now: new Date(Date.now() + 8 * D), staleDays: 3, escalateDays: 30, closeDays: 7 });
    check(!!sum.noReply?.some((x) => x.id === fa.id) && !sum.stale.some((x) => x.id === fa.id), "Rückfrage: nach 7 Tagen „schließen?“ in der Übersicht");

    // #3 Vier-Augen-Prinzip
    const p4 = await db.position.create({ data: { typeId: type.id, slug: "vieraugen", title: "Vier", tagline: "x", description: "x", minProVotes: 2, requireAdminApproval: true } });
    const admin = await mk("Ada", "100000000000000072", { isTeam: true, isAdmin: true });
    const va = await db.application.create({ data: { userId: (await mk("Vera", "100000000000000073")).id, positionId: p4.id, status: "INTERVIEW", publicId: "NV-I-VA", submittedAt: new Date() } });
    let e1 = "";
    try { await changeStatus({ applicationId: va.id, to: "ACCEPTED", actorId: team.id }); } catch (e) { e1 = String(e); }
    check(e1.includes("nur ein Admin"), "Vier-Augen: Nicht-Admin darf nicht annehmen");
    let e2 = "";
    try { await changeStatus({ applicationId: va.id, to: "ACCEPTED", actorId: admin.id }); } catch (e) { e2 = String(e); }
    check(e2.includes("mindestens 2 Pro-Stimmen"), "Vier-Augen: zu wenige Pro-Stimmen");
    await db.vote.createMany({ data: [{ applicationId: va.id, userId: admin.id, value: "PRO" }, { applicationId: va.id, userId: team.id, value: "PRO" }] });
    await changeStatus({ applicationId: va.id, to: "ACCEPTED", actorId: admin.id });
    check((await db.application.findUnique({ where: { id: va.id } }))!.status === "ACCEPTED", "Vier-Augen: mit 2 Pro + Admin angenommen");

    // #5 Zuständigkeit pro Stelle
    const { canAccessApplication, hiddenPositionIds } = await import("../src/lib/team/visibility");
    const p5 = await db.position.create({ data: { typeId: type.id, slug: "nur-mod", title: "Nur Mod", tagline: "x", description: "x", teamRoleIds: ["900000000000000001"] } });
    const a5 = await db.application.create({ data: { userId: (await mk("Malte", "100000000000000074")).id, positionId: p5.id, status: "SUBMITTED", publicId: "NV-I-M", submittedAt: new Date() } });
    check((await hiddenPositionIds({ isAdmin: false, roleIds: [] })).includes(p5.id) && !(await canAccessApplication({ isAdmin: false, roleIds: [] }, a5.id)), "Zuständigkeit: ohne Rolle kein Zugriff");
    check(await canAccessApplication({ isAdmin: false, roleIds: ["900000000000000001"] }, a5.id), "Zuständigkeit: mit Rolle Zugriff");
    check(await canAccessApplication({ isAdmin: true, roleIds: [] }, a5.id), "Zuständigkeit: Admin sieht alles");

    // #4 Faire Verteilung
    const { autoAssign } = await import("../src/lib/team/assign");
    await saveSettings({ "team.autoAssign": true }, team.id);
    const busy = await mk("Busy", "100000000000000075", { isTeam: true, lastTeamActiveAt: new Date() });
    const free = await mk("Free", "100000000000000076", { isTeam: true, lastTeamActiveAt: new Date() });
    await db.user.update({ where: { id: team.id }, data: { lastTeamActiveAt: new Date(Date.now() - 30 * D) } });
    await db.user.update({ where: { id: admin.id }, data: { lastTeamActiveAt: new Date(Date.now() - 30 * D) } });
    await mkApp("Load1", "100000000000000077", { claimedById: busy.id, claimedAt: new Date() });
    const na = await mkApp("Neu", "100000000000000078", { status: "SUBMITTED" });
    const res = await autoAssign(db, na.id);
    check(res?.userId === free.id, `Verteilung: geht an den mit den wenigsten offenen (${res?.userId === free.id ? "Free" : res?.userId})`);
    const p5app = await db.application.create({ data: { userId: (await mk("Rolf", "100000000000000079")).id, positionId: p5.id, status: "SUBMITTED", publicId: "NV-I-R", submittedAt: new Date() } });
    check((await autoAssign(db, p5app.id)) === null, "Verteilung: niemand zuständig → keine Zuteilung");
    await saveSettings({ "team.autoAssign": false }, team.id);

    // #2 Termin-Abgleich: Erinnerung an den Betreuer
    const { syncInterview } = await import("../src/lib/team/interview-sync");
    const ia = await mkApp("Ines", "100000000000000080", { status: "INTERVIEW", interviewAt: new Date(Date.now() + 3 * D), claimedById: free.id, claimedAt: new Date() });
    await syncInterview(ia.id);
    const i1 = await db.application.findUnique({ where: { id: ia.id } });
    const job1 = i1!.teamReminderJobId ? await db.outboxJob.findUnique({ where: { id: i1!.teamReminderJobId } }) : null;
    check(!!job1 && Math.abs(job1.runAt.getTime() - (i1!.interviewAt!.getTime() - 15 * 60_000)) < 1000, "Termin: Erinnerung an den Betreuer 15 min vorher geplant");
    await db.application.update({ where: { id: ia.id }, data: { interviewAt: new Date(Date.now() + 4 * D) } });
    await syncInterview(ia.id);
    const i2 = await db.application.findUnique({ where: { id: ia.id } });
    check(!(await db.outboxJob.findUnique({ where: { id: job1!.id } })) && i2!.teamReminderJobId !== job1!.id, "Termin verschoben: alte Erinnerung weg, neue geplant");
    await changeStatus({ applicationId: ia.id, to: "REJECTED", actorId: team.id });
    check(!(await db.application.findUnique({ where: { id: ia.id } }))!.teamReminderJobId, "Absage: Erinnerung gelöscht");

    // #9 Bann erkannt (Discord-Antwort simuliert)
    const { setDiscordApiForTests } = await import("../src/lib/discord/client");
    const { applyGuildState } = await import("../src/lib/applications/guild-watch");
    process.env.DISCORD_GUILD_ID = "1";
    setDiscordApiForTests({ getMember: async () => null, openDm: async () => "d", postMessage: async () => "m", editMessage: async () => {}, deleteMessage: async () => {}, addRole: async () => {}, removeRole: async () => {}, setNick: async () => {}, startThread: async () => "t", archiveThread: async () => {}, getBan: async () => ({ reason: "Spam" }) });
    const ba = await mkApp("Bert", "100000000000000081");
    const rb = await applyGuildState(ba.id, false);
    const bApp = await db.application.findUnique({ where: { id: ba.id } });
    check(rb === "banned" && !!bApp!.guildBannedAt && (bApp!.flags as { code: string }[]).some((f) => f.code === "guild_banned"), "Bann: Bewerbung markiert");
    check((await db.message.count({ where: { applicationId: ba.id, direction: "SYSTEM" } })) === 0, "Bann: keine „tritt wieder bei“-Nachricht");
    check((await applyGuildState(ba.id, true)) === "back" && !(await db.application.findUnique({ where: { id: ba.id } }))!.guildBannedAt, "Entbannt und zurück: Markierung weg");
    setDiscordApiForTests(null);
    delete process.env.DISCORD_GUILD_ID;

    // #10 Störungs-Alarm & #11 Wochenbericht
    const { checkAlerts, beat } = await import("../src/lib/team/alerts");
    const { postWeeklyReport } = await import("../src/lib/team/weekly-report");
    await saveSettings({ "discord.leadChannelId": "123456789012345678", "alerts.failedThreshold": 3 }, team.id);
    for (let k = 0; k < 3; k++) await db.outboxJob.create({ data: { type: "DM", payload: {}, status: "FAILED", lastError: "DM geschlossen" } });
    await db.setting.upsert({ where: { key: "heartbeat:summary" }, create: { key: "heartbeat:summary", value: { at: new Date(Date.now() - 30 * 3_600_000).toISOString() } }, update: { value: { at: new Date(Date.now() - 30 * 3_600_000).toISOString() } } });
    const al1 = await checkAlerts(db, ["summary"]);
    const before = await db.outboxJob.count({ where: { type: "CHANNEL_MESSAGE" } });
    await checkAlerts(db, ["summary"]);
    check(al1.length === 2 && (await db.outboxJob.count({ where: { type: "CHANNEL_MESSAGE" } })) === before, `Alarm: Fehlschläge + ausgefallener Lauf, je einmal pro Tag (${al1.join(",")})`);
    await beat(db, "summary");
    const wid = await postWeeklyReport(db, { force: true });
    check(!!wid, "Wochenbericht wird gepostet");

    // #12 Sicherung: Export → Änderung → Vorschau → Einspielen
    const { exportConfig, importConfig, backupSchema } = await import("../src/lib/admin/config-backup");
    const backup = await exportConfig(db);
    check(backupSchema.safeParse(JSON.parse(JSON.stringify(backup))).success, "Sicherung: Export ist gültig");
    const b2 = JSON.parse(JSON.stringify(backup));
    b2.positions.find((x: { slug: string }) => x.slug === "support").title = "Support (neu)";
    b2.positions.push({ ...b2.positions[0], slug: "neu-aus-backup", title: "Neu" });
    const dry = await importConfig(db, b2, { dryRun: true, actorId: team.id });
    check((await db.position.findUnique({ where: { slug: "support" } }))!.title === "Support" && dry.positions.created === 1, "Sicherung: Vorschau ändert nichts");
    const done = await importConfig(db, b2, { dryRun: false, actorId: team.id });
    check(
      (await db.position.findUnique({ where: { slug: "support" } }))!.title === "Support (neu)" && !!(await db.position.findUnique({ where: { slug: "neu-aus-backup" } })) && done.questions.created === 0,
      `Sicherung: eingespielt, nichts doppelt (${JSON.stringify(done.questions)})`,
    );
  }

  // ── Regel-Quiz pro Stelle (Migration), Claim-Nachricht, Changelog sofort veröffentlichen
  {
    const { runMigrations } = await import("../src/lib/setup/migrations");
    const { POSITION_QUIZ } = await import("../src/lib/setup/quiz-questions");
    const mod = await db.position.create({ data: { typeId: type.id, slug: "moderator", title: "Moderator", tagline: "x", description: "x" } });
    await db.setting.deleteMany({ where: { key: "migration:2026-11-quiz-pro-stelle" } });
    await runMigrations(db);
    const qs = await db.formSection.findFirst({ where: { key: "moderator.quiz" }, include: { questions: true } });
    check(!!qs && qs.positionId === mod.id && qs.questions.length === 6 && qs.questions.every((q) => q.type === "QUIZ" && !!q.correctOption && q.options.includes(q.correctOption)), "Quiz-Migration: Moderator bekommt 6 Quizfragen mit Lösung");
    check(!!(await db.formSection.findFirst({ where: { key: "support.quiz" } })), "Quiz-Migration: Support bekommt sein Quiz");
    check(!(await db.formSection.findFirst({ where: { key: "media.quiz" } })), "Quiz-Migration: nicht vorhandene Stelle wird übersprungen");
    await db.setting.deleteMany({ where: { key: "migration:2026-11-quiz-pro-stelle" } });
    await runMigrations(db);
    check((await db.formSection.count({ where: { key: "moderator.quiz" } })) === 1 && (await db.question.count({ where: { key: { startsWith: "moderator.quiz_" } } })) === POSITION_QUIZ.moderator.questions.length, "Quiz-Migration: zweiter Lauf legt nichts doppelt an");
    const { getFormDefinition } = await import("../src/lib/data/positions");
    check(!JSON.stringify(await getFormDefinition(mod)).includes("correctOption"), "Quiz-Lösungen nicht im Formular");

    // Claim → Bewerber erfährt, wer betreut
    const { setClaim } = await import("../src/lib/team/service");
    const cu = await mk("Clara", "100000000000000091");
    const ca = await db.application.create({ data: { userId: cu.id, positionId: pos.id, status: "SUBMITTED", publicId: "NV-C-1", submittedAt: new Date() } });
    await setClaim({ applicationId: ca.id, actor: { ...team, isAdmin: false }, action: "claim" });
    const notes = await db.message.findMany({ where: { applicationId: ca.id, direction: "SYSTEM" } });
    check(notes.length === 1 && notes[0].body.includes("Jonas") && (await db.outboxJob.count({ where: { messageId: notes[0].id, type: "DM" } })) === 1, "Claim: Bewerber bekommt Nachricht + DM mit Betreuer");
    const lea2 = await mk("Leander", "100000000000000092", { isTeam: true });
    await setClaim({ applicationId: ca.id, actor: { ...lea2, isAdmin: false }, action: "claim" });
    check((await db.message.findMany({ where: { applicationId: ca.id, direction: "SYSTEM" }, orderBy: { createdAt: "desc" } }))[0].body.includes("ab sofort kümmert sich **Leander**"), "Übernahme: Bewerber erfährt den neuen Betreuer");

    // Changelog sofort veröffentlichen
    const { publishChangelogNow, changelogRule } = await import("../src/lib/discord/changelog-post");
    const { publishedEntries, todayBerlin, CHANGELOG } = await import("../src/lib/changelog");
    await publishChangelogNow(db, team.id);
    const rule = await changelogRule();
    const todays = CHANGELOG.filter((e) => e.date === todayBerlin());
    check(rule.through === todayBerlin() && todays.every((e) => publishedEntries(new Date(), rule).includes(e)), "Changelog: „Jetzt veröffentlichen“ macht den heutigen Eintrag sichtbar");
  }

  // ── Annahme: Plätze, Rollen, Präfix, Gruß · Claim-Erinnerung
  {
    const { saveSettings } = await import("../src/lib/settings");
    await saveSettings(
      { "discord.autoRoleOnAccept": true, "discord.acceptExtraRoleIds": "323456789012345678", "discord.welcomeChannelId": "423456789012345678", "interview.minStars": 0 },
      team.id,
    );
    const sp = await db.position.create({ data: { typeId: type.id, slug: "seats", title: "Plätze", tagline: "x", description: "x", status: "OPEN", seats: 1, acceptRoleId: "123456789012345678", nickPrefix: "[S]" } });
    const su = await mk("Sina", "100000000000000095");
    const sa = await db.application.create({ data: { userId: su.id, positionId: sp.id, status: "IN_REVIEW", publicId: "NV-S-1", submittedAt: new Date() } });
    await changeStatus({ applicationId: sa.id, to: "ACCEPTED", actorId: team.id });
    const spAfter = await db.position.findUniqueOrThrow({ where: { id: sp.id } });
    check(spAfter.seats === 0 && spAfter.status === "CLOSED", "Letzter Platz vergeben → Stelle automatisch geschlossen");
    const jobs = await db.outboxJob.findMany({ where: { applicationId: sa.id } });
    const types = jobs.map((j) => j.type);
    check(types.filter((t) => t === "ADD_ROLE").length === 2 && types.includes("SET_NICK"), "Annahme: Rolle der Stelle + Zusatzrolle + Namens-Präfix");
    check(jobs.some((j) => j.type === "CHANNEL_MESSAGE" && JSON.stringify(j.payload).includes("Willkommen im Team") && JSON.stringify(j.payload).includes('"users":["100000000000000095"]')), "Annahme: Willkommensgruß pingt nur die neue Person");
    await changeStatus({ applicationId: sa.id, to: "IN_REVIEW", actorId: team.id });
    const back = await db.outboxJob.findMany({ where: { applicationId: sa.id, type: { in: ["REMOVE_ROLE", "SET_NICK"] } } });
    check(back.filter((j) => j.type === "REMOVE_ROLE").length === 2 && back.filter((j) => j.type === "SET_NICK").length === 2, "Zurückgenommen: Rollen & Präfix werden entfernt");
    check((await db.position.findUniqueOrThrow({ where: { id: sp.id } })).seats === 1, "Zurückgenommen: Platz wieder frei");

    // Claim-Erinnerung: seit 4 Tagen betreut, nichts passiert → einmal DM
    const { nudgeIdleClaims } = await import("../src/lib/team/claim-nudge");
    const nu = await mk("Nora", "100000000000000096");
    const old = new Date(Date.now() - 4 * 86_400_000);
    const na = await db.application.create({ data: { userId: nu.id, positionId: pos.id, status: "SUBMITTED", publicId: "NV-N-1", submittedAt: old, claimedById: team.id, claimedAt: old } });
    const n1 = await nudgeIdleClaims(db);
    const n2 = await nudgeIdleClaims(db);
    check(n1 >= 1 && n2 === 0 && (await db.outboxJob.count({ where: { applicationId: na.id, type: "DM" } })) === 1, "Claim-Erinnerung: einmal DM an den Betreuer");
    await db.message.create({ data: { applicationId: na.id, direction: "TEAM_TO_APPLICANT", body: "Hi", authorId: team.id } });
    await db.application.update({ where: { id: na.id }, data: { claimRemindedAt: null } });
    check((await nudgeIdleClaims(db)) === 0, "Claim-Erinnerung: nicht, wenn seitdem geschrieben wurde");
    await saveSettings({ "discord.autoRoleOnAccept": false, "discord.acceptExtraRoleIds": "", "discord.welcomeChannelId": "", "interview.minStars": 3 }, team.id);
  }

  // ── Sprachkanal-Erkennung & Warteraum-Ping
  {
    const { saveSettings } = await import("../src/lib/settings");
    const { handleVoiceState, noShowSuspected } = await import("../src/lib/team/voice");
    await saveSettings({ "interview.voiceChannelId": "611111111111111111", "interview.waitingRoomChannelId": "622222222222222222" }, team.id);
    const vu = await mk("Vito", "100000000000000097");
    const at = new Date(Date.now() + 15 * 60_000);
    const va = await db.application.create({ data: { userId: vu.id, positionId: pos.id, status: "INTERVIEW", publicId: "NV-V-1", submittedAt: new Date(), interviewAt: at, claimedById: team.id, claimedAt: new Date() } });
    const w1 = await handleVoiceState(db, { discordId: vu.discordId, from: null, to: "622222222222222222" });
    const w2 = await handleVoiceState(db, { discordId: vu.discordId, from: "611111111111111111", to: "622222222222222222" });
    check(w1 === "waiting" && w2 === null && (await db.outboxJob.count({ where: { applicationId: va.id, type: "DM" } })) === 1, "Warteraum: Betreuer bekommt genau eine DM");
    check((await handleVoiceState(db, { discordId: vu.discordId, from: "622222222222222222", to: "611111111111111111" })) === "joined", "Gesprächskanal betreten wird erkannt");
    check((await handleVoiceState(db, { discordId: vu.discordId, from: "611111111111111111", to: null })) === "left", "Verlassen wird erkannt");
    check((await handleVoiceState(db, { discordId: vu.discordId, from: null, to: "611111111111111111" })) === "rejoined", "Wiederbeitritt nach Abbruch wird erkannt");
    check(!(await db.application.findUniqueOrThrow({ where: { id: va.id } })).voiceLeftAt, "Wiederbeitritt: „verlassen“ zurückgesetzt");
    await handleVoiceState(db, { discordId: vu.discordId, from: "611111111111111111", to: null });
    const after = await db.application.findUniqueOrThrow({ where: { id: va.id } });
    check(!!after.voiceJoinedAt && !!after.voiceLeftAt, "Beginn und Ende gespeichert");
    check(!noShowSuspected({ interviewAt: at, voiceJoinedAt: after.voiceJoinedAt, now: at.getTime() + 20 * 60_000, tracking: true }), "Kein „Nicht erschienen?“, wenn im Kanal gewesen");
    check(noShowSuspected({ interviewAt: at, voiceJoinedAt: null, now: at.getTime() + 20 * 60_000, tracking: true }), "„Nicht erschienen?“ nach 10 Minuten ohne Bewerber");
    check((await handleVoiceState(db, { discordId: "100000000000000098", from: null, to: "611111111111111111" })) === null, "Fremde ohne Gespräch: nichts passiert");
    await saveSettings({ "interview.voiceChannelId": "", "interview.waitingRoomChannelId": "" }, team.id);
  }

  // ── Probezeit-Abschluss & Pate
  {
    const { decideProbation, sendProbationReminders, extendedUntil } = await import("../src/lib/team/probation");
    const pu = await mk("Paula", "100000000000000099");
    const mentor = await mk("Mats", "100000000000000100", { isTeam: true });
    const decided = new Date(Date.now() - 15 * 86_400_000);
    const pa = await db.application.create({
      data: { userId: pu.id, positionId: pos.id, status: "ACCEPTED", publicId: "NV-P-1", submittedAt: decided, decidedAt: decided, probationUntil: new Date(Date.now() + 3_600_000), claimedById: team.id, claimedAt: decided, mentorId: mentor.id },
    });
    const sent = await sendProbationReminders(db);
    const again = await sendProbationReminders(db);
    const paJobs = await db.outboxJob.count({ where: { applicationId: pa.id } });
    check(sent >= 3 && again === 0 && paJobs === 3, `Erinnerung: Probezeit-Ende an Leitung + Betreuer, Paten-Rückmeldung – je einmal (${paJobs} Aufträge)`);
    check((await db.outboxJob.count({ where: { applicationId: pa.id, type: "CHANNEL_MESSAGE" } })) >= 1, "Probezeit-Ende: Hinweis im Leitungs-Chat");
    const before = (await db.application.findUniqueOrThrow({ where: { id: pa.id } })).probationUntil!;
    await decideProbation(db, { applicationId: pa.id, decision: "EXTEND", actor: team });
    const ext = await db.application.findUniqueOrThrow({ where: { id: pa.id } });
    check(ext.probationUntil!.getTime() === extendedUntil(before, new Date(ext.probationUntil!.getTime() - 14 * 86_400_000)).getTime() && !ext.probationResult, "Verlängern: +14 Tage, noch offen");
    await decideProbation(db, { applicationId: pa.id, decision: "PASSED", actor: team });
    let err = "";
    try { await decideProbation(db, { applicationId: pa.id, decision: "END", actor: team }); } catch (e) { err = (e as Error).message; }
    check((await db.application.findUniqueOrThrow({ where: { id: pa.id } })).probationResult === "PASSED" && err.includes("schon entschieden"), "Bestanden; zweite Entscheidung abgelehnt");
  }

  // ── Abwesenheit: Team (keine Zuteilung) und Bewerber (keine Rückfrage-Erinnerung)
  {
    const { saveSettings } = await import("../src/lib/settings");
    const { autoAssign } = await import("../src/lib/team/assign");
    const { sendFollowUpReminders } = await import("../src/lib/applications/followup");
    await db.user.updateMany({ where: { isTeam: true }, data: { lastTeamActiveAt: null } });
    const away = await mk("Anton", "100000000000000101", { isTeam: true, lastTeamActiveAt: new Date(), awayUntil: new Date(Date.now() + 5 * 86_400_000) });
    await saveSettings({ "team.autoAssign": true }, team.id);
    const aa = await db.application.create({ data: { userId: (await mk("Arne", "100000000000000102")).id, positionId: pos.id, status: "SUBMITTED", publicId: "NV-A-1", submittedAt: new Date() } });
    await autoAssign(db, aa.id);
    check((await db.application.findUniqueOrThrow({ where: { id: aa.id } })).claimedById !== away.id, "Abwesende bekommen keine Bewerbung zugeteilt");
    await saveSettings({ "team.autoAssign": false }, team.id);
    const fu = await db.application.create({
      data: { userId: (await mk("Fiona", "100000000000000103")).id, positionId: pos.id, status: "IN_REVIEW", publicId: "NV-A-2", submittedAt: new Date(), awaitingReplySince: new Date(Date.now() - 10 * 86_400_000), applicantAwayUntil: new Date(Date.now() + 3 * 86_400_000) },
    });
    await sendFollowUpReminders(db);
    check(!(await db.application.findUniqueOrThrow({ where: { id: fu.id } })).awaitingRemindedAt, "Bewerber abwesend: keine Rückfrage-Erinnerung");
  }

  // ── Antwort des Bewerbers (Portal): nur eigene, laufende Bewerbung; beendet Rückfrage
  {
    const { postApplicantReply } = await import("../src/lib/applications/reply");
    const owner = await mk("Rieke", "100000000000000201");
    const other = await mk("Ole", "100000000000000202");
    const ra = await db.application.create({ data: { userId: owner.id, positionId: pos.id, status: "IN_REVIEW", publicId: "NV-R-1", submittedAt: new Date(), awaitingReplySince: new Date() } });
    const bad = await postApplicantReply({ applicationId: ra.id, owner: { userId: other.id }, body: "Fremde Antwort" });
    check(!bad.ok, "Antwort: fremde Bewerbung abgelehnt");
    const r = await postApplicantReply({ applicationId: ra.id, owner: { userId: owner.id }, body: "  Klar, passt mir!  " });
    const msg = r.ok ? await db.message.findUnique({ where: { id: r.messageId } }) : null;
    check(r.ok && msg?.direction === "APPLICANT_TO_TEAM" && msg.body === "Klar, passt mir!" && msg.authorId === owner.id, "Antwort steht im Portal");
    check(!(await db.application.findUniqueOrThrow({ where: { id: ra.id } })).awaitingReplySince, "Antwort beendet die offene Rückfrage");
    await db.application.update({ where: { id: ra.id }, data: { status: "REJECTED", decidedAt: new Date() } });
    check(!(await postApplicantReply({ applicationId: ra.id, owner: { userId: owner.id }, body: "Hallo?" })).ok, "Abgeschlossen: keine Antwort mehr");
  }

  // ── Ideen & Fehler: einreichen, prüfen, Status mit DM
  {
    const { createSuggestion, updateSuggestion } = await import("../src/lib/suggestions");
    const sub = await mk("Ida", "100000000000000301");
    const bad = await createSuggestion(db, sub, { kind: "IDEA", title: "x", body: "zu kurz" });
    check(!bad.ok && !!bad.fieldErrors?.title && !!bad.fieldErrors?.body, "Ideen: zu kurze Eingaben abgelehnt (mit Feldfehlern)");
    const ok = await createSuggestion(db, sub, { kind: "BUG", title: "Upload hängt", body: "Upload hängt bei 99 % auf dem Handy.", location: "Formular, Schritt 3" });
    const row = ok.ok ? await db.suggestion.findUnique({ where: { id: ok.id } }) : null;
    check(!!row && row.status === "NEW" && row.location === "Formular, Schritt 3" && row.authorId === sub.id, "Ideen: Fehlermeldung gespeichert (Status Neu, Ort)");
    const idea = await createSuggestion(db, sub, { kind: "IDEA", title: "Dunkles Design", body: "Ein dunkles Design wäre schön.", location: "ignorieren" });
    check(idea.ok && (await db.suggestion.findUniqueOrThrow({ where: { id: idea.id } })).location === null, "Ideen: Ort nur bei Fehlern");
    // Ohne Leitungs-Chat: Bot-Log-Hinweis ohne Titel/Namen (Bot-Log sieht das ganze Team)
    const { saveSettings: save } = await import("../src/lib/settings");
    await save({ "discord.botLogEnabled": true, "discord.botLogChannelId": "100000000000000999", "discord.leadChannelId": "" }, team.id);
    const priv = await createSuggestion(db, sub, { kind: "IDEA", title: "Geheimer Titel", body: "Etwas, das nur die Leitung lesen soll." });
    const logJob = priv.ok && priv.jobIds[0] ? await db.outboxJob.findUnique({ where: { id: priv.jobIds[0] } }) : null;
    check(!!logJob && !JSON.stringify(logJob.payload).includes("Geheimer Titel") && !JSON.stringify(logJob.payload).includes("Ida"), "Ideen: Bot-Log-Hinweis ohne Inhalt und Namen");
    await save({ "discord.leadChannelId": "100000000000000998" }, team.id);
    const lead = await createSuggestion(db, sub, { kind: "IDEA", title: "Für die Leitung", body: "Im Leitungs-Chat mit Titel." });
    const leadJob = lead.ok && lead.jobIds[0] ? await db.outboxJob.findUnique({ where: { id: lead.jobIds[0] } }) : null;
    check(!!leadJob && JSON.stringify(leadJob.payload).includes("Für die Leitung") && JSON.stringify(leadJob.payload).includes("100000000000000998"), "Ideen: Leitungs-Chat bekommt Titel");
    const u1 = await updateSuggestion(db, team.id, { id: row!.id, status: "REVIEWING" });
    check(u1.ok && u1.jobIds.length === 0, "Ideen: „Wird geprüft“ ohne DM");
    const u2 = await updateSuggestion(db, team.id, { id: row!.id, status: "DONE", adminNote: "Behoben, danke!" });
    const after = await db.suggestion.findUniqueOrThrow({ where: { id: row!.id } });
    const dm = u2.ok && u2.jobIds[0] ? await db.outboxJob.findUnique({ where: { id: u2.jobIds[0] } }) : null;
    check(after.status === "DONE" && after.adminNote === "Behoben, danke!" && after.handledById === team.id && !!dm && JSON.stringify(dm.payload).includes(sub.discordId) && (dm.payload as { purpose?: string }).purpose === "status", "Ideen: Umgesetzt → DM an die Person (Status-Info)");
    const u3 = await updateSuggestion(db, team.id, { id: row!.id, status: "DONE", adminNote: "Nur Notiz geändert" });
    check(u3.ok && u3.jobIds.length === 0, "Ideen: gleicher Status → keine zweite DM");
    const u4 = idea.ok ? await updateSuggestion(db, team.id, { id: idea.id, status: "DECLINED", notify: false }) : null;
    check(!!u4 && u4.ok && u4.jobIds.length === 0, "Ideen: DM abwählbar");
    await db.user.delete({ where: { id: sub.id } });
    check((await db.suggestion.count({ where: { authorId: sub.id } })) === 0, "Ideen: Konto gelöscht → Einreichungen mitgelöscht");
  }

  // ── Whitelist & Beta: Anlage, Formular, Ablauf (Beta ohne Gespräch), nur Rolle der Stelle
  {
    const { seedKinds } = await import("../src/lib/setup/base-seed");
    const { getFormDefinition } = await import("../src/lib/data/positions");
    const { saveSettings } = await import("../src/lib/settings");
    await seedKinds(db);
    check((await db.applicationType.count({ where: { key: { in: ["whitelist", "beta"] } } })) === 2 && (await db.position.count({ where: { slug: { in: ["whitelist", "beta"] } } })) === 2, "Whitelist & Beta angelegt (2 Arten, 2 Stellen)");
    check((await seedKinds(db)) === 0, "Anlage ist idempotent");
    const wl = await db.position.findUniqueOrThrow({ where: { slug: "whitelist" }, include: { type: true } });
    const beta = await db.position.findUniqueOrThrow({ where: { slug: "beta" }, include: { type: true } });
    check(wl.type.key === "whitelist" && beta.type.key === "beta" && wl.status === "CLOSED" && beta.status === "CLOSED", "Arten stimmen, Stellen starten geschlossen");
    const wlForm = await getFormDefinition(wl);
    const quizQs = wlForm.flatMap((x) => x.questions).filter((q) => q.type === "QUIZ");
    check(wlForm.length === 4 && quizQs.length === 6, `Whitelist-Formular: ${wlForm.length} Schritte, ${quizQs.length} Quizfragen`);
    check(!wlForm.some((x) => x.general), "Whitelist ohne allgemeine Team-Fragen");
    check((await db.question.count({ where: { key: { startsWith: "whitelist.quiz_" }, correctOption: null } })) === 0, "Quiz-Lösungen gespeichert");
    check((await db.messageTemplate.count({ where: { title: { in: ["Whitelist – Freigegeben", "Beta – Zusage"] } } })) === 2, "Bausteine für Whitelist und Beta");
    // Bausteine je Art: Filter wie in der Bewerbungsansicht
    const forKind = (k: string) => db.messageTemplate.findMany({ where: { active: true, OR: [{ kinds: { isEmpty: true } }, { kinds: { has: k } }] }, select: { title: true } }).then((r) => r.map((t) => t.title));
    await db.messageTemplate.createMany({
      data: [
        { category: "SONSTIGES", title: "T-Alle", body: "x", kinds: [] },
        { category: "SONSTIGES", title: "T-Team", body: "x", kinds: ["team"] },
        { category: "SONSTIGES", title: "T-WL-Beta", body: "x", kinds: ["whitelist", "beta"] },
      ],
    });
    const teamT = await forKind("team");
    const wlT = await forKind("whitelist");
    check(teamT.includes("T-Alle") && teamT.includes("T-Team") && !teamT.includes("T-WL-Beta"), "Bausteine: Team sieht „alle“ + Team");
    check(wlT.includes("T-Alle") && wlT.includes("T-WL-Beta") && !wlT.includes("T-Team") && wlT.includes("Whitelist – Freigegeben") && !wlT.includes("Beta – Zusage"), "Bausteine: Whitelist sieht „alle“ + Whitelist");
    // Daten-Migration ordnet mitgelieferte Bausteine zu (nur unzugeordnete)
    await db.messageTemplate.createMany({ data: [{ category: "ANNAHME", title: "Willkommen im Team", body: "x" }, { category: "ANNAHME", title: "Probezeit-Infos", body: "x", kinds: ["beta"] }] });
    const { runMigrations: rm } = await import("../src/lib/setup/migrations");
    await db.setting.deleteMany({ where: { key: "migration:2026-11-bausteine-arten" } });
    await rm(db);
    check((await db.messageTemplate.findFirstOrThrow({ where: { title: "Willkommen im Team" } })).kinds.join() === "team", "Migration: „Willkommen im Team“ nur fürs Team");
    check((await db.messageTemplate.findFirstOrThrow({ where: { title: "Probezeit-Infos" } })).kinds.join() === "beta", "Migration: eigene Zuordnung bleibt");

    await saveSettings({ "discord.autoRoleOnAccept": true, "discord.acceptExtraRoleIds": "300000000000000001", "discord.welcomeChannelId": "300000000000000002", "interview.minStars": 0, "onboarding.probationDays": 30 }, team.id);
    await db.position.update({ where: { id: beta.id }, data: { acceptRoleId: "300000000000000003", nickPrefix: "[Beta]" } });
    const bu = await mk("Bea", "100000000000000401");
    const ba = await db.application.create({ data: { userId: bu.id, positionId: beta.id, status: "SUBMITTED", publicId: "NV-B-1", submittedAt: new Date() } });
    let err = "";
    try { await changeStatus({ applicationId: ba.id, to: "INTERVIEW", actorId: team.id }); } catch (e) { err = (e as Error).message; }
    check(err.includes("kein Gespräch"), "Beta: kein Status „Gespräch“");
    const before = new Set((await db.outboxJob.findMany({ select: { id: true } })).map((j) => j.id));
    await changeStatus({ applicationId: ba.id, to: "ACCEPTED", actorId: team.id });
    const jobs = (await db.outboxJob.findMany()).filter((j) => !before.has(j.id));
    const payload = JSON.stringify(jobs.map((j) => j.payload));
    const accepted = await db.application.findUniqueOrThrow({ where: { id: ba.id } });
    check(payload.includes("300000000000000003") && !payload.includes("300000000000000001"), "Beta-Annahme: Rolle der Stelle, keine Team-Zusatzrolle");
    check(!payload.includes("300000000000000002") && !payload.includes("SET_NICK"), "Beta-Annahme: keine Begrüßung im Teamchat, kein Präfix");
    check(!accepted.probationUntil, "Beta-Annahme: keine Probezeit");

    const wu = await mk("Willi", "100000000000000402");
    const wa = await db.application.create({ data: { userId: wu.id, positionId: wl.id, status: "SUBMITTED", publicId: "NV-W-1", submittedAt: new Date() } });
    await changeStatus({ applicationId: wa.id, to: "INTERVIEW", actorId: team.id });
    check((await db.application.findUniqueOrThrow({ where: { id: wa.id } })).status === "INTERVIEW", "Whitelist: mit Gespräch");
    await saveSettings({ "discord.autoRoleOnAccept": false, "discord.acceptExtraRoleIds": "", "discord.welcomeChannelId": "" }, team.id);
  }

  // ── Feedback (eins pro Bewerbung)
  await db.feedback.create({ data: { applicationId: app1.id, rating: 5 } });
  dup = false;
  try { await db.feedback.create({ data: { applicationId: app1.id, rating: 1 } }); } catch { dup = true; }
  check(dup, "Ein Feedback pro Bewerbung");
} finally {
  await testDb.drop();
}
console.log(fails ? `\n${fails} Fehler` : "\nAlles grün");
process.exit(fails ? 1 : 0);
