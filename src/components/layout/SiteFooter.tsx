import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, DiscordLogo } from "@phosphor-icons/react/ssr";
import { publicEnv } from "@/lib/env";

export function SiteFooter() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Image src="/Nord-Verkehr-Wordmark.png" alt="Nordverkehr" width={753} height={148} className="h-6 w-auto" />
          <p className="text-sm text-muted max-w-sm">
            Ehrliches Roleplay – kein Showbusiness. Das Bewerbungsportal für alle, die Nordverkehr mit aufbauen wollen.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={publicEnv.mainSiteUrl} className="nv-btn nv-btn-ghost nv-btn-sm">
              nordverkehr.xyz <ArrowUpRight size={13} aria-hidden />
            </a>
            <a href={publicEnv.discordInvite} target="_blank" rel="noopener noreferrer" className="nv-btn nv-btn-ghost nv-btn-sm">
              <DiscordLogo size={15} weight="fill" aria-hidden /> Discord
            </a>
          </div>
        </div>
        <nav aria-label="Portal" className="space-y-2 text-sm">
          <p className="nv-mono mb-3">Portal</p>
          <Link className="block text-fg-2 hover:text-fg" href="/">Offene Positionen</Link>
          <Link className="block text-fg-2 hover:text-fg" href="/passt-zu-mir">Welche Stelle passt zu mir?</Link>
          <Link className="block text-fg-2 hover:text-fg" href="/gespraech">So läuft das Gespräch</Link>
          <Link className="block text-fg-2 hover:text-fg" href="/dashboard">Meine Bewerbungen</Link>
          <Link className="block text-fg-2 hover:text-fg" href="/konto">Konto &amp; Daten</Link>
          <Link className="block text-fg-2 hover:text-fg" href="/datenschutz">Datenschutz</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 sm:px-6 py-5 text-xs text-faint">
          Nordverkehr ist ein Roleplay-Projekt und steht in keiner Verbindung zu Rockstar Games oder Take-Two Interactive.
        </p>
      </div>
    </footer>
  );
}
