"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setPositionStatusAction } from "@/app/actions/admin";

const LABEL = { OPEN: "Offen", CLOSED: "Geschlossen", HIDDEN: "Versteckt" } as const;

export function PositionStatusSelect({ positionId, status }: { positionId: string; status: keyof typeof LABEL }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Status</span>
      <select
        className={`nv-input !py-1.5 !w-36 ${status === "OPEN" ? "!border-[color-mix(in_srgb,var(--tone-success)_40%,transparent)]" : ""}`}
        value={status}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await setPositionStatusAction(positionId, e.target.value as keyof typeof LABEL);
            if (!res.ok) alert(res.error);
            router.refresh();
          })
        }
      >
        {Object.entries(LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
