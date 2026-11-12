import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ADMIN_SECTIONS, adminSection } from "@/lib/admin/sections";
import { loadSettingsProps } from "@/lib/admin/load";
import { SettingsForm } from "@/components/team/SettingsForm";
import { DiscordDiagnostics, type FailedJob } from "@/components/team/DiscordDiagnostics";
import { HelpLink } from "@/components/team/HelpLink";
import { DangerZone } from "@/components/team/DangerZone";
import { TestDataPanel } from "@/components/team/TestDataPanel";
import { ConfigBackupPanel } from "@/components/team/ConfigBackupPanel";
import { TEST_SCENARIOS } from "@/lib/setup/test-applications";
import { RESET_CONFIRM_PHRASE, countApplications } from "@/lib/team/reset";
import { formatDayTime } from "@/components/ui";
import { isNight, nightEndsAt } from "@/lib/night";

export function generateStaticParams() {
  return ADMIN_SECTIONS.map((s) => ({ bereich: s.key }));
}

export async function generateMetadata({ params }: PageProps<"/team/admin/[bereich]">): Promise<Metadata> {
  const sec = adminSection((await params).bereich);
  return { title: sec ? `${sec.label} · Admin` : "Admin" };
}

export default function AdminSectionPage({ params }: PageProps<"/team/admin/[bereich]">) {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[40rem]" />}>
      <Section params={params} />
    </Suspense>
  );
}

async function Section({ params }: Pick<PageProps<"/team/admin/[bereich]">, "params">) {
  await requireAdmin();
  const sec = adminSection((await params).bereich);
  if (!sec) notFound();
  const props = await loadSettingsProps();

  return (
    <div className="space-y-6">
      <section className="nv-card p-5 sm:p-6">
        <h2 className="font-semibold text-lg">{sec.label}</h2>
        <p className="text-sm text-muted mt-1 max-w-3xl">{sec.intro}</p>
        {sec.key === "bewerbungen" && (
          <p className="text-sm mt-3">
            <Link href="/team/positionen" className="nv-link">
              → Positionen & Fragen bearbeiten
            </Link>
          </p>
        )}
      </section>
      {sec.key === "discord" && <DiscordTools />}
      {sec.key === "zustellung" && <DeliveryStatus />}
      {/* Neu aufbauen, wenn ein Knopf oben eine Einstellung ändert – sonst würde „Speichern“ den alten Wert zurückschreiben */}
      <SettingsForm key={String(props.settings["discord.claimButton"])} section={sec.key} {...props} />
      {sec.key === "daten" && <DataTools />}
    </div>
  );
}

async function DiscordTools() {
  const [failedJobs, pending] = await Promise.all([
    db.outboxJob.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.outboxJob.count({ where: { status: "PENDING", runAt: { lte: new Date() } } }),
  ]);
  const failed: FailedJob[] = failedJobs.map((j) => {
    const p = j.payload as { type?: string; channelId?: string; purpose?: string };
    return {
      id: j.id,
      type: j.type,
      status: j.status,
      target: p.type === "CHANNEL_MESSAGE" ? `Kanal ${p.channelId}` : p.type === "DM" ? `DM (${p.purpose ?? "?"})` : "–",
      error: j.lastError,
      when: formatDayTime(j.updatedAt),
    };
  });
  return (
    <section className="nv-card p-5 sm:p-6">
      <h2 className="font-semibold text-lg">Discord-Zustellung prüfen</h2>
      <p className="text-sm text-muted mb-4">
        Schickt eine Testnachricht direkt an den Kanal und zeigt den genauen Fehler von Discord, falls es nicht klappt.{" "}
        <HelpLink id="discord-kanaele" label="Welcher Kanal wofür?" />
      </p>
      <DiscordDiagnostics failed={failed} pending={pending} />
    </section>
  );
}

async function DeliveryStatus() {
  const { getSettings } = await import("@/lib/settings");
  const s = await getSettings();
  const now = new Date();
  const waiting = await db.outboxJob.count({ where: { status: "PENDING", runAt: { gt: now } } });
  const night = isNight(s, now);
  return (
    <p className={`rounded-xl border px-4 py-3 text-sm ${night ? "nv-tone-info" : "border-line text-muted"}`} role="status">
      {!s["night.enabled"]
        ? "Nachtruhe ist aus – alles geht sofort raus."
        : night
          ? `🌙 Gerade ist Nachtruhe bis ${formatDayTime(nightEndsAt(s, now))} Uhr. ${waiting} Zustellung(en) warten.`
          : `☀️ Gerade ist keine Nachtruhe (beginnt um ${s["night.start"]} Uhr).${waiting ? ` ${waiting} Zustellung(en) sind für später geplant.` : ""}`}
    </p>
  );
}

async function DataTools() {
  const [appCounts, positions, testCount] = await Promise.all([
    countApplications(db),
    db.position.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, title: true, status: true } }),
    db.application.count({ where: { isTest: true } }),
  ]);
  return (
    <>
      <ConfigBackupPanel />
      <TestDataPanel positions={positions} scenarios={TEST_SCENARIOS.map(({ key, label, description }) => ({ key, label, description }))} existing={testCount} />
      <DangerZone counts={appCounts} phrase={RESET_CONFIRM_PHRASE} />
    </>
  );
}
