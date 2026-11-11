"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

export const PORTAL_LINKS = [
  { href: "/", label: "Positionen", match: (p: string) => p === "/" || p.startsWith("/positionen") || p.startsWith("/bewerben") },
  { href: "/dashboard", label: "Meine Bewerbungen", match: (p: string) => p.startsWith("/dashboard") },
];

const base = "relative px-3 py-2 rounded-lg text-sm font-medium transition-colors";
const idle = "text-muted hover:text-fg hover:bg-[color-mix(in_srgb,var(--nv-text)_5%,transparent)]";
const current = "text-fg after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-[2px] after:bg-red after:rounded-full";

/**
 * Navigation nur für das Bewerbungsportal (keine Links der Hauptseite).
 * usePathname() hängt an der Request-URL → in eine Suspense-Grenze, damit
 * dynamische Routen weiter vorgerendert werden können (Cache Components).
 * Die Fallback-Variante sind dieselben Links ohne Hervorhebung.
 */
export function PortalNavLinks() {
  return (
    <div className="hidden lg:flex items-center gap-0.5">
      <Suspense fallback={<Links active={null} />}>
        <ActiveLinks />
      </Suspense>
    </div>
  );
}

function ActiveLinks() {
  const path = usePathname();
  return <Links active={path} />;
}

function Links({ active }: { active: string | null }) {
  return (
    <>
      {PORTAL_LINKS.map((l) => {
        const isActive = active !== null && l.match(active);
        return (
          <Link key={l.href} href={l.href} aria-current={isActive ? "page" : undefined} className={`${base} ${isActive ? current : idle}`}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
