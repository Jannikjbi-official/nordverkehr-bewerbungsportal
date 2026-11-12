import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/team/SettingsForm";
import { DiscordDiagnostics, type FailedJob } from "@/components/team/DiscordDiagnostics";
import { HelpLink } from "@/components/team/HelpLink";
import { DangerZone } from "@/components/team/DangerZone";
import { TestDataPanel } from "@/components/team/TestDataPanel";
import { TEST_SCENARIOS } from "@/lib/setup/test-applications";
import { RESET_CONFIRM_PHRASE, countApplications } from "@/lib/team/reset";
import { db } from "@/lib/db";
import { formatDayTime } from "@/components/ui";
import { formatUsd, isAiConfigured } from "@/lib/ai/config";
import { monthlySpendMicro } from "@/lib/ai/service";

export const metadata: Metadata = { title: "Einstellungen" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Admin // Einstellungen</p>
        <h1 className="nv-headline text-4xl mt-2">
          Ein&shy;<em>stellungen.</em>
        </h1>
      </header>
      <Suspense fallback={<div className="nv-skeleton h-[40rem]" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin();
  const [settings, spend] = await Promise.all([getSettings(), monthlySpendMicro()]);
  const env = {
    bot: !!process.env.DISCORD_BOT_TOKEN,
    guild: !!process.env.DISCORD_GUILD_ID,
    teamRole: !!process.env.TEAM_ROLE_ID,
    adminRole: !!process.env.ADMIN_ROLE_ID,
    logChannel: !!process.env.DISCORD_LOG_CHANNEL_ID,
    anthropic: isAiConfigured(),
  };
  const [failedJobs, pending, appCounts, positions, testCount] = await Promise.all([
    db.outboxJob.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.outboxJob.count({ where: { status: "PENDING" } }),
    countApplications(db),
    db.position.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, title: true, status: true } }),
    db.application.count({ where: { isTest: true } }),
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
    <div className="space-y-6">
      <section className="nv-card p-5 sm:p-6">
        <h2 className="font-semibold text-lg">Discord-Zustellung prüfen</h2>
        <p className="text-sm text-muted mb-4">
          Schickt eine Testnachricht direkt an den Kanal und zeigt den genauen Fehler von Discord, falls es nicht klappt.{" "}
          <HelpLink id="discord-kanaele" label="Welcher Kanal wofür?" />
        </p>
        <DiscordDiagnostics failed={failed} pending={pending} />
      </section>
      {/* Neu aufbauen, wenn ein Knopf oben eine Einstellung ändert – sonst würde „Speichern“ den alten Wert zurückschreiben */}
      <SettingsForm key={String(settings["discord.claimButton"])} settings={settings} env={env} spend={formatUsd(spend)} spendMicro={spend} />
      <TestDataPanel positions={positions} scenarios={TEST_SCENARIOS.map(({ key, label, description }) => ({ key, label, description }))} existing={testCount} />
      <DangerZone counts={appCounts} phrase={RESET_CONFIRM_PHRASE} />
    </div>
  );
}
