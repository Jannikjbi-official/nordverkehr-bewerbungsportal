"use client";

import { useRef, useState } from "react";
import { ImageSquare, Spinner, Trash } from "@phosphor-icons/react/ssr";
import { MAX_FILES_PER_QUESTION } from "@/lib/applications/form";

export interface UploadedFile {
  id: string;
  fileName: string;
}

interface Props {
  questionId: string;
  labelledBy: string;
  ids: string[];
  files: Record<string, UploadedFile>;
  onChange: (ids: string[]) => void;
  onUploaded: (f: UploadedFile) => void;
}

const MAX = 8 * 1024 * 1024;

export function FileUpload({ questionId, labelledBy, ids, files, onChange, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList) {
    setError(null);
    const room = MAX_FILES_PER_QUESTION - ids.length;
    const chosen = Array.from(list).slice(0, room);
    if (list.length > room) setError(`Höchstens ${MAX_FILES_PER_QUESTION} Bilder.`);
    let next = [...ids];
    for (const file of chosen) {
      if (file.size > MAX) {
        setError(`„${file.name}“ ist größer als 8 MB.`);
        continue;
      }
      setBusy((b) => b + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("questionId", questionId);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Upload fehlgeschlagen.");
          continue;
        }
        onUploaded({ id: json.upload.id, fileName: json.upload.fileName });
        next = [...next, json.upload.id];
        onChange(next);
      } catch {
        setError("Upload fehlgeschlagen. Prüf deine Verbindung.");
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }

  async function remove(id: string) {
    onChange(ids.filter((x) => x !== id));
    await fetch(`/api/uploads/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="mt-2" aria-labelledby={labelledBy} role="group">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ids.map((id) => (
          <figure key={id} className="group relative aspect-video overflow-hidden rounded-xl border border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/uploads/${id}`} alt={files[id]?.fileName ?? "Hochgeladenes Bild"} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(id)}
              className="absolute top-1.5 right-1.5 nv-btn nv-btn-sm !p-1.5 bg-black/60 text-white hover:bg-black/80"
              aria-label={`Bild ${files[id]?.fileName ?? ""} entfernen`}
            >
              <Trash size={14} aria-hidden />
            </button>
          </figure>
        ))}
        {ids.length < MAX_FILES_PER_QUESTION && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy > 0}
            className="aspect-video rounded-xl border border-dashed border-line-strong hover:border-red-line hover:bg-red-soft transition-colors flex flex-col items-center justify-center gap-1.5 text-sm text-muted"
          >
            {busy > 0 ? <Spinner size={20} className="animate-spin" aria-hidden /> : <ImageSquare size={22} aria-hidden />}
            {busy > 0 ? "Lädt hoch …" : "Bild hinzufügen"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="nv-error mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
