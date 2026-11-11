"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react/ssr";

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  /** Zweite, kleine Zeile im Menü */
  hint?: string;
  /** CSS-Klasse für einen farbigen Punkt (z. B. "bg-[var(--tone-success)]") */
  dot?: string;
}

interface Props<V extends string> {
  options: SelectOption<V>[];
  value: V | "";
  onChange: (value: V) => void;
  /** id des Knopfs – damit ein <label htmlFor> ihn beschriftet */
  id?: string;
  /** Beschriftung, wenn es kein sichtbares Label gibt */
  ariaLabel?: string;
  /** Für normale Formulare (GET/POST): verstecktes Feld mit diesem Namen */
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Kompaktere Höhe (z. B. in Tabellen) */
  size?: "md" | "sm";
  className?: string;
  /** Wird nach der Auswahl aufgerufen (z. B. um ein Formular abzuschicken) */
  onAfterChange?: () => void;
}

/**
 * Eigenes Dropdown (Listbox) im Nordverkehr-Stil statt des Browser-Selects –
 * voll per Tastatur bedienbar (Pfeile, Pos1/Ende, Enter, Esc, Anfangsbuchstabe).
 */
export function Select<V extends string>({
  options,
  value,
  onChange,
  id,
  ariaLabel,
  name,
  placeholder = "Bitte wählen",
  disabled,
  invalid,
  describedBy,
  size = "md",
  className = "",
  onAfterChange,
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const typed = useRef({ text: "", at: 0 });
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Aktiven Eintrag sichtbar halten (lange Listen)
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openMenu() {
    if (disabled || !options.length) return;
    const r = button.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      setUp(below < 300 && r.top > below);
    }
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(i: number) {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    button.current?.focus();
    if (o.value !== value) {
      onChange(o.value);
      if (onAfterChange) requestAnimationFrame(onAfterChange);
    }
  }

  function typeAhead(key: string) {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + key.toLowerCase(), at: now };
    const start = open ? active + (typed.current.text.length === 1 ? 1 : 0) : 0;
    const order = [...options.keys()].map((k) => (k + start) % options.length);
    const hit = order.find((i) => options[i].label.toLowerCase().startsWith(typed.current.text));
    if (hit === undefined) return;
    if (open) setActive(hit);
    else choose(hit);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typeAhead(e.key);
      return;
    }
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
        setActive((a) => Math.min(options.length - 1, a + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`w-full flex items-center gap-2.5 rounded-[10px] border text-sm text-left transition-colors bg-input ${
          size === "sm" ? "px-3 py-1.5" : "px-3.5 py-2.5"
        } ${
          open
            ? "border-red-line shadow-[0_0_0_3px_var(--nv-red-soft)]"
            : invalid
              ? "border-[var(--tone-danger)]"
              : "border-line hover:border-line-strong"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {selected?.dot && <span className={`h-2 w-2 rounded-full shrink-0 ${selected.dot}`} aria-hidden />}
        <span className={`flex-1 min-w-0 truncate ${selected ? "font-medium" : "text-muted"}`}>{selected ? selected.label : placeholder}</span>
        <CaretDown size={14} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={`absolute z-50 w-full min-w-48 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1.5 shadow-[var(--nv-shadow)] nv-fade ${
            up ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer text-sm ${
                  i === active ? "bg-[color-mix(in_srgb,var(--nv-text)_6%,transparent)]" : ""
                }`}
              >
                {o.dot && <span className={`h-2 w-2 rounded-full shrink-0 ${o.dot}`} aria-hidden />}
                <span className="flex-1 min-w-0">
                  <span className={`block ${isSelected ? "font-semibold" : "font-medium"}`}>{o.label}</span>
                  {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
                </span>
                {isSelected && <Check size={14} className="shrink-0 text-red-text" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
