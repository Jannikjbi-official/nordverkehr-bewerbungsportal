"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarBlank,
  ChartBar,
  ChatsCircle,
  ClipboardText,
  ClockCounterClockwise,
  Gear,
  House,
  ListDashes,
  Megaphone,
  Question,
  Users,
} from "@phosphor-icons/react/ssr";

const ITEMS = [
  { href: "/team", label: "Übersicht", icon: House, exact: true },
  { href: "/team/bewerbungen", label: "Bewerbungen", icon: ClipboardText },
  { href: "/team/termine", label: "Termine", icon: CalendarBlank },
  { href: "/team/bausteine", label: "Nachrichtenbausteine", icon: ChatsCircle },
  { href: "/team/nutzer", label: "Nutzer & Sperren", icon: Users },
  { href: "/team/statistiken", label: "Statistiken", icon: ChartBar },
  { href: "/team/audit", label: "Audit-Log", icon: ClockCounterClockwise },
  { href: "/team/changelog", label: "Changelog", icon: Megaphone },
  { href: "/team/hilfe", label: "Hilfe & Begriffe", icon: Question },
];
const ADMIN = [
  { href: "/team/positionen", label: "Positionen & Fragen", icon: ListDashes },
  { href: "/team/admin", label: "Admin-Bereich", icon: Gear },
];

export function TeamNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));

  const link = (i: (typeof ITEMS)[number]) => {
    const active = isActive(i.href, "exact" in i ? i.exact : false);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 shrink-0 rounded-lg px-3 py-2 text-sm transition-colors ${
          active ? "bg-red-soft text-fg font-medium" : "text-muted hover:text-fg hover:bg-card-hover"
        }`}
      >
        <i.icon size={17} weight={active ? "fill" : "regular"} className={active ? "text-red-text" : ""} aria-hidden />
        {i.label}
      </Link>
    );
  };

  return (
    <nav aria-label="Team-Bereich" className="lg:sticky lg:top-28 self-start">
      <p className="nv-label hidden lg:flex mb-4">Team-Bereich</p>
      <div className="flex gap-1 overflow-x-auto pb-2 lg:pb-0 lg:flex-col nv-scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
        {ITEMS.map(link)}
        {isAdmin && (
          <>
            <p className="nv-mono hidden lg:block mt-5 mb-1 px-3">Admin</p>
            {ADMIN.map(link)}
          </>
        )}
      </div>
    </nav>
  );
}
