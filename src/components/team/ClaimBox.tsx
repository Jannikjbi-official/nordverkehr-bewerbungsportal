"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HandGrabbing, LockSimpleOpen, PushPin } from "@phosphor-icons/react/ssr";
import { claimAction } from "@/app/actions/team";
import { Avatar } from "@/components/ui";
import { HelpLink } from "@/components/team/HelpLink";

interface Props {
  applicationId: string;
  me: { id: string; isAdmin: boolean };
  claimedBy: { id: string; name: string; discordId: string; avatar: string | null } | null;
  claimedAgo: string | null;
}

/**
 * Leiste oben in der Bewerbung: wer sie betreut, mit Claimen / Übernehmen /
 * Freigeben. Bewusst prominent – nicht in der Seitenleiste versteckt.
 */
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
    <div
      className={`rounded-xl border px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center ${
        mine ? "border-red-line bg-red-soft" : claimedBy ? "border-line bg-surface" : "border-dashed border-line-strong bg-surface"
      }`}
      data-testid="claim-box"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {claimedBy ? (
          <Avatar discordId={claimedBy.discordId} avatar={claimedBy.avatar} size={36} />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
            <PushPin size={18} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {mine ? "Du betreust diese Bewerbung" : claimedBy ? `${claimedBy.name} betreut diese Bewerbung` : "Noch nicht geclaimt"}
          </p>
          <p className="text-xs text-muted">
            {claimedBy ? `seit ${claimedAgo}` : "Wer claimt, betreut die Bewerbung und schreibt standardmäßig mit eigenem Namen."}{" "}
            <HelpLink id="claimen" />
          </p>
        </div>
      </div>
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
      {error && <p className="nv-error sm:basis-full">{error}</p>}
    </div>
  );
}
