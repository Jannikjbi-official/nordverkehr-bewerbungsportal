"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserMinus } from "@phosphor-icons/react/ssr";
import { markNoShowAction } from "@/app/actions/team";
import { confirmDialog } from "@/components/ConfirmDialog";

/** Bewerber nicht zum Gespräch erschienen: Termin freigeben, Bewerber benachrichtigen, mitzählen. */
export function NoShowButton({ applicationId, count }: { applicationId: string; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="nv-btn nv-btn-quiet nv-btn-sm w-full"
        disabled={pending}
        onClick={async () => {
          if (
            !(await confirmDialog({
              title: "Nicht zum Gespräch erschienen?",
              body: `Der Termin wird freigegeben, der Bewerber bekommt eine Nachricht und kann einen neuen Termin buchen.${count >= 1 ? " Es ist das zweite Mal – das Team sieht einen Hinweis." : ""}`,
              confirmLabel: "Nicht erschienen",
              tone: "danger",
            }))
          )
            return;
          setError(null);
          start(async () => {
            const r = await markNoShowAction(applicationId);
            if (!r.ok) return setError(r.error);
            router.refresh();
          });
        }}
      >
        <UserMinus size={15} aria-hidden /> Nicht erschienen
      </button>
      {error && <p className="nv-error text-xs mt-1">{error}</p>}
    </div>
  );
}
