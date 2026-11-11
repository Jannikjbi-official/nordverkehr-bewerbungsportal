"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { acknowledgeWithdrawalAction } from "@/app/actions/team";

/** „Rückzug bestätigen“ – nimmt die Bewerbung aus dem Dashboard und informiert den Bewerber. */
export function AckWithdrawalButton({ applicationId, size = "sm" }: { applicationId: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={`nv-btn nv-btn-ghost ${size === "sm" ? "nv-btn-sm" : ""}`}
        disabled={pending}
        onClick={() =>
          confirm("Rückzug bestätigen? Der Bewerber bekommt eine kurze Bestätigung, Rückfragen sind danach nicht mehr möglich.") &&
          start(async () => {
            setError(null);
            const r = await acknowledgeWithdrawalAction(applicationId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
      >
        <CheckCircle size={14} aria-hidden /> {pending ? "Bestätige …" : "Rückzug bestätigen"}
      </button>
      {error && <span className="nv-error text-xs">{error}</span>}
    </span>
  );
}
