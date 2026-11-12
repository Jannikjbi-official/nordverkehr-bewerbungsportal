"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";

/** Unternavigation im Admin-Bereich. */
export function AdminNav() {
  const path = usePathname();
  const items = [{ href: "/team/admin", label: "Übersicht" }, ...ADMIN_SECTIONS.map((s) => ({ href: `/team/admin/${s.key}`, label: s.label }))];
  return (
    <nav aria-label="Admin-Bereich" className="flex flex-wrap gap-1.5">
      {items.map((i) => {
        const active = path === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`nv-pill transition-colors ${active ? "nv-pill-red" : "hover:text-fg"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
