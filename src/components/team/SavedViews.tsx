"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookmarkSimple, Plus, X } from "@phosphor-icons/react/ssr";
import { deleteViewAction, saveViewAction } from "@/app/actions/team";

/** Gespeicherte Ansichten: Filter mit einem Klick aufrufen, aktuelle Filter speichern. */
export function SavedViews({ views, currentQuery }: { views: { name: string; query: string }[]; currentQuery: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const known = views.some((v) => v.query === currentQuery);

  function save() {
    setError(null);
    start(async () => {
      const r = await saveViewAction(name, currentQuery);
      if (!r.ok) return setError(r.error);
      setNaming(false);
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Gespeicherte Ansichten" data-testid="saved-views">
      <BookmarkSimple size={15} className="text-muted" aria-hidden />
      {views.map((v) => {
        const active = v.query === currentQuery;
        return (
          <span key={v.name} className={`nv-pill !pr-1 ${active ? "nv-pill-red" : ""}`}>
            <Link href={`/team/bewerbungen${v.query ? `?${v.query}` : ""}`} className="hover:text-fg" aria-current={active ? "true" : undefined}>
              {v.name}
            </Link>
            <button
              type="button"
              className="rounded-full p-0.5 text-muted hover:text-fg"
              aria-label={`Ansicht „${v.name}“ löschen`}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deleteViewAction(v.name);
                  router.refresh();
                })
              }
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        );
      })}
      {naming ? (
        <form
          className="flex w-full items-center gap-1.5 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            className="nv-input !py-1 !text-sm min-w-0 flex-1 sm:w-48"
            placeholder="Name, z. B. Meine Supporter"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
          />
          <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || !name.trim()}>
            Speichern
          </button>
          <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setNaming(false)}>
            Abbrechen
          </button>
        </form>
      ) : (
        !known &&
        currentQuery && (
          <button type="button" className="nv-pill hover:text-fg" onClick={() => setNaming(true)} data-testid="save-view">
            <Plus size={11} aria-hidden /> Aktuelle Filter speichern
          </button>
        )
      )}
      {views.length === 0 && !naming && !currentQuery && <span className="text-xs text-muted">Filter setzen und als Ansicht speichern.</span>}
      {error && <p className="nv-error text-xs w-full">{error}</p>}
    </div>
  );
}
