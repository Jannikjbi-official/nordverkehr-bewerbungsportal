"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react/ssr";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";

type Look = "dark" | "light";

/** Farben wie im Discord-Client (dunkles bzw. helles Design). */
const THEME: Record<Look, { bg: string; text: string; name: string; muted: string; card: string; line: string; button: string; buttonText: string; avatarBg: string }> = {
  dark: { bg: "#313338", text: "#dbdee1", name: "#ffffff", muted: "#949ba4", card: "#2b2d31", line: "#3f4147", button: "#4e5058", buttonText: "#ffffff", avatarBg: "#1e1f22" },
  light: { bg: "#ffffff", text: "#313338", name: "#060607", muted: "#5c5e66", card: "#f2f3f5", line: "#e1e2e4", button: "#e3e5e8", buttonText: "#313338", avatarBg: "#e3e5e8" },
};

const STORAGE_KEY = "nv:discord-preview-look";
const EVENT = "nv:discord-preview-look";

/** Gemerkte Wahl (Browser-Speicher, kann gesperrt sein → dunkel). Alle Vorschauen schalten gemeinsam um. */
function readLook(): Look {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
function writeLook(next: Look) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* Speicher gesperrt – Umschalten wirkt dann nicht dauerhaft */
  }
  window.dispatchEvent(new Event(EVENT));
}
function subscribeLook(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Vorschau einer Bot-DM, so wie sie in Discord aussieht (Components V2:
 * Container mit Akzentleiste, Kopf mit Bild rechts, Trenner, Button im
 * Container). Umschaltbar zwischen dunklem und hellem Discord-Design –
 * unabhängig vom Portal-Theme; die Wahl merkt sich der Browser.
 */
export function DiscordPreview({
  title,
  body,
  publicId,
  author,
  answerButton = false,
  linkLabel = "Status ansehen",
}: {
  title: string;
  body: string;
  publicId?: string | null;
  /** Persönlicher Absender; ohne Angabe "NORDVERKEHR // TEAM" */
  author?: { name: string; iconUrl: string } | null;
  /** Knopf „Zurückschreiben“ zeigen (Team-Nachrichten, wenn Discord-Interaktionen eingerichtet sind) */
  answerButton?: boolean;
  /** Beschriftung des Link-Knopfs */
  linkLabel?: string;
}) {
  const look = useSyncExternalStore(subscribeLook, readLook, () => "dark" as Look);
  const toggle = () => writeLook(look === "dark" ? "light" : "dark");
  const t = THEME[look];

  return (
    <div className="relative rounded-xl p-4 text-[15px] leading-[1.375rem]" style={{ background: t.bg, color: t.text }}>
      <button
        type="button"
        onClick={toggle}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
        style={{ background: t.card, color: t.muted }}
        aria-label={look === "dark" ? "Vorschau im hellen Discord-Design" : "Vorschau im dunklen Discord-Design"}
        title={look === "dark" ? "Helles Discord-Design" : "Dunkles Discord-Design"}
      >
        {look === "dark" ? <Sun size={12} aria-hidden /> : <Moon size={12} aria-hidden />}
        {look === "dark" ? "Hell" : "Dunkel"}
      </button>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-10 w-10 rounded-full object-contain p-1.5" style={{ background: t.avatarBg }} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 pr-16">
            <span className="font-medium" style={{ color: t.name }}>
              Nordverkehr
            </span>
            <span className="rounded px-1 text-[10px] font-semibold leading-4 text-white" style={{ background: "#5865f2" }}>
              APP
            </span>
            <span className="text-xs" style={{ color: t.muted }}>
              Heute
            </span>
          </p>
          <div className="mt-1 max-w-[520px] rounded-lg border-l-4 p-4" style={{ background: t.card, borderColor: "#c41e1e" }}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs" style={{ color: t.muted }}>
                  {author ? `${author.name} · Nordverkehr-Team` : "NORDVERKEHR // TEAM"}
                </p>
                {title && (
                  <p className="mt-1 text-xl font-bold leading-tight" style={{ color: t.name }}>
                    {title}
                  </p>
                )}
              </div>
              {author ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={author.iconUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                // Als Team: Nordverkehr-Logo als Profilbild
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo.png" alt="" className="h-16 w-16 shrink-0 rounded-lg object-contain p-2" style={{ background: t.avatarBg }} />
              )}
            </div>
            <hr className="my-3 border-0 h-px" style={{ background: t.line }} />
            <div style={{ ["--dc-strong" as string]: t.name } as React.CSSProperties}>
              <DiscordMarkdown text={body || " "} className="text-sm [&_strong]:text-[var(--dc-strong)]" />
            </div>
            <p className="mt-3 text-xs" style={{ color: t.muted }}>
              {publicId ? `Bewerbung ${publicId}` : "Nordverkehr Roleplay"} · Heute
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {answerButton && (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium" style={{ background: t.button, color: t.buttonText }}>
                  ✍️ Zurückschreiben
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium" style={{ background: t.button, color: t.buttonText }}>
                {linkLabel} ↗
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
