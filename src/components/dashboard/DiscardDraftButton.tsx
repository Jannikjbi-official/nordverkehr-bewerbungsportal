"use client";

import { useRouter } from "next/navigation";
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
      onClick={() => {
        if (!confirm("Entwurf wirklich verwerfen? Deine Antworten gehen verloren.")) return;
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
