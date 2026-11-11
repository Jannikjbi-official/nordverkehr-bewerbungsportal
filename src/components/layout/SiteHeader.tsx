import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { DiscordLogo } from "@phosphor-icons/react/ssr";
import { publicEnv } from "@/lib/env";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { UserMenu } from "@/components/layout/UserMenu";

const main = publicEnv.mainSiteUrl;

/** Gleiche Navigation wie auf nordverkehr.xyz – plus Bewerbungsbereich. */
export const MAIN_LINKS = [
  { href: `${main}/`, label: "Start" },
  { href: `${main}/ueber-uns`, label: "Über uns" },
  { href: `${main}/team`, label: "Team" },
  { href: `${main}/regeln`, label: "Regeln" },
  { href: `${main}/#faq`, label: "FAQ" },
];

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
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="flex items-center shrink-0" aria-label="Nordverkehr Bewerbungsportal – Startseite">
              <Image
                src="/Nord-Verkehr-Wordmark.png"
                alt="Nordverkehr"
                width={753}
                height={148}
                loading="eager"
                fetchPriority="high"
                className="h-[22px] sm:h-[24px] w-auto"
              />
            </Link>
            <div className="hidden lg:flex items-center gap-0.5">
              {MAIN_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-fg hover:bg-[color-mix(in_srgb,var(--nv-text)_5%,transparent)] transition-colors"
                >
                  {l.label}
                </a>
              ))}
              <Link
                href="/"
                className="relative px-3 py-2 rounded-lg text-sm font-medium text-fg after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-[2px] after:bg-red after:rounded-full"
              >
                Bewerben
              </Link>
            </div>
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
            <MobileMenu links={MAIN_LINKS} discordInvite={publicEnv.discordInvite} />
          </div>
        </nav>
      </div>
    </header>
  );
}
