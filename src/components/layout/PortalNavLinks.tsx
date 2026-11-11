"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PORTAL_LINKS = [
  { href: "/", label: "Positionen", match: (p: string) => p === "/" || p.startsWith("/positionen") || p.startsWith("/bewerben") },
  { href: "/dashboard", label: "Meine Bewerbungen", match: (p: string) => p.startsWith("/dashboard") },
];

/** Navigation nur für das Bewerbungsportal (keine Links der Hauptseite). */
export function PortalNavLinks() {
  const path = usePathname();
  return (
    <div className="hidden lg:flex items-center gap-0.5">
      {PORTAL_LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "text-fg after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-[2px] after:bg-red after:rounded-full"
                : "text-muted hover:text-fg hover:bg-[color-mix(in_srgb,var(--nv-text)_5%,transparent)]"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
