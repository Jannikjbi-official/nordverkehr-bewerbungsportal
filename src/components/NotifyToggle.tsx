"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, BellSlash } from "@phosphor-icons/react/ssr";
import { setNotifyPositionsAction } from "@/app/actions/application";

/** „Bei neuen Stellen per DM benachrichtigen“ an/aus. */
export function NotifyToggle({ on, compact }: { on: boolean; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = () =>
    start(async () => {
      setError(null);
      const r = await setNotifyPositionsAction(!value);
      if (!r.ok) return setError(r.error);
      setValue(!value);
      router.refresh();
    });
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`nv-btn ${value ? "nv-btn-ghost" : "nv-btn-primary"} ${compact ? "nv-btn-sm" : ""} w-full`}
        disabled={pending}
        aria-pressed={value}
        onClick={toggle}
        data-testid="notify-toggle"
      >
        {value ? <BellSlash size={16} aria-hidden /> : <Bell size={16} aria-hidden />}
        {value ? "Benachrichtigung abbestellen" : "Bei neuen Stellen per DM benachrichtigen"}
      </button>
      <p className="text-xs text-muted text-center">
        {value ? "Du bekommst eine Discord-DM, sobald eine Stelle öffnet." : "Wir schicken dir eine DM, sobald eine Stelle öffnet – sonst nichts."}
      </p>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
