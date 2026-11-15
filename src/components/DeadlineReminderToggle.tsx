"use client";

import { useState, useTransition } from "react";
import { Bell, BellSlash } from "@phosphor-icons/react/ssr";
import { toggleDeadlineReminderAction } from "@/app/actions/application";

/** „Erinnere mich“ an das Fristende einer Stelle (DM einen Tag vorher). */
export function DeadlineReminderToggle({ positionId, on }: { positionId: string; on: boolean }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="nv-btn nv-btn-ghost nv-btn-sm w-full"
        disabled={pending}
        aria-pressed={value}
        data-testid="deadline-reminder"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await toggleDeadlineReminderAction(positionId, !value);
            if (!r.ok) setError(r.error);
            else setValue(!value);
          })
        }
      >
        {value ? <BellSlash size={15} aria-hidden /> : <Bell size={15} aria-hidden />}
        {value ? "Erinnerung abbestellen" : "Erinnere mich vor Fristende"}
      </button>
      {value && <p className="text-xs text-muted text-center">Du bekommst einen Tag vorher eine Discord-DM.</p>}
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
