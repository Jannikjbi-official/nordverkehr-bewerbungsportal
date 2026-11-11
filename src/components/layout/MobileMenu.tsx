"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DiscordLogo, List, X } from "@phosphor-icons/react/ssr";

interface Props {
  links: { href: string; label: string }[];
  discordInvite: string;
}

export function MobileMenu({ links, discordInvite }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const portal = [
    { href: "/", label: "Offene Positionen" },
    { href: "/dashboard", label: "Meine Bewerbungen" },
    { href: "/konto", label: "Konto & Daten" },
  ];

  return (
    <>
      <button
        type="button"
        className="lg:hidden nv-btn nv-btn-quiet !p-2 rounded-lg"
        aria-label={open ? "Menü schließen" : "Menü öffnen"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={22} aria-hidden /> : <List size={22} aria-hidden />}
      </button>

      {open &&
        createPortal(
        <div
          className="fixed inset-0 z-30 lg:hidden flex flex-col justify-center items-center nv-fade"
          style={{ background: "var(--nv-overlay)", backdropFilter: "blur(24px)" }}
        >
          <nav aria-label="Mobile Navigation" className="flex flex-col items-center gap-1.5 w-full max-w-xs px-6">
            <p className="nv-mono mb-2">Bewerbungsportal</p>
            {portal.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="nv-anim w-full text-center py-3 rounded-xl text-lg font-medium border border-line hover:bg-card-hover"
                style={{ "--i": i } as React.CSSProperties}
              >
                {l.label}
              </Link>
            ))}
            <div className="nv-divider w-full my-3" />
            <p className="nv-mono mb-1">Nordverkehr</p>
            {links.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                className="nv-anim w-full text-center py-2 rounded-xl text-base text-fg-2 hover:text-fg"
                style={{ "--i": i + portal.length } as React.CSSProperties}
              >
                {l.label}
              </a>
            ))}
            <a
              href={discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="nv-btn nv-btn-discord w-full mt-4"
            >
              <DiscordLogo weight="fill" size={18} aria-hidden /> Discord beitreten
            </a>
          </nav>
          <p className="absolute bottom-10 nv-mono">NORDVERKEHR // TEAM</p>
        </div>,
          document.body,
        )}
    </>
  );
}
