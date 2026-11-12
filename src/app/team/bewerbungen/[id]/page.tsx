import type { Metadata } from "next";
import { LiveRefresh } from "@/components/LiveRefresh";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowSquareOut, CalendarCheck, DiscordLogo, Printer, WarningCircle, Flask } from "@phosphor-icons/react/ssr";
import { Avatar, DeliveryBadge, Notice, StatusBadge, cn, formatDay, formatDayTime, formatRelative } from "@/components/ui";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { ChatAvatar, ChatRoleBadge, personName } from "@/components/ChatParticipant";
import {
  CommentBox,
  DeleteCommentButton,
  InterviewForm,
  RetryDeliveryButton,
  StatusControl,
  VotePanel,
} from "@/components/team/DetailControls";
import { MessageComposer } from "@/components/team/MessageComposer";
import { ClaimBox } from "@/components/team/ClaimBox";
import { HelpLink } from "@/components/team/HelpLink";
import { AckWithdrawalButton } from "@/components/team/AckWithdrawalButton";
import { avatarUrl } from "@/lib/discord/snowflake";
import { AiPanel } from "@/components/team/AiPanel";
import { Tabs } from "@/components/Tabs";
import { QuizPill } from "@/components/team/QuizPill";
import { NoShowButton } from "@/components/team/NoShowButton";
import { InterviewProtocol } from "@/components/team/InterviewProtocol";
import { buildProtocol, protocolQuestions } from "@/lib/team/interview";
import { testScenarioLabel } from "@/lib/setup/test-applications";
import { isHeldNow } from "@/lib/night";
import { canSeePosition, viewerOf } from "@/lib/team/visibility";
import { RatingPanel } from "@/components/team/RatingPanel";
import { OnboardingPanel } from "@/components/team/OnboardingPanel";
import { onboardingItems, readOnboarding } from "@/lib/team/onboarding";
import { cleanScores, formatScore, summarizeRatings } from "@/lib/team/ratings";
import { claimAndScore, isScoringPending, readAiRating, scoringBlockedReason } from "@/lib/ai/scoring";
import { after } from "next/server";
import { applyGuildState, guildStateKnown } from "@/lib/applications/guild-watch";
import { aiScoreAllowed } from "@/lib/applications/form";
import type { AiRatingView } from "@/components/team/RatingPanel";
import { TagPills } from "@/components/team/TagPills";
import { RetagButton } from "@/components/team/RetagButton";
import { requireTeam, getAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getBotProfile } from "@/lib/discord/bot-profile";
import { getSettings } from "@/lib/settings";
import { acceptRuleText, getTemplateVarsFor, interviewBlockText } from "@/lib/team/service";
import { FOLLOW_UP_DAYS, STATUS_LABEL, SUGGESTED_CATEGORIES, allowedTeamTargets, canFollowUp } from "@/lib/applications/status";
import { formatAnswerForDisplay, type AnswerValue } from "@/lib/applications/form";
import { nameFlag, type ApplicationFlag } from "@/lib/applications/flags";
import type { ApplicationStatus } from "@prisma/client";
import { isAiConfigured } from "@/lib/ai/config";
import { nowMs } from "@/lib/time";

export const metadata: Metadata = { title: "Bewerbung" };

