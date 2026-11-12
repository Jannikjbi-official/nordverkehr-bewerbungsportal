import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Moon, Sun } from "@phosphor-icons/react/ssr";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { loadSettingsProps } from "@/lib/admin/load";
import { SettingsForm } from "@/components/team/SettingsForm";
import { isNight, nightEndsAt } from "@/lib/night";
import { formatDayTime } from "@/components/ui";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[32rem]" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  await requireAdmin();
  const props = await loadSettingsProps();
  const s = props.settings;
  const now = new Date();
  const [pending, failed, waiting, tests] = await Promise.all([
    db.outboxJob.count({ where: { status: "PENDING", runAt: { lte: now } } }),
    db.outboxJob.count({ where: { status: "FAILED" } }),
    db.outboxJob.count({ where: { status: "PENDING", runAt: { gt: now } } }),
    db.application.count({ where: { isTest: true } }),
  ]);
  const night = isNight(s, now);
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="nv-card p-4">
          <p className="nv-mono">Nachtruhe</p>
          <p className="mt-1 flex items-center gap-2 font-semibold">
            {night ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
            {!s["night.enabled"] ? "aus" : night ? `aktiv bis ${s["night.end"]} Uhr` : `ab ${s["night.start"]} Uhr`}
          </p>
          {night && <p className="text-xs text-muted mt-1">Endet {formatDayTime(nightEndsAt(s, now))} Uhr</p>}
        </div>
        <div className="nv-card p-4">
          <p className="nv-mono">Zustellung</p>
          <p className="mt-1 font-semibold">{pending} fällig · {waiting} geplant</p>
          <p className="text-xs text-muted mt-1">„geplant“ = wartet auf Nachtruhe-Ende oder Wiederholung</p>
        </div>
        <div className="nv-card p-4">
          <p className="nv-mono">Fehlgeschlagen</p>
          <p className={`mt-1 font-semibold ${failed ? "text-[var(--tone-danger)]" : ""}`}>{failed}</p>
          <Link href="/team/admin/discord" className="text-xs nv-link">
            Ansehen
          </Link>
        </div>
        <div className="nv-card p-4">
          <p className="nv-mono">Testbewerbungen</p>
          <p className="mt-1 font-semibold">{tests}</p>
          <Link href="/team/admin/daten" className="text-xs nv-link">
            Anlegen / löschen
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Bereiche">
        {ADMIN_SECTIONS.map((sec) => (
          <Link key={sec.key} href={`/team/admin/${sec.key}`} className="nv-card p-5 group hover:border-red-line transition-colors">
            <p className="font-semibold flex items-center justify-between">
              {sec.label} <ArrowRight size={16} className="text-muted group-hover:text-red-text" aria-hidden />
            </p>
            <p className="text-sm text-muted mt-1">{sec.short}</p>
          </Link>
        ))}
        <Link href="/team/positionen" className="nv-card p-5 group hover:border-red-line transition-colors">
          <p className="font-semibold flex items-center justify-between">
            Positionen & Fragen <ArrowRight size={16} className="text-muted group-hover:text-red-text" aria-hidden />
          </p>
          <p className="text-sm text-muted mt-1">Stellen, Formularfragen, Quiz, Gesprächsvorlagen pro Stelle.</p>
        </Link>
      </section>

      <SettingsForm section="uebersicht" {...props} />
    </div>
  );
}
