import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { DiscordLogo, Microphone } from "@phosphor-icons/react/ssr";
import { Container } from "@/components/ui";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "So läuft dein Gespräch", description: "Vorbereitung aufs Bewerbungsgespräch bei Nordverkehr – auf Discord." };

/** Öffentliche Seite zur Vorbereitung aufs Bewerbungsgespräch (Text im Admin-Bereich anpassbar). */
export default function InterviewPrepPage() {
  return (
    <section className="pt-28 sm:pt-32 pb-12">
      <Container>
        <div className="mx-auto max-w-2xl space-y-6">
          <header>
            <p className="nv-label">Bewerbung // Gespräch</p>
            <h1 className="nv-headline text-5xl mt-3">
              So läuft dein <em>Gespräch.</em>
            </h1>
            <p className="mt-3 text-lg text-muted flex items-center gap-2">
              <Microphone size={20} aria-hidden /> Auf unserem Discord, im Sprachkanal – locker und ohne Druck.
            </p>
          </header>
          <Suspense fallback={<div className="nv-skeleton h-72" />}>
            <Content />
          </Suspense>
          <Link href="/dashboard" className="nv-btn nv-btn-ghost">
            Zu meinen Bewerbungen
          </Link>
        </div>
      </Container>
    </section>
  );
}

async function Content() {
  await connection();
  const s = await getSettings();
  const guild = process.env.DISCORD_GUILD_ID;
  const waiting = s["interview.waitingRoomChannelId"] || s["interview.voiceChannelId"];
  return (
    <div className="space-y-4">
      <div className="nv-card p-6">
        <DiscordMarkdown text={s["interview.prepText"]} className="text-fg-2 [&_strong]:text-fg" />
      </div>
      {guild && waiting && (
        <a href={`https://discord.com/channels/${guild}/${waiting}`} target="_blank" rel="noopener noreferrer" className="nv-btn nv-btn-discord">
          <DiscordLogo size={18} weight="fill" aria-hidden /> {s["interview.waitingRoomChannelId"] ? "Zum Warteraum auf Discord" : "Zum Gesprächskanal auf Discord"}
        </a>
      )}
    </div>
  );
}
