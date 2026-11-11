"use client";

import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useTransition } from "react";
import { deleteDraftAction } from "@/app/actions/application";

export function DiscardDraftButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="nv-btn nv-btn-quiet nv-btn-sm"
      onClick={async () => {
        if (!(await confirmDialog({ title: "Entwurf verwerfen?", body: "Deine bisherigen Antworten gehen dabei verloren.", confirmLabel: "Verwerfen", tone: "danger" }))) return;
        start(async () => {
          await deleteDraftAction(draftId);
          router.refresh();
        });
      }}
    >
      {pending ? "Wird verworfen …" : "Verwerfen"}
    </button>
  );
}
