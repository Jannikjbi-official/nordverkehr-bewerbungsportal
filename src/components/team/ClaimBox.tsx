"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HandGrabbing, LockSimpleOpen, PushPin } from "@phosphor-icons/react/ssr";
import { claimAction } from "@/app/actions/team";
import { Avatar } from "@/components/ui";

interface Props {
  applicationId: string;
  me: { id: string; isAdmin: boolean };
  claimedBy: { id: string; name: string; discordId: string; avatar: string | null } | null;
  claimedAgo: string | null;
}

/** Bewerbung claimen: zeigt, wer sie betreut – mit Claimen / Freigeben / Übernehmen. */
export function ClaimBox({ applicationId, me, claimedBy, claimedAgo }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mine = claimedBy?.id === me.id;

  const run = (action: "claim" | "release") =>
    start(async () => {
      setError(null);
      const r = await claimAction(applicationId, action);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });

  return (
    <div className="space-y-3">
      <p className="nv-mono">Bearbeitung</p>
      {claimedBy ? (
        <div className="flex items-center gap-3">
          <Avatar discordId={claimedBy.discordId} avatar={claimedBy.avatar} size={36} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{mine ? "Du betreust diese Bewerbung" : claimedBy.name}</p>
            <p className="text-xs text-muted">geclaimt {claimedAgo}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Noch niemand betreut diese Bewerbung.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!claimedBy && (
          <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending} onClick={() => run("claim")}>
            <PushPin size={14} weight="fill" aria-hidden /> Claimen
          </button>
        )}
        {claimedBy && !mine && (
          <button
            type="button"
            className="nv-btn nv-btn-ghost nv-btn-sm"
            disabled={pending}
            onClick={() => confirm(`${claimedBy.name} betreut diese Bewerbung. Übernehmen?`) && run("claim")}
          >
            <HandGrabbing size={14} aria-hidden /> Übernehmen
          </button>
        )}
        {claimedBy && (mine || me.isAdmin) && (
          <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" disabled={pending} onClick={() => run("release")}>
            <LockSimpleOpen size={14} aria-hidden /> Freigeben
          </button>
        )}
      </div>
      <p className="text-xs text-muted">Wer claimt, schreibt standardmäßig mit eigenem Namen – „als Team senden“ bleibt immer möglich.</p>
      {error && <p className="nv-error">{error}</p>}
    </div>
  );
}