export default function TeamApplicationPage(props: PageProps<"/team/bewerbungen/[id]">) {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[48rem]" />}>
      <Detail {...props} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: PageProps<"/team/bewerbungen/[id]">) {
  const { user: me, access } = await requireTeam();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();

  const app = await db.application.findUnique({
    where: { id },
    include: {
      user: true,
      position: true,
      claimedBy: { select: { id: true, globalName: true, username: true, discordId: true, avatar: true } },
      answers: { orderBy: { sortOrder: "asc" } },
      votes: { include: { user: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "asc" } },
      slot: { select: { id: true } },
      feedback: true,
      ratings: { include: { user: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "asc" } },
      comments: { include: { author: { select: { globalName: true, username: true, discordId: true, avatar: true } } }, orderBy: { createdAt: "asc" } },
      messages: { include: { author: { select: { globalName: true, username: true, discordId: true, avatar: true, isAdmin: true, isTeam: true } } }, orderBy: { createdAt: "asc" } },
      statusChanges: { include: { actor: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "asc" } },
      interviewNotes: { include: { author: { select: { globalName: true, username: true } } }, orderBy: { createdAt: "asc" } },
      interviewChecks: { include: { checkedBy: { select: { globalName: true, username: true } } } },
    },
  });
  if (!app || app.status === "DRAFT") notFound();
  // Zuständigkeit pro Stelle
  if (!canSeePosition(viewerOf(me, access), app.position)) notFound();
  const ackBy = app.withdrawAckById ? await db.user.findUnique({ where: { id: app.withdrawAckById }, select: { globalName: true, username: true } }) : null;

  const [settings, templates, vars, otherApps, activeBan, applicantAccess, bot] = await Promise.all([
    getSettings(),
    db.messageTemplate.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    getTemplateVarsFor(app.id, me),
    db.application.findMany({
      where: { userId: app.userId, NOT: { id: app.id }, status: { not: "DRAFT" } },
      select: { id: true, publicId: true, status: true, position: { select: { title: true } } },
      orderBy: { submittedAt: "desc" },
    }),
    db.userBan.findFirst({ where: { subjectId: app.userId, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    // Discord-Profil aktuell halten (kurzer Cache, Beitrittsdatum vom Server)
    getAccess(app.user).catch(() => null),
    getBotProfile(),
  ]);

  const openMessages = typeof sp.status === "string" || app.messages.some((m) => m.direction === "APPLICANT_TO_TEAM" && !m.readAt);
  // Neue Antworten des Bewerbers als gelesen markieren (Team-Sicht)
  if (app.messages.some((m) => m.direction === "APPLICANT_TO_TEAM" && !m.readAt)) {
    await db.message.updateMany({ where: { applicationId: app.id, direction: "APPLICANT_TO_TEAM", readAt: null }, data: { readAt: new Date() } });
  }

  const statusHint = typeof sp.status === "string" ? (sp.status as ApplicationStatus) : app.status;
  const suggested = SUGGESTED_CATEGORIES[statusHint] ?? SUGGESTED_CATEGORIES[app.status] ?? [];
  // Gespeicherte Hinweise + Namens-Check mit dem aktuellen Namen (Name kann sich nach dem Absenden ändern)
  const storedFlags = app.flags as unknown as ApplicationFlag[];
  const liveName = nameFlag([app.user.globalName, app.user.username]);
  const flags = liveName && !storedFlags.some((f) => f.message === liveName.message) ? [...storedFlags.filter((f) => f.code !== "inappropriate_name"), liveName] : storedFlags;
  const dmIssue = app.confirmationDmStatus === "DM_CLOSED" || app.confirmationDmStatus === "FAILED";
  // Bewerber nicht (mehr) auf dem Discord? (nur bei sicherer Antwort von Discord)
  const leftGuild = guildStateKnown(applicantAccess) && !applicantAccess!.inGuild && ["SUBMITTED", "IN_REVIEW", "INTERVIEW"].includes(app.status);
  // Austritt/Rückkehr erkannt → automatische Bot-Nachricht bzw. zurücksetzen (nach der Antwort)
  if (guildStateKnown(applicantAccess) && (leftGuild ? !app.guildLeftNotifiedAt : !!app.guildLeftNotifiedAt)) {
    const inGuildNow = applicantAccess!.inGuild;
    after(() => applyGuildState(app.id, inGuildNow).catch((e) => console.error("[guild-watch]", e)));
  }
  const accountAgeDays = Math.floor((nowMs() - app.user.discordCreatedAt.getTime()) / 86_400_000);
  const replyOverdue = !!app.awaitingReplySince && nowMs() - app.awaitingReplySince.getTime() >= settings["followup.closeDays"] * 86_400_000;
  const interviewPast = !!app.interviewAt && app.interviewAt.getTime() < nowMs();
  const myVote = app.votes.find((v) => v.userId === me.id)?.value ?? null;
  const aiEnabled = settings["ai.enabled"] && isAiConfigured();
  const myRating = app.ratings.find((r) => r.userId === me.id);
  const ratingSummary = summarizeRatings(app.ratings);
  // Phase 2 (Gespräch) erst ab X Sternen Team-Schnitt
  const interviewBlock = ["SUBMITTED", "IN_REVIEW"].includes(app.status) ? interviewBlockText(ratingSummary.overall, settings["interview.minStars"], formatScore) : null;
  const statusTargets = allowedTeamTargets(app.status).filter((s) => !(s === "INTERVIEW" && interviewBlock));
  // Noch keine KI-Punkte? Dann jetzt im Hintergrund nachholen (einmal, gesperrt gegen Doppelaufrufe)
  const wantsAutoScore = aiEnabled && settings["ai.autoScoreEnabled"] && app.status !== "WITHDRAWN" && !readAiRating(app.aiRating) && aiScoreAllowed(app);
  // Budget aufgebraucht o. Ä.? Dann nicht „bewertet gerade …“ anzeigen, sondern den Grund
  const scoreBlocked = wantsAutoScore ? await scoringBlockedReason(settings) : null;
  if (wantsAutoScore && !scoreBlocked && !isScoringPending(app)) {
    after(async () => {
      await claimAndScore(app.id);
    });
  }
  const storedAi = readAiRating(app.aiRating);
  const aiView: AiRatingView = !aiEnabled
    ? { kind: "off" }
    : !aiScoreAllowed(app)
      ? { kind: "notAllowed" }
      : !storedAi
        ? scoreBlocked
          ? { kind: "unavailable", reason: scoreBlocked }
          : isScoringPending(app)
          ? { kind: "pending" }
          : settings["ai.autoScoreEnabled"] && app.status !== "WITHDRAWN"
            ? { kind: "pending" }
            : { kind: "none" }
        : "blocked" in storedAi
          ? { kind: "blocked", reason: storedAi.blocked, at: app.aiRatedAt?.toISOString() ?? "" }
          : { kind: "scores", scores: cleanScores(storedAi.scores), reasons: storedAi.reasons ?? {}, fazit: storedAi.fazit ?? null, at: app.aiRatedAt?.toISOString() ?? "" };

  const protocol = buildProtocol(
    protocolQuestions(app.position.interviewQuestions, settings["interview.defaultQuestions"], app.interviewExtraQuestions),
    app.interviewExtraQuestions,
    app.interviewChecks,
    app.interviewNotes,
  );
  // Reiter „Gespräch“: ab Einladung zum Gespräch oder sobald schon etwas notiert ist
  const showProtocol = protocol.started || ["INTERVIEW", "ACCEPTED", "REJECTED"].includes(app.status);

  const sections = new Map<string, typeof app.answers>();
  for (const a of app.answers) {
    const list = sections.get(a.sectionTitle) ?? [];
    list.push(a);
    sections.set(a.sectionTitle, list);
  }
  const name = app.user.globalName || app.user.username;

  return (
    <div className="space-y-6">
      <LiveRefresh scope="team-app" id={app.id} />
      <Link href="/team/bewerbungen" className="nv-btn nv-btn-quiet nv-btn-sm -ml-3">
        <ArrowLeft size={14} aria-hidden /> Alle Bewerbungen
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar discordId={app.user.discordId} avatar={app.user.avatar} size={64} />
        <div className="flex-1 min-w-0">
          <p className="nv-label">
            {app.position.title}
            {" // "}
            {app.publicId}
          </p>
          <h1 className="nv-headline text-4xl mt-1.5 truncate">{name}</h1>
          <p className="text-sm text-muted">
            @{app.user.username} · eingereicht {app.submittedAt ? formatRelative(app.submittedAt) : "–"}
          </p>
          {(app.aiTags.length > 0 || aiEnabled) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TagPills tags={app.aiTags} size="md" />
              {aiEnabled && <RetagButton applicationId={app.id} hasTags={app.aiTags.length > 0} />}
              {app.aiTags.length > 0 && <HelpLink id="ki-tags" />}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Link href={`/team/bewerbungen/${app.id}/druck`} className="nv-btn nv-btn-ghost nv-btn-sm" title="Druckansicht / als PDF speichern">
            <Printer size={14} aria-hidden /> PDF
          </Link>
          <StatusBadge status={app.status} className="!text-sm !px-3.5 !py-1.5" />
        </div>
      </header>

      <ClaimBox
        applicationId={app.id}
        me={{ id: me.id, isAdmin: access.isAdmin }}
        claimedBy={
          app.claimedBy
            ? { id: app.claimedBy.id, name: app.claimedBy.globalName || app.claimedBy.username, discordId: app.claimedBy.discordId, avatar: app.claimedBy.avatar }
            : null
        }
        claimedAgo={app.claimedAt ? formatRelative(app.claimedAt) : null}
      />

      {app.status === "WITHDRAWN" && app.withdrawnInReview && (
        <Notice tone="warn" icon={WarningCircle} title="Während der Bearbeitung zurückgezogen">
          {app.withdrawReason ? <>„{app.withdrawReason}“</> : "Ohne Begründung."}{" "}
          {app.withdrawAckAt
            ? `Rückzug bestätigt am ${formatDay(app.withdrawAckAt)}${ackBy ? ` von ${ackBy.globalName || ackBy.username}` : ""}.`
            : canFollowUp(app)
              ? `Du kannst unten nachfragen – der Bewerber kann bis ${formatDay(new Date(app.decidedAt!.getTime() + FOLLOW_UP_DAYS * 86_400_000))} antworten.`
              : "Die Frist für Rückfragen ist abgelaufen."}{" "}
          <HelpLink id="rueckzug" />
          {!app.withdrawAckAt && (
            <div className="mt-2">
              <AckWithdrawalButton applicationId={app.id} />
            </div>
          )}
        </Notice>
      )}

      {leftGuild && (
        <Notice tone="danger" icon={DiscordLogo} title="Bewerber ist nicht (mehr) auf dem Discord">
          DMs kommen nicht an, und für Gespräch und Rückfragen muss die Person auf dem Server sein. Der Bot hat ihr{" "}
          {app.guildLeftNotifiedAt ? `am ${formatDayTime(app.guildLeftNotifiedAt)} Uhr` : "gerade"} automatisch eine Nachricht mit
          Einladungslink ins Portal geschickt.
        </Notice>
      )}

      {app.isTest && (
        <Notice tone="warn" icon={Flask} title={`Testbewerbung${testScenarioLabel(app.testScenario) ? ` · Szenario „${testScenarioLabel(app.testScenario)}“` : ""}`}>
          Kein echter Bewerber – Nachrichten erscheinen nur im Portal, DMs und Rollen werden nicht verschickt. Löschen unter Admin-Bereich → Daten & Tests.
        </Notice>
      )}
      {app.awaitingReplySince && ["SUBMITTED", "IN_REVIEW", "INTERVIEW"].includes(app.status) && (
        <Notice
          tone={replyOverdue ? "warn" : "info"}
          icon={WarningCircle}
          title={`Offene Rückfrage seit ${formatDayTime(app.awaitingReplySince)} Uhr`}
        >
          {replyOverdue
            ? `Seit über ${settings["followup.closeDays"]} Tagen keine Antwort${app.awaitingRemindedAt ? " – trotz Erinnerung" : ""}. Vorschlag: Bewerbung schließen (ablehnen) oder nochmal nachhaken.`
            : `Das Team wartet auf eine Antwort.${app.awaitingRemindedAt ? ` Erinnerung verschickt am ${formatDayTime(app.awaitingRemindedAt)} Uhr.` : ` Kommt nichts, erinnert der Bot nach ${settings["followup.reminderDays"]} Tagen.`}`}
        </Notice>
      )}
      {app.amendedAt && (
        <Notice tone="info" icon={WarningCircle} title={`Antworten nachgereicht am ${formatDayTime(app.amendedAt)} Uhr`}>
          Der Bewerber hat vor der Bearbeitung Antworten ergänzt. Die Antworten unten sind der aktuelle Stand; KI-Einordnung und KI-Punkte wurden neu berechnet.
        </Notice>
      )}
      {(dmIssue || flags.length > 0 || activeBan) && (
        <div className="grid gap-2">
          {activeBan && (
            <Notice tone="danger" icon={WarningCircle} title="Nutzer ist gesperrt">
              {activeBan.reason}
              {activeBan.expiresAt ? ` (bis ${formatDay(activeBan.expiresAt)})` : " (unbefristet)"}
            </Notice>
          )}
          {dmIssue && (
            <Notice tone="danger" icon={DiscordLogo} title="Bestätigungs-DM konnte nicht zugestellt werden">
              Der Bewerber hat DMs deaktiviert oder ist nicht auf dem Server. Nachrichten erscheinen trotzdem im Portal.{" "}
              <HelpLink id="bestaetigung" />
            </Notice>
          )}
          {flags.length > 0 && (
            <Notice tone="warn" icon={WarningCircle} title="Automatische Hinweise (keine Bewertung)">
              <ul className="list-disc pl-4">
                {flags.map((f, i) => (
                  <li key={i}>{f.message}</li>
                ))}
              </ul>
              <HelpLink id="automatische-hinweise" className="mt-1.5" />
            </Notice>
          )}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Tabs
            id="bewerbung"
            className="nv-card overflow-hidden"
            defaultKey={openMessages ? "nachrichten" : "antworten"}
            tabs={[
              {
                key: "antworten",
                label: "Antworten",
                content: (
          <section aria-label="Antworten">
            <div className="divide-y divide-[var(--nv-border)]">
              <dl className="px-5 py-4 grid gap-1 sm:grid-cols-[220px_1fr] sm:gap-4">
                <dt className="text-xs text-muted">Alter</dt>
                <dd className="text-sm">{app.age ?? "–"}</dd>
                {app.quizTotal ? (
                  <>
                    <dt className="text-xs text-muted">Regel-Quiz</dt>
                    <dd className="text-sm flex flex-wrap items-center gap-2">
                      <span>
                        {app.quizCorrect} von {app.quizTotal} richtig
                      </span>
                      <QuizPill correct={app.quizCorrect} total={app.quizTotal} min={app.position.quizMinScore} />
                      {app.position.quizMinScore !== null && (app.quizCorrect ?? 0) < app.position.quizMinScore && (
                        <span className="text-xs text-[var(--tone-danger)]">unter der Mindestpunktzahl ({app.position.quizMinScore}) – nur Hinweis</span>
                      )}
                    </dd>
                  </>
                ) : null}
              </dl>
              {[...sections.entries()].map(([title, answers]) => (
                <div key={title} className="px-5 py-4">
                  <p className="nv-mono mb-3">{title}</p>
                  <dl className="space-y-4">
                    {answers.map((a) => (
                      <div key={a.id}>
                        <dt className="text-xs text-muted">{a.label}</dt>
                        <dd className="mt-1 text-sm whitespace-pre-wrap break-words">
                          {a.type === "FILE" && Array.isArray(a.value) ? (
                            <span className="flex flex-wrap gap-2">
                              {(a.value as string[]).map((uid) => (
                                <a key={uid} href={`/api/uploads/${uid}`} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/api/uploads/${uid}`} alt="Hochgeladenes Bild" className="h-28 rounded-lg border border-line hover:border-red-line" />
                                </a>
                              ))}
                            </span>
                          ) : a.type === "URL" && typeof a.value === "string" ? (
                            <a href={a.value} target="_blank" rel="noopener noreferrer nofollow" className="nv-link inline-flex items-center gap-1 break-all">
                              {a.value} <ArrowSquareOut size={13} aria-hidden />
                            </a>
                          ) : a.type === "QUIZ" ? (
                            <span className="inline-flex items-center gap-2">
                              {formatAnswerForDisplay(a.type, a.value as AnswerValue)}
                              {a.correct === true && <span className="text-[var(--tone-success)] text-xs">✓ richtig</span>}
                              {a.correct === false && <span className="text-[var(--tone-danger)] text-xs">✗ falsch</span>}
                            </span>
                          ) : (
                            formatAnswerForDisplay(a.type, a.value as AnswerValue)
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
                ),
              },
              ...(showProtocol
                ? [
                    {
                      key: "gespraech",
                      label: "Gespräch",
                      badge: protocol.items.filter((i) => i.checked).length || undefined,
                      content: <InterviewProtocol applicationId={app.id} protocol={protocol} meId={me.id} isAdmin={!!access?.isAdmin} />,
                    },
                  ]
                : []),
              {
                key: "nachrichten",
                label: "Nachrichten",
                badge: app.messages.length,
                aliases: ["nachricht"],
                content: (
          <section aria-label={`Nachrichten an ${name}`}>
            <p className="px-5 pt-4 text-xs text-muted">
              Alles hier geht per Discord-DM an {name} und steht in seinem Portal. <HelpLink id="zustellung" label="Zustellstatus?" className="ml-1" />
            </p>
            {isHeldNow("team_message", settings) && (
              <p className="px-5 pt-2 text-xs text-[var(--tone-warn)]">
                🌙 Nachtruhe bis {settings["night.end"]} Uhr: Die Nachricht steht sofort im Portal, die DM geht erst um {settings["night.end"]} Uhr raus.
              </p>
            )}
            {app.messages.length > 0 && (
              <ol className="p-5 space-y-4 border-b border-line">
                {app.messages.map((m) => {
                  const fromApplicant = m.direction === "APPLICANT_TO_TEAM";
                  const person = fromApplicant ? app.user : m.author;
                  return (
                    <li key={m.id} className={cn("flex gap-3", fromApplicant && "flex-row-reverse")}>
                      <ChatAvatar direction={m.direction} person={person} botAvatarUrl={bot.avatarUrl} size={32} />
                      <div className={cn("max-w-[85%] min-w-0", fromApplicant && "text-right")}>
                        <p className="text-xs text-muted flex flex-wrap items-center gap-1.5" style={fromApplicant ? { justifyContent: "flex-end" } : undefined}>
                          <span className="font-medium text-fg-2">
                            {m.direction === "SYSTEM"
                              ? bot.name
                              : m.direction === "AI_TO_APPLICANT"
                                ? `${bot.name} (KI)`
                                : fromApplicant
                                  ? name
                                  : personName(m.author, "Team")}
                          </span>
                          <ChatRoleBadge direction={m.direction} person={person} />
                          {m.asTeam && <span className="nv-pill nv-tone-muted !text-[0.65rem] !py-0 !px-1.5">als Team gesendet</span>}
                          <span>· {formatDayTime(m.createdAt)}</span>
                        </p>
                        <div className={cn("mt-1 inline-block text-left rounded-2xl px-4 py-3 text-sm", fromApplicant ? "bg-surface-2" : "bg-card border border-line", m.flagged && "ring-1 ring-[var(--tone-danger)]")}>
                          <DiscordMarkdown text={m.body} />
                        </div>
                        {m.flagged && (
                          <p className="mt-1 text-xs text-[var(--tone-danger)]">
                            Möglicher Manipulationsversuch an der KI erkannt – Auto-Antwort wurde blockiert. <HelpLink id="manipulation" />
                          </p>
                        )}
                        {!fromApplicant && (
                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                            <DeliveryBadge status={m.deliveryStatus} />
                            {(m.deliveryStatus === "FAILED" || m.deliveryStatus === "PENDING" || m.deliveryStatus === "DM_CLOSED") && (
                              <RetryDeliveryButton messageId={m.id} />
                            )}
                            {m.deliveryError && <span className="text-xs text-faint">{m.deliveryError}</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="p-5">
              <MessageComposer
                applicationId={app.id}
                publicId={app.publicId}
                templates={templates.map((t) => ({ id: t.id, category: t.category, title: t.title, body: t.body }))}
                vars={vars ?? {}}
                suggested={suggested}
                statusTargets={statusTargets}
                sender={{ name: me.globalName || me.username, avatarUrl: avatarUrl(me.discordId, me.avatar, 128), claimedByMe: app.claimedById === me.id }}
                followUp={{ reminderDays: settings["followup.reminderDays"], closeDays: settings["followup.closeDays"] }}
              />
            </div>
          </section>
                ),
              },
              ...(aiEnabled
                ? [
                    {
                      key: "ki",
                      label: "KI",
                      content: (
                        <div className="p-5">
                          <AiPanel applicationId={app.id} cachedSummary={app.aiSummary} cachedAt={app.aiSummaryAt?.toISOString() ?? null} />
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>

        <aside className="space-y-4 min-w-0">
          <div className="nv-card p-5 space-y-5">
            <StatusControl applicationId={app.id} current={app.status} targets={statusTargets} />
            {interviewBlock && <p className="text-xs text-[var(--tone-warn)]">⭐ {interviewBlock}</p>}
            {acceptRuleText(app.position) && app.status !== "ACCEPTED" && (
              <p className="text-xs text-muted">
                👀 Vier-Augen-Prinzip: {acceptRuleText(app.position)} Bisher {app.votes.filter((v) => v.value === "PRO").length} Pro-Stimme(n).
              </p>
            )}
            <HelpLink id="status" label="Was bedeuten die Status?" />
            <div className="nv-divider" />
            <InterviewForm applicationId={app.id} at={app.interviewAt?.toISOString() ?? null} note={app.interviewNote} />
            {app.status === "INTERVIEW" && interviewPast && <NoShowButton applicationId={app.id} count={app.noShowCount} />}
            {app.noShowCount > 0 && (
              <p className={`text-xs ${app.noShowCount >= 2 ? "text-[var(--tone-danger)]" : "text-muted"}`}>
                🚫 {app.noShowCount}× nicht zum Gespräch erschienen
              </p>
            )}
            {app.interviewAt && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <CalendarCheck size={14} aria-hidden /> {formatDayTime(app.interviewAt)} Uhr{app.slot ? " · vom Bewerber gebucht" : ""}
              </p>
            )}
          </div>

          {app.status === "ACCEPTED" && (
            <div className="nv-card p-5">
              <p className="nv-mono mb-3 flex items-center justify-between gap-2">
                Einarbeitung <HelpLink id="einarbeitung" label="Was ist das?" />
              </p>
              <OnboardingPanel
                applicationId={app.id}
                items={onboardingItems(settings["onboarding.items"])}
                state={readOnboarding(app.onboarding)}
                probationUntil={app.probationUntil?.toISOString() ?? null}
                me={me.globalName || me.username}
              />
            </div>
          )}

          {app.feedback && (
            <div className="nv-card p-5">
              <p className="nv-mono mb-2">Feedback des Bewerbers</p>
              <p className="text-lg tracking-wider text-[var(--tone-warn)]" aria-label={`${app.feedback.rating} von 5`}>
                {"★".repeat(app.feedback.rating)}
                <span className="text-faint">{"★".repeat(5 - app.feedback.rating)}</span>
              </p>
              {app.feedback.comment && <p className="mt-1 text-sm text-fg-2 whitespace-pre-wrap">„{app.feedback.comment}“</p>}
            </div>
          )}

          <Tabs
            id="seite"
            compact
            className="nv-card overflow-hidden"
            tabs={[
              {
                key: "bewertung",
                label: "Bewertung",
                content: (
                  <div className="p-5 space-y-5">
                    <p className="nv-mono flex items-center justify-between gap-2">
                      Bewertungsbogen <HelpLink id="bewertungsbogen" label="Wie?" />
                    </p>

            <RatingPanel
              applicationId={app.id}
              mine={cleanScores(myRating?.scores)}
              myNote={myRating?.note ?? null}
              summary={ratingSummary}
              ai={aiView}
              bot={bot}
              isAdmin={access.isAdmin}
              raters={app.ratings
                .filter((r) => r.userId !== me.id || Object.keys(cleanScores(r.scores)).length)
                .map((r) => ({ name: r.user.globalName || r.user.username, avg: summarizeRatings([r]).overall }))}
            />
                    <div className="nv-divider" />
                    <p className="nv-mono flex items-center justify-between gap-2">
                      Abstimmung <HelpLink id="abstimmung" label="Wofür?" />
                    </p>

            <VotePanel
              applicationId={app.id}
              mine={myVote}
              votes={app.votes.map((v) => ({ value: v.value, name: v.user.globalName || v.user.username }))}
            />
                  </div>
                ),
              },
              {
                key: "kommentare",
                label: "Kommentare",
                badge: app.comments.length,
                content: (
                  <div className="p-5">

            <ul className="space-y-3 mb-4">
              {app.comments.length === 0 && <li className="text-sm text-muted">Noch keine Kommentare.</li>}
              {app.comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted">
                      {c.author?.globalName ?? c.author?.username ?? "Gelöscht"} · {formatRelative(c.createdAt)}
                    </p>
                    {(c.authorId === me.id || access.isAdmin) && <DeleteCommentButton commentId={c.id} />}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-fg-2">{c.body}</p>
                </li>
              ))}
            </ul>
            <CommentBox applicationId={app.id} />
                  </div>
                ),
              },
              {
                key: "profil",
                label: "Profil",
                content: (
                  <div className="p-5">

            <dl className="space-y-2 text-sm">
              <Row label="Anzeigename" value={app.user.globalName ?? "–"} />
              <Row label="Benutzername" value={`@${app.user.username}`} />
              <Row label="Discord-ID" value={<span className="font-mono text-xs">{app.user.discordId}</span>} />
              <Row label="Account erstellt" value={`${formatDay(app.user.discordCreatedAt)} (${accountAgeDays} Tage)`} />
              <Row
                label="Auf dem Server"
                value={
                  (applicantAccess?.inGuild ?? app.user.inGuild)
                    ? `seit ${formatDay(applicantAccess?.guildJoinedAt ?? app.user.guildJoinedAt)}`
                    : "nicht auf dem Server"
                }
              />
            </dl>
            <Link href={`/team/nutzer/${app.user.id}`} className="nv-btn nv-btn-ghost nv-btn-sm w-full mt-4">
              Notizen &amp; Sperren
            </Link>
          {otherApps.length > 0 && (
            <div className="mt-5 pt-4 border-t border-line">
              <p className="nv-mono mb-3">Weitere Bewerbungen</p>
              <ul className="space-y-2 text-sm">
                {otherApps.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <Link href={`/team/bewerbungen/${o.id}`} className="nv-link truncate">
                      {o.position.title} · {o.publicId}
                    </Link>
                    <StatusBadge status={o.status} className="!text-[0.65rem] !py-0" />
                  </li>
                ))}
              </ul>
            </div>
          )}
                  </div>
                ),
              },
              {
                key: "verlauf",
                label: "Verlauf",
                content: (
                  <div className="p-5">

            <ol className="space-y-2 text-xs">
              {app.statusChanges.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="text-fg-2">
                    {s.from ? `${STATUS_LABEL[s.from]} → ` : ""}
                    {STATUS_LABEL[s.to]}
                    {s.actor && <span className="text-muted"> · {s.actor.globalName ?? s.actor.username}</span>}
                  </span>
                  <span className="text-muted whitespace-nowrap">{formatDay(s.createdAt)}</span>
                </li>
              ))}
            </ol>
                  </div>
                ),
              },
            ]}
          />

          {/* Discord-Vorschau des Nachrichtenfelds (auf breiten Bildschirmen hier, sonst direkt unter dem Feld) */}
          <div id="composer-preview-slot" className="xl:sticky xl:top-28" />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-right min-w-0 break-words">{value}</dd>
    </div>
  );
}
