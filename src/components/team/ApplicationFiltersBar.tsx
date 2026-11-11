"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react/ssr";
import { STATUS_LABEL } from "@/lib/applications/status";
import { TAG_KEYS, tagLabel } from "@/lib/ai/tags";
import type { ApplicationStatus } from "@prisma/client";

interface Filters {
  q?: string;
  position?: string;
  status?: string[];
  from?: string;
  to?: string;
  view: string;
  sort: string;
  flag?: string;
  tag?: string;
}

const STATUS_OPTIONS: ApplicationStatus[] = ["SUBMITTED", "IN_REVIEW", "INTERVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"];

export function ApplicationFiltersBar({ positions, current }: { positions: { slug: string; title: string }[]; current: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(current.q ?? "");

  function apply(patch: Partial<Filters>) {
    const next = { ...current, ...patch };
    const qs = new URLSearchParams();
    if (next.q) qs.set("q", next.q);
    if (next.position) qs.set("position", next.position);
    next.status?.forEach((s) => qs.append("status", s));
    if (next.from) qs.set("from", next.from);
    if (next.to) qs.set("to", next.to);
    if (next.view !== "tabelle") qs.set("view", next.view);
    if (next.sort !== "neu") qs.set("sort", next.sort);
    if (next.flag) qs.set("flag", next.flag);
    if (next.tag) qs.set("tag", next.tag);
    start(() => router.replace(`${pathname}?${qs.toString()}`, { scroll: false }));
  }

  // Suche mit kurzer Verzögerung
  useEffect(() => {
    if ((current.q ?? "") === q) return;
    const t = setTimeout(() => apply({ q: q || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = !!(current.q || current.position || current.status?.length || current.from || current.to || current.flag || current.tag);

  return (
    <div className={`nv-card p-4 space-y-3 transition-opacity ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Suche</span>
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="nv-input !pl-9"
            placeholder="Name, @discord oder NV-2026-…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          className="nv-input md:!w-48"
          aria-label="Position"
          value={current.position ?? ""}
          onChange={(e) => apply({ position: e.target.value || undefined })}
        >
          <option value="">Alle Positionen</option>
          {positions.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
        <div className="flex gap-2 items-center min-w-0">
          <label className="sr-only" htmlFor="from">
            Von
          </label>
          <input id="from" type="date" className="nv-input min-w-0 flex-1 md:flex-none md:!w-40" value={current.from ?? ""} onChange={(e) => apply({ from: e.target.value || undefined })} />
          <span className="text-muted text-sm">–</span>
          <label className="sr-only" htmlFor="to">
            Bis
          </label>
          <input id="to" type="date" className="nv-input min-w-0 flex-1 md:flex-none md:!w-40" value={current.to ?? ""} onChange={(e) => apply({ to: e.target.value || undefined })} />
        </div>
        <select className="nv-input md:!w-40" aria-label="Sortierung" value={current.sort} onChange={(e) => apply({ sort: e.target.value })}>
          <option value="neu">Neueste zuerst</option>
          <option value="alt">Älteste zuerst</option>
          <option value="aktiv">Zuletzt aktiv</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FunnelSimple size={15} className="text-muted" aria-hidden />
        {STATUS_OPTIONS.map((s) => {
          const on = current.status?.includes(s) ?? false;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => apply({ status: on ? current.status?.filter((x) => x !== s) : [...(current.status ?? []), s] })}
              className={`nv-pill transition-colors ${on ? "nv-pill-red" : "hover:text-fg"}`}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-[var(--nv-border)]" aria-hidden />
        {[
          { k: "antwort", l: "Neue Antworten" },
          { k: "dm", l: "DM fehlgeschlagen" },
          { k: "hinweise", l: "Mit Hinweisen" },
        ].map((x) => (
          <button
            key={x.k}
            type="button"
            aria-pressed={current.flag === x.k}
            onClick={() => apply({ flag: current.flag === x.k ? undefined : x.k })}
            className={`nv-pill transition-colors ${current.flag === x.k ? "nv-pill-red" : "hover:text-fg"}`}
          >
            {x.l}
          </button>
        ))}
        {active && (
          <button
            type="button"
            className="nv-btn nv-btn-quiet nv-btn-sm ml-auto"
            onClick={() => {
              setQ("");
              start(() => router.replace(`${pathname}${current.view !== "tabelle" ? `?view=${current.view}` : ""}`));
            }}
          >
            <X size={14} aria-hidden /> Filter zurücksetzen
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="nv-mono mr-1">KI-Kategorie</span>
        {TAG_KEYS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={current.tag === t}
            onClick={() => apply({ tag: current.tag === t ? undefined : t })}
            className={`nv-pill !text-[0.7rem] transition-colors ${current.tag === t ? (t === "manipulation" ? "nv-tone-danger" : "nv-pill-red") : "hover:text-fg"}`}
          >
            {tagLabel(t)}
          </button>
        ))}
      </div>
    </div>
  );
}
