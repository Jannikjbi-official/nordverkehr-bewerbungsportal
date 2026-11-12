"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelInterviewAction } from "@/app/actions/application";
import { confirmDialog } from "@/components/ConfirmDialog";

/** „Ich kann nicht“ – Bewerber sagt seinen Gesprächstermin ab. */
export function CancelInterviewButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    const ok = await confirmDialog({
      title: "Gespräch absagen?",
      body: "Das Team bekommt Bescheid. Danach kannst du einen neuen Termin aussuchen (falls freie Termine da sind) oder dem Team schreiben.",
      confirmLabel: "Absagen",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    run(async () => {
      const r = await cancelInterviewAction(applicationId);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={cancel} disabled={pending}>
        Ich kann nicht – absagen
      </button>
      {error && <p className="nv-error text-xs mt-1">{error}</p>}
    </div>
  );
}
