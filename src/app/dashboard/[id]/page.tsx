import type { Metadata } from "next";
import { LiveRefresh } from "@/components/LiveRefresh";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle,
  Confetti,
  DiscordLogo,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import { Container, DeliveryBadge, IconTile, Notice, StatusBadge, cn, formatDay, formatDayTime } from "@/components/ui";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { ChatAvatar, ChatRoleBadge, personName } from "@/components/ChatParticipant";
import { ReplyBox, WithdrawButton, MarkRead } from "@/components/dashboard/ApplicantActions";
import { requireUser } from "@/lib/auth/session";
import { SlotPicker } from "@/components/dashboard/SlotPicker";
import { CancelInterviewButton } from "@/components/dashboard/CancelInterviewButton";
import { nowMs } from "@/lib/time";
import { FeedbackForm } from "@/components/dashboard/FeedbackForm";
import { canRebook, listFreeSlots } from "@/lib/team/slots";
import { db } from "@/lib/db";
import { getBotProfile } from "@/lib/discord/bot-profile";
import { getAccess } from "@/lib/auth/user-access";
import { applyGuildState, guildStateKnown } from "@/lib/applications/guild-watch";
import { publicEnv } from "@/lib/env";
import { ACTIVE_STATUSES, FOLLOW_UP_DAYS, STATUS_HINT, STATUS_LABEL, TIMELINE, canFollowUp, isInProcessing } from "@/lib/applications/status";
import { formatAnswerForDisplay, type AnswerValue } from "@/lib/applications/form";
import { getSettings } from "@/lib/settings";
import { AMENDABLE_TYPES, canAmend, getQueueInfo, queueText } from "@/lib/applications/queue";
import { AmendForm } from "@/components/dashboard/AmendForm";
import { isNight } from "@/lib/night";
import type { ApplicationStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Bewerbung", robots: { index: false } };

export default function ApplicationDetailPage({ params, searchParams }: PageProps<"/dashboard/[id]">) {
  return (
    <section className="pt-28 sm:pt-32">
      <Container>
        <Suspense fallback={<div className="nv-skeleton h-[40rem]" />}>
          <Detail params={params} searchParams={searchParams} />
        </Suspense>
      </Container>
    </section>
  );
}

async function Detail({ params, searchParams }: PageProps<"/dashboard/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/${id}`);
  const sp = await searchParams;
  const app = await db.application.findFirst({
    where: { id, userId: user.id },
    include: {
      position: true,
      answers: { orderBy: { sortOrder: "asc" } },
      statusChanges: { orderBy: { createdAt: "asc" } },
      slot: true,
      feedback: true,
      messages: { include: { author: { select: { globalName: true, username: true, discordId: true, avatar: true, isAdmin: true, isTeam: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!app || app.status === "DRAFT") notFound();

  const isNew = sp.neu === "1";
  const bot = await getBotProfile();
  // Läuft die Bewerbung und die Person ist nicht (mehr) auf dem Discord? Dann Hinweis (+ Bot-Nachricht)
  const watched = ["SUBMITTED", "IN_REVIEW", "INTERVIEW"].includes(app.status);
  const guildAccess = watched ? await getAccess(user).catch(() => null) : null;
  const notInGuild = watched && guildStateKnown(guildAccess) && !guildAccess!.inGuild;
  if (watched && guildStateKnown(guildAccess) && (notInGuild ? !app.guildLeftNotifiedAt : !!app.guildLeftNotifiedAt)) {
    await applyGuildState(app.id, guildAccess!.inGuild).catch((e) => console.error("[guild-watch]", e));
  }
  const active = ACTIVE_STATUSES.includes(app.status);
  const followUp = canFollowUp(app);
  // Nachtruhe: Hinweis, dass das Team erst morgens antwortet
  const settings = await getSettings();
  const nightNotice = settings["night.portalNotice"] && isNight(settings) && (active || followUp);
  // Warteschlange & Bearbeitungszeit (nur solange es läuft) und Nachreichen (bis das Team draufschaut)
  const queue =
    settings["applications.queueInfo"] && (app.status === "SUBMITTED" || app.status === "IN_REVIEW") ? await getQueueInfo(db, app).catch(() => null) : null;
  const amendable = settings["applications.amendEnabled"] && canAmend(app)
    ? app.answers.filter((a) => (AMENDABLE_TYPES as readonly string[]).includes(a.type)).map((a) => ({ id: a.id, label: a.label, section: a.sectionTitle, type: a.type, value: typeof a.value === "string" ? a.value : String(a.value ?? "") }))
    : [];
  const nightText = `Nachtruhe bis ${settings["night.end"]} Uhr – das Team schläft. Deine Nachricht kommt trotzdem an, ab ${settings["night.end"]} Uhr meldet sich jemand persönlich.${settings["night.aiReply"] ? " Bis dahin antwortet dir unser Bot automatisch." : ""}`;
  const dmIssue = app.confirmationDmStatus === "DM_CLOSED" || app.confirmationDmStatus === "FAILED";
  const unread = app.messages.some((m) => m.direction === "TEAM_TO_APPLICANT" && !m.readAt);
  // Selbstbuchung: im Gespräch ohne festen Termin (oder mit selbst gebuchtem)
  const selfBooking = app.status === "INTERVIEW" && (!app.interviewAt || !!app.slot);
  const freeSlots = selfBooking ? await listFreeSlots(db) : [];
  const toPickable = (s: { id: string; startsAt: Date; durationMin: number; note: string | null }) => ({
    id: s.id,
    startsAt: s.startsAt.toISOString(),
    durationMin: s.durationMin,
    note: s.note,
  });

  return (
    <div className="space-y-8">
      <LiveRefresh scope="my-app" id={app.id} />
      {unread && <MarkRead applicationId={app.id} />}
      <Link href="/dashboard" className="nv-btn nv-btn-quiet nv-btn-sm -ml-3">
        <ArrowLeft size={14} aria-hidden /> Alle Bewerbungen
      </Link>

      {isNew && (
        <div className="nv-card p-6 sm:p-8 border-red-line nv-anim relative overflow-hidden">
          <div className="absolute inset-0 nv-hero-glow pointer-events-none" aria-hidden />
          <div className="relative flex gap-4">
            <Confetti size={32} weight="duotone" className="text-red-text shrink-0" aria-hidden />
            <div>
              <h1 className="nv-headline text-3xl">
                Danke! <em>Ist angekommen.</em>
              </h1>
              <p className="mt-2 text-fg-2">
                Deine Bewerbung <strong>{app.publicId}</strong> ist bei uns. Eine Bestätigung schicken wir dir zusätzlich
                per Discord-DM. Alle Rückmeldungen vom Team findest du hier – und per DM.
              </p>
            </div>
          </div>
        </div>
      )}

      {notInGuild && (
        <Notice tone="danger" icon={DiscordLogo} title="Du bist nicht mehr auf unserem Discord.">
          Für deine Bewerbung musst du auf dem Nordverkehr-Discord sein – dort laufen Gespräch, Rückfragen und Nachrichten.{" "}
          <a href={publicEnv.discordInvite} target="_blank" rel="noopener noreferrer" className="nv-link font-medium">
            Jetzt wieder beitreten
          </a>
        </Notice>
      )}

      {dmIssue && (
        <Notice tone="warn" icon={DiscordLogo} title="Wir konnten dir keine Discord-DM schicken.">
          Wahrscheinlich hast du Direktnachrichten von Servermitgliedern deaktiviert oder bist nicht auf unserem Discord.
          Kein Problem – alle Nachrichten findest du auch hier. Damit du nichts verpasst: Discord → Servereinstellungen →
          Privatsphäre → „Direktnachrichten“ erlauben.
        </Notice>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <IconTile icon={app.position.icon} className="h-14 w-14" />
        <div className="flex-1">
          <p className="nv-label">Bewerbung // {app.publicId}</p>
          <h2 className="nv-headline text-4xl sm:text-5xl mt-2">{app.position.title}</h2>
        </div>
        <StatusBadge status={app.status} className="!text-sm !px-3.5 !py-1.5 self-start sm:self-center" />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6 min-w-0">
          {["ACCEPTED", "REJECTED"].includes(app.status) &&
            (app.feedback ? (
              <p className="nv-card p-4 text-sm text-muted">Danke für dein Feedback – das hilft uns wirklich weiter.</p>
            ) : (
              <FeedbackForm applicationId={app.id} />
            ))}
          {queue && (
            <p className="nv-card p-4 text-sm text-fg-2" data-testid="queue-info">
              ⏳ {queueText(queue, app.status as "SUBMITTED" | "IN_REVIEW", app.position.title)}
            </p>
          )}
          {amendable.length > 0 && <AmendForm applicationId={app.id} answers={amendable} />}
          {selfBooking && (
            <SlotPicker
              applicationId={app.id}
              slots={freeSlots.map(toPickable)}
              current={app.slot ? toPickable(app.slot) : null}
              canChange={canRebook(app.slot, new Date())}
              canCancel={!!app.slot && app.slot.startsAt.getTime() > nowMs()}
            />
          )}
          {!selfBooking && app.status === "INTERVIEW" && app.interviewAt && (
            <div className="nv-card p-5 flex gap-4 border-red-line">
              <CalendarCheck size={28} className="text-red-text shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Gesprächstermin</p>
                <p className="text-fg-2 mt-0.5">{formatDayTime(app.interviewAt)} Uhr · Discord</p>
                {app.interviewNote && <p className="text-sm text-muted mt-1">{app.interviewNote}</p>}
                {app.interviewAt.getTime() > nowMs() && <CancelInterviewButton applicationId={app.id} />}
              </div>
            </div>
          )}

          <section aria-labelledby="msgs" className="nv-card">
            <header className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h3 id="msgs" className="font-semibold">
                Nachrichten
              </h3>
              <span className="text-xs text-muted">{app.messages.length}</span>
            </header>
            <ol className="p-5 space-y-5">
              {app.messages.map((m) => {
                const mine = m.direction === "APPLICANT_TO_TEAM";
                const author = m.asTeam ? null : m.author;
                const person = mine ? user : author;
                return (
                  <li key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                    <ChatAvatar direction={m.direction} person={person} botAvatarUrl={bot.avatarUrl} />
                    <div className={cn("max-w-[85%] min-w-0", mine && "text-right")}>
                      <p className="text-xs text-muted flex flex-wrap items-center gap-1.5" style={mine ? { justifyContent: "flex-end" } : undefined}>
                        <span className="font-medium text-fg-2">
                          {m.direction === "SYSTEM"
                            ? bot.name
                            : m.direction === "AI_TO_APPLICANT"
                              ? `${bot.name} (KI)`
                              : mine
                                ? "Du"
                                : personName(author, "Nordverkehr-Team")}
                        </span>
                        {!mine && <ChatRoleBadge direction={m.direction} person={author} />}
                        <span>· {formatDayTime(m.createdAt)}</span>
                      </p>
                      <div
                        className={cn(
                          "mt-1 inline-block text-left rounded-2xl px-4 py-3 text-sm leading-relaxed",
                          mine ? "bg-surface-2" : "bg-card border border-line",
                        )}
                      >
                        <DiscordMarkdown text={m.body} />
                      </div>
                      {!mine && m.deliveryStatus !== "NOT_SENT" && (
                        <div className="mt-1.5">
                          <DeliveryBadge status={m.deliveryStatus} />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {(active || followUp) && (
              <div className="border-t border-line p-5">
                {followUp && (
                  <p className="mb-3 text-xs text-muted">
                    Du hast die Bewerbung zurückgezogen. Falls das Team noch Fragen hat, kannst du hier bis zum{" "}
                    {formatDay(new Date(app.decidedAt!.getTime() + FOLLOW_UP_DAYS * 86_400_000))} antworten.
                  </p>
                )}
                {nightNotice && (
                  <p className="mb-3 text-xs text-muted" data-testid="night-notice">
                    🌙 {nightText}
                  </p>
                )}
                <ReplyBox applicationId={app.id} />
              </div>
            )}
          </section>

          <details className="nv-card group">
            <summary className="px-5 py-4 cursor-pointer font-semibold flex items-center justify-between list-none">
              Deine Antworten
              <span className="text-xs text-muted group-open:hidden">anzeigen</span>
            </summary>
            <dl className="border-t border-line divide-y divide-[var(--nv-border)]">
              <div className="px-5 py-3 grid gap-1 sm:grid-cols-[1fr_1.5fr] sm:gap-4">
                <dt className="text-xs text-muted">Alter</dt>
                <dd className="text-sm">{app.age ?? "–"}</dd>
              </div>
              {app.answers.map((a) => (
                <div key={a.id} className="px-5 py-3 grid gap-1 sm:grid-cols-[1fr_1.5fr] sm:gap-4">
                  <dt className="text-xs text-muted">{a.label}</dt>
                  <dd className="text-sm whitespace-pre-wrap break-words">
                    {a.type === "FILE" && Array.isArray(a.value) ? (
                      <span className="flex flex-wrap gap-2">
                        {(a.value as string[]).map((uid) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={uid} src={`/api/uploads/${uid}`} alt="" className="h-16 rounded-lg border border-line" />
                        ))}
                      </span>
                    ) : (
                      formatAnswerForDisplay(a.type, a.value as AnswerValue)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </div>

        <aside className="space-y-6">
          <div className="nv-card p-5">
            <p className="nv-mono">Status</p>
            <p className="mt-2 text-sm text-fg-2">{STATUS_HINT[app.status]}</p>
            <Timeline status={app.status} changes={app.statusChanges} />
          </div>
          <div className="nv-card p-5 text-sm space-y-2">
            <div className="flex justify-between gap-3">
              <span className="text-muted">Bewerbungs-ID</span>
              <span className="font-mono">{app.publicId}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted">Eingegangen</span>
              <span>{formatDay(app.submittedAt)}</span>
            </div>
            {app.decidedAt && (
              <div className="flex justify-between gap-3">
                <span className="text-muted">Abgeschlossen</span>
                <span>{formatDay(app.decidedAt)}</span>
              </div>
            )}
          </div>
          {active && <WithdrawButton applicationId={app.id} needsReason={isInProcessing(app)} />}
        </aside>
      </div>
    </div>
  );
}

function Timeline({ status, changes }: { status: ApplicationStatus; changes: { to: ApplicationStatus; createdAt: Date }[] }) {
  const reachedAt = (s: ApplicationStatus) => [...changes].reverse().find((c) => c.to === s)?.createdAt;
  const final = status === "REJECTED" || status === "WITHDRAWN" ? status : null;
  const steps: ApplicationStatus[] = final ? [...TIMELINE.slice(0, 3), final] : TIMELINE;
  const currentIdx = steps.indexOf(status);

  return (
    <ol className="mt-5 relative">
      {steps.map((s, i) => {
        const done = i < currentIdx || (i === currentIdx && (s === "ACCEPTED" || !!final));
        const current = i === currentIdx;
        const skipped = !reachedAt(s) && i < currentIdx;
        const bad = s === "REJECTED" || s === "WITHDRAWN";
        return (
          <li key={s} className="relative pl-8 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={cn("absolute left-[11px] top-6 bottom-0 w-px", i < currentIdx ? "bg-red" : "bg-[var(--nv-border)]")}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "absolute left-0 top-0.5 h-6 w-6 rounded-full grid place-items-center border",
                done && !bad && "bg-red border-red text-white",
                done && bad && "bg-[var(--tone-danger-bg)] border-[var(--tone-danger)] text-[var(--tone-danger)]",
                current && !done && "border-red text-red-text bg-red-soft",
                !done && !current && "border-line text-faint",
              )}
              aria-hidden
            >
              {done ? (bad ? <WarningCircle size={14} /> : <CheckCircle size={14} weight="bold" />) : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <p className={cn("text-sm", current ? "font-semibold" : skipped ? "text-faint" : "text-fg-2")}>
              {STATUS_LABEL[s]}
              {current && <span className="sr-only"> (aktueller Status)</span>}
            </p>
            {reachedAt(s) && <p className="text-xs text-muted">{formatDay(reachedAt(s))}</p>}
          </li>
        );
      })}
    </ol>
  );
}
