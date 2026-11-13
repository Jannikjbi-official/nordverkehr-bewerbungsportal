import { nowMs } from "@/lib/time";
import { AwayForm } from "@/components/AwayForm";
import { setTeamAwayAction } from "@/app/actions/application";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DownloadSimple } from "@phosphor-icons/react/ssr";
import { Avatar, Container, PageHero, formatDay } from "@/components/ui";
import { DeleteAccount, SignOutEverywhere } from "@/components/dashboard/AccountActions";
import { requireUser } from "@/lib/auth/session";
import { NotifyToggle } from "@/components/NotifyToggle";
import { DigestToggle } from "@/components/DigestToggle";
import { CalendarLink } from "@/components/CalendarLink";
import { publicEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Konto & Daten", robots: { index: false } };

export default function AccountPage() {
  return (
    <>
      <PageHero label="NORDVERKEHR // KONTO" title="Deine" emphasis="Daten." compact>
        <p>Transparent: Was wir über dich speichern, wie du es exportierst und wie du alles löschst.</p>
      </PageHero>
      <Container>
        <Suspense fallback={<div className="nv-skeleton h-96" />}>
          <Account />
        </Suspense>
      </Container>
    </>
  );
}

async function Account() {
  const user = await requireUser("/konto");
  const [apps, messages, me, settings] = await Promise.all([
    db.application.count({ where: { userId: user.id } }),
    db.message.count({ where: { application: { userId: user.id } } }),
    db.user.findUnique({ where: { id: user.id }, select: { isTeam: true, digestOptOut: true, calendarToken: true, awayUntil: true } }),
    getSettings(),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="nv-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar discordId={user.discordId} avatar={user.avatar} size={56} />
          <div>
            <p className="font-semibold text-lg">{user.globalName || user.username}</p>
            <p className="text-sm text-muted">@{user.username}</p>
          </div>
        </div>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between">
            <dt className="text-muted">Discord-ID</dt>
            <dd className="font-mono text-xs">{user.discordId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Im Portal seit</dt>
            <dd>{formatDay(user.createdAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Bewerbungen (inkl. Entwürfe)</dt>
            <dd>{apps}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Nachrichten</dt>
            <dd>{messages}</dd>
          </div>
        </dl>
        <SignOutEverywhere />
      </section>

      <section className="nv-card p-6 space-y-4">
        <h2 className="font-semibold">Benachrichtigungen</h2>
        <p className="text-sm text-muted">Gerade keine passende Stelle offen? Wir sagen dir per Discord-DM Bescheid, sobald eine Stelle (wieder) öffnet.</p>
        <NotifyToggle on={!!user.notifyNewPositions} />
        {me?.isTeam && (
          <>
            <div className="nv-divider" />
            <DigestToggle on={!me.digestOptOut} globallyOff={!settings["team.personalDigestEnabled"]} />
            <div className="nv-divider" />
            <CalendarLink url={me.calendarToken ? `${publicEnv.appUrl}/api/calendar/${me.calendarToken}.ics` : null} />
            <div className="nv-divider" />
            <AwayForm
              until={me.awayUntil?.toISOString() ?? null}
              nowMs={nowMs()}
              maxDays={60}
              title="Abwesenheit (Team)"
              help="Solange bekommst du keine neuen Bewerbungen zugeteilt, keine Claim-Erinnerungen und keine Morgen-DM. In der Team-Übersicht steht bei deinen Bewerbungen „abwesend“."
              save={setTeamAwayAction}
            />
          </>
        )}
      </section>

      <section className="nv-card p-6 space-y-4">
        <h2 className="font-semibold">Datenexport</h2>
        <p className="text-sm text-muted">
          Lade alle Daten herunter, die wir zu deinem Account gespeichert haben (Art. 15 &amp; 20 DSGVO) – als JSON-Datei.
        </p>
        <a href="/api/me/export" className="nv-btn nv-btn-ghost" download>
          <DownloadSimple size={16} aria-hidden /> Daten exportieren
        </a>
        <div className="nv-divider" />
        <h2 className="font-semibold">Account löschen</h2>
        <p className="text-sm text-muted">
          Löscht deinen Account, alle Bewerbungen, Antworten, Bilder, Nachrichten sowie deine Ideen und Fehlermeldungen endgültig (Art. 17 DSGVO). Im Audit-Log
          bleiben nur anonymisierte Einträge.
        </p>
        <DeleteAccount />
      </section>
    </div>
  );
}
