"use client";

import { useState, useTransition } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react/ssr";
import { retagAction } from "@/app/actions/team";

export function RetagButton({ applicationId, hasTags }: { applicationId: string; hasTags: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="nv-btn nv-btn-quiet nv-btn-sm !py-0.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await retagAction(applicationId);
            if (!res.ok) setError(res.error);
          })
        }
      >
        <ArrowsClockwise size={13} className={pending ? "animate-spin" : ""} aria-hidden /> {hasTags ? "Neu einordnen" : "Mit KI einordnen"}
      </button>
      {error && <span className="nv-error">{error}</span>}
    </span>
  );
}
