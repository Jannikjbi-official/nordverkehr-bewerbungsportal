import type { Metadata } from "next";
import { hiddenPositionIds, viewerOf } from "@/lib/team/visibility";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarBlank } from "@phosphor-icons/react/ssr";
import { EmptyState, formatDay } from "@/components/ui";
import { DeleteSlotButton, SlotCreator } from "@/components/team/SlotManager";
import { HelpLink } from "@/components/team/HelpLink";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/time";

export const metadata: Metadata = { title: "Termine" };

export default function SlotsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Termine</p>
        <h1 className="nv-headline text-4xl mt-2">
          Gesprächs&shy;<em>termine.</em>
        </h1>
        <p className="mt-2 text-muted max-w-2xl">
          Lege freie Zeiten an – Bewerber im Status „Gespräch“ buchen sich selbst einen Termin im Portal. Am Tag des Gesprächs bekommen sie morgens eine
          Erinnerung per DM. <HelpLink id="termine" />
        </p>
      </header>
      <SlotCreator />
      <Suspense fallback={<div className="nv-skeleton h-64" />}>
        <SlotList />
      </Suspense>
    </div>
  );
}

const time = (d: Date) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(d);
const dayKey = (d: Date) => new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(d);

async function SlotList() {
  const { user, access } = await requireTeam();
  const hidden = new Set(await hiddenPositionIds(viewerOf(user, access)));
  const slots = await db.interviewSlot.findMany({
    where: { startsAt: { gte: daysAgo(1) } },
    include: { application: { select: { id: true, publicId: true, status: true, user: { select: { globalName: true, username: true } }, position: { select: { id: true, title: true } } } } },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  if (!slots.length) {
    return (
      <EmptyState icon={CalendarBlank} title="Noch keine Termine">
        Leg oben ein paar freie Zeiten an, zum Beispiel einen Abend mit 4 Terminen à 30 Minuten.
      </EmptyState>
    );
  }
  const days = new Map<string, typeof slots>();
  for (const s of slots) days.set(dayKey(s.startsAt), [...(days.get(dayKey(s.startsAt)) ?? []), s]);
  const free = slots.filter((s) => !s.applicationId && s.startsAt > new Date()).length;

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted">
        {slots.length} Termine ab gestern · <strong className="text-fg">{free}</strong> frei
      </p>
      {[...days.entries()].map(([day, list]) => (
        <div key={day} className="nv-card">
          <h2 className="px-5 py-3 border-b border-line font-semibold">{day}</h2>
          <ul className="divide-y divide-[var(--nv-border)]">
            {list.map((s) => {
              const past = s.startsAt < new Date();
              return (
                <li key={s.id} className="px-5 py-2.5 flex flex-wrap items-center gap-3 text-sm">
                  <span className={`font-mono tabular-nums ${past ? "text-faint" : ""}`}>
                    {time(s.startsAt)}–{time(new Date(s.startsAt.getTime() + s.durationMin * 60_000))}
                  </span>
                  {s.application && hidden.has(s.application.position.id) ? (
                    <span className="nv-pill">gebucht (andere Stelle)</span>
                  ) : s.application ? (
                    <Link href={`/team/bewerbungen/${s.application.id}`} className="nv-link">
                      {s.application.user.globalName || s.application.user.username} · {s.application.position.title} · {s.application.publicId}
                    </Link>
                  ) : (
                    <span className={`nv-pill ${past ? "" : "nv-tone-success"}`}>{past ? "nicht gebucht" : "frei"}</span>
                  )}
                  {s.note && <span className="text-xs text-muted truncate">{s.note}</span>}
                  <span className="flex-1" />
                  {(!s.applicationId || past) && <DeleteSlotButton slotId={s.id} booked={!!s.applicationId} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted">Termine älter als gestern werden hier ausgeblendet. Stand {formatDay(new Date())}.</p>
    </section>
  );
}
