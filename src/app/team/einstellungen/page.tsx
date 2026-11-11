import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/team/SettingsForm";
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
  return <SettingsForm settings={settings} env={env} spend={formatUsd(spend)} spendMicro={spend} />;
}
