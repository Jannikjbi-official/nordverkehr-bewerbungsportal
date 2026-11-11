import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { DiscordLogo } from "@phosphor-icons/react/ssr";
import { publicEnv } from "@/lib/env";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { UserMenu } from "@/components/layout/UserMenu";
import { PortalNavLinks } from "@/components/layout/PortalNavLinks";

/** Kopfzeile des Bewerbungsportals – nur Portal-Navigation (Hauptseite steht im Footer). */
export function SiteHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-40">
      <div className="h-[2px] bg-red" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-3 sm:pt-4">
        <nav
          aria-label="Hauptnavigation"
          className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 sm:px-5 py-2.5 backdrop-blur-xl"
          style={{ background: "var(--nv-overlay)" }}
        >
          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
            <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Nordverkehr Bewerbungsportal – Startseite">
              <Image
                src="/Nord-Verkehr-Wordmark.png"
                alt="Nordverkehr"
                width={753}
                height={148}
                loading="eager"
                fetchPriority="high"
                className="h-[22px] sm:h-[24px] w-auto"
              />
              <span className="hidden sm:inline nv-mono !text-[0.65rem] border-l border-line pl-3">Bewerbung</span>
            </Link>
            <PortalNavLinks />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Suspense fallback={<div className="h-9 w-9 rounded-full nv-skeleton" aria-hidden />}>
              <UserMenu />
            </Suspense>
            <a
              href={publicEnv.discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex nv-btn nv-btn-discord nv-btn-sm !px-3.5 !py-2"
            >
              <DiscordLogo weight="fill" size={16} aria-hidden />
              Discord
            </a>
            <MobileMenu discordInvite={publicEnv.discordInvite} />
          </div>
        </nav>
      </div>
    </header>
  );
}
