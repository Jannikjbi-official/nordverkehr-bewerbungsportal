import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
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

const TABLE_LABEL: Record<string, string> = {
  Upload: "Bilder",
  Application: "Bewerbungen",
  Answer: "Antworten",
  Message: "Nachrichten",
  AuditLog: "Audit-Log",
  OutboxJob: "Zustellungen",
  RateLimit: "Spam-Schutz",
  Setting: "Einstellungen",
  User: "Nutzer",
  Comment: "Kommentare",
  Question: "Fragen",
  Position: "Stellen",
  MessageTemplate: "Bausteine",
  FormSection: "Formular-Abschnitte",
  StatusChange: "Statusverlauf",
  Rating: "Bewertungen",
};

async function StoragePanel() {
  const { storageInfo, formatBytes } = await import("@/lib/admin/storage");
  // Speicher-Abfrage darf die Admin-Seite nie lahmlegen
  const [info, s] = await Promise.all([storageInfo().catch((e) => (console.error("[storage]", e), null)), getSettings()]);
  if (!info) return <p className="nv-card p-5 text-sm text-muted">Speicher-Anzeige gerade nicht verfügbar.</p>;
  const limit = s["storage.limitMb"] * 1024 * 1024;
  const pct = Math.min(100, Math.round((info.totalBytes / limit) * 100));
  const tone = pct >= 85 ? "var(--tone-danger)" : pct >= 65 ? "var(--tone-warn)" : "var(--tone-success)";
  return (
    <section className="nv-card p-5 space-y-4" data-testid="storage-panel">
      <div>
        <h2 className="font-semibold">Speicher</h2>
        <p className="text-sm text-muted">Datenbank inklusive Bilder (die liegen direkt in der Datenbank).</p>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span>
            <strong className="font-display text-2xl tabular-nums">{formatBytes(info.totalBytes)}</strong> <span className="text-muted">von {formatBytes(limit)}</span>
          </span>
          <span className="tabular-nums text-muted">{pct} %</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Speicher belegt">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
        </div>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {info.tables.map((t) => (
          <li key={t.name} className="flex justify-between gap-3">
            <span className="text-fg-2 truncate">{TABLE_LABEL[t.name] ?? t.name}</span>
            <span className="tabular-nums text-muted">{formatBytes(t.bytes)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {info.uploads.count === 1 ? "1 Bild" : `${info.uploads.count} Bilder`} ({formatBytes(info.uploads.bytes)}), davon {info.uploads.decided} aus entschiedenen Bewerbungen ({formatBytes(info.uploads.decidedBytes)}).{" "}
        {s["retention.uploadDays"]
          ? `Sie werden ${s["retention.uploadDays"]} Tage nach der Entscheidung automatisch gelöscht.`
          : "Tipp: Unter „Löschfristen“ kannst du Bilder nach der Entscheidung automatisch löschen lassen – die Bewerbung bleibt erhalten."}
      </p>
    </section>
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
      <StoragePanel />
      <ConfigBackupPanel />
      <TestDataPanel positions={positions} scenarios={TEST_SCENARIOS.map(({ key, label, description }) => ({ key, label, description }))} existing={testCount} />
      <DangerZone counts={appCounts} phrase={RESET_CONFIRM_PHRASE} />
    </>
  );
}
