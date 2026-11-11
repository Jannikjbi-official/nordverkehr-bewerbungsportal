"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react/ssr";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/applications/status";
import type { ApplicationStatus } from "@prisma/client";

const HINT: Partial<Record<ApplicationStatus, string>> = {
  SUBMITTED: "Zurück in den Eingang",
  IN_REVIEW: "Wird gerade gelesen",
  INTERVIEW: "Gespräch geplant",
  ACCEPTED: "Ins Team aufnehmen",
  REJECTED: "Absage, Sperrfrist startet",
};

const DOT: Record<string, string> = {
  muted: "bg-[var(--nv-faint)]",
  info: "bg-[var(--tone-info)]",
  warn: "bg-[var(--tone-warn)]",
  accent: "bg-red",
  success: "bg-[var(--tone-success)]",
  danger: "bg-[var(--tone-danger)]",
};

export function StatusDot({ status }: { status: ApplicationStatus }) {
  return <span className={`h-2 w-2 rounded-full shrink-0 ${DOT[STATUS_TONE[status]]}`} aria-hidden />;
}

interface Props {
  options: ApplicationStatus[];
  value: ApplicationStatus | null;
  onChange: (s: ApplicationStatus | null) => void;
  /** Text, wenn nichts gewählt ist */
  placeholder: React.ReactNode;
  /** Eintrag "nichts ändern" anbieten */
  allowNone?: boolean;
  label: string;
  disabled?: boolean;
}

/** Eigenes Dropdown (Listbox) im Nordverkehr-Stil – voll per Tastatur bedienbar. */
export function StatusSelect({ options, value, onChange, placeholder, allowNone, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const items: (ApplicationStatus | null)[] = allowNone ? [null, ...options] : options;
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    setActive(Math.max(0, items.indexOf(value)));
    setOpen(true);
  }

  function choose(i: number) {
    onChange(items[i] ?? null);
    setOpen(false);
    button.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => (a + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => (a - 1 + items.length) % items.length);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(items.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={ref} className="relative">
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`w-full flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-sm text-left transition-colors bg-input ${
          open ? "border-red-line shadow-[0_0_0_3px_var(--nv-red-soft)]" : "border-line hover:border-line-strong"
        } disabled:opacity-50`}
      >
        {value ? (
          <>
            <StatusDot status={value} />
            <span className="flex-1 font-medium">{STATUS_LABEL[value]}</span>
          </>
        ) : (
          <span className="flex-1 text-muted">{placeholder}</span>
        )}
        <CaretDown size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          tabIndex={-1}
          className="absolute z-40 mt-1.5 w-full min-w-56 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--nv-shadow)] nv-fade"
        >
          {items.map((s, i) => {
            const selected = s === value;
            return (
              <li
                key={s ?? "none"}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer text-sm ${
                  i === active ? "bg-[color-mix(in_srgb,var(--nv-text)_6%,transparent)]" : ""
                }`}
              >
                {s ? <StatusDot status={s} /> : <span className="h-2 w-2 rounded-full border border-line-strong shrink-0" aria-hidden />}
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">{s ? STATUS_LABEL[s] : "Status nicht ändern"}</span>
                  {s && HINT[s] && <span className="block text-xs text-muted">{HINT[s]}</span>}
                </span>
                {selected && <Check size={14} className="text-red-text" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
