"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CaretDown, ClipboardText, Gear, Lightbulb, ShieldCheck, SignOut, UserCircle } from "@phosphor-icons/react/ssr";
import { signOutAction } from "@/app/actions/auth";

interface Props {
  name: string;
  username: string;
  avatar: string;
  isTeam: boolean;
  isAdmin: boolean;
}

export function UserMenuDropdown({ name, username, avatar, isTeam, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-fg-2 hover:text-fg hover:bg-[color-mix(in_srgb,var(--nv-text)_6%,transparent)] transition-colors";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 border border-line hover:border-line-strong transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
        <span className="hidden md:block text-sm font-medium max-w-[9rem] truncate">{name}</span>
        <CaretDown size={12} className="text-muted" aria-hidden />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-[var(--nv-shadow)] nv-fade z-50"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-semibold truncate">{name}</p>
            <p className="text-xs text-muted truncate">@{username}</p>
            {isTeam && (
              <span className="nv-pill nv-pill-red mt-2 !text-[0.68rem]">
                <ShieldCheck size={12} weight="fill" aria-hidden />
                {isAdmin ? "Team · Admin" : "Team"}
              </span>
            )}
          </div>
          <div className="nv-divider my-1.5" />
          <Link href="/dashboard" className={item} role="menuitem" onClick={() => setOpen(false)}>
            <ClipboardText size={17} aria-hidden /> Meine Bewerbungen
          </Link>
          {isTeam && (
            <Link href="/team" className={item} role="menuitem" onClick={() => setOpen(false)}>
              <ShieldCheck size={17} aria-hidden /> Team-Bereich
            </Link>
          )}
          {isAdmin && (
            <Link href="/team/admin" className={item} role="menuitem" onClick={() => setOpen(false)}>
              <Gear size={17} aria-hidden /> Admin-Bereich
            </Link>
          )}
          <Link href="/ideen" className={item} role="menuitem" onClick={() => setOpen(false)}>
            <Lightbulb size={17} aria-hidden /> Ideen &amp; Fehler
          </Link>
          <Link href="/konto" className={item} role="menuitem" onClick={() => setOpen(false)}>
            <UserCircle size={17} aria-hidden /> Konto &amp; Daten
          </Link>
          <div className="nv-divider my-1.5" />
          <form action={signOutAction}>
            <button type="submit" className={`${item} w-full`} role="menuitem">
              <SignOut size={17} aria-hidden /> Abmelden
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
