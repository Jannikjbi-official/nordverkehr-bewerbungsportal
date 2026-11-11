"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react/ssr";
import { markMessagesReadAction, replyToTeamAction, withdrawApplicationAction } from "@/app/actions/application";

export function ReplyBox({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await replyToTeamAction({ applicationId, body });
          if (res.ok) {
            setBody("");
            router.refresh();
          } else setError(res.error);
        });
      }}
    >
      <label htmlFor="reply" className="nv-field-label">
        Antwort ans Team
      </label>
      <textarea
        id="reply"
        className="nv-input !min-h-24"
        rows={3}
        maxLength={2000}
        value={body}
        placeholder="Rückfrage beantworten oder etwas ergänzen …"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">Das Team sieht deine Nachricht im Team-Bereich.</p>
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || body.trim().length < 2}>
          <PaperPlaneRight size={14} weight="fill" aria-hidden /> {pending ? "Sendet …" : "Senden"}
        </button>
      </div>
      {error && (
        <p className="nv-error mt-2" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="nv-btn nv-btn-danger w-full"
      disabled={pending}
      onClick={() => {
        if (!confirm("Bewerbung wirklich zurückziehen? Das kann nicht rückgängig gemacht werden.")) return;
        start(async () => {
          const res = await withdrawApplicationAction(applicationId);
          if (!res.ok) alert(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? "Wird zurückgezogen …" : "Bewerbung zurückziehen"}
    </button>
  );
}

export function MarkRead({ applicationId }: { applicationId: string }) {
  useEffect(() => {
    void markMessagesReadAction(applicationId);
  }, [applicationId]);
  return null;
}
