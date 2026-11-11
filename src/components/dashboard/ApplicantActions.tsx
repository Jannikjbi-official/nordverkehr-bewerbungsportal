"use client";

import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
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

/**
 * Zurückziehen: vor der Bearbeitung mit einem Klick, danach mit kurzem Grund
 * (das Team sieht ihn und kann noch nachfragen).
 */
export function WithdrawButton({ applicationId, needsReason }: { applicationId: string; needsReason: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const withdraw = () =>
    start(async () => {
      setError(null);
      const res = await withdrawApplicationAction(applicationId, needsReason ? reason : undefined);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  if (!needsReason || !open) {
    return (
      <button
        type="button"
        className="nv-btn nv-btn-danger w-full"
        disabled={pending}
        onClick={() => {
          if (needsReason) return setOpen(true);
          void confirmDialog({ title: "Bewerbung zurückziehen?", body: "Das kann nicht rückgängig gemacht werden.", confirmLabel: "Zurückziehen", tone: "danger" }).then(
            (ok) => ok && withdraw(),
          );
        }}
      >
        {pending ? "Wird zurückgezogen …" : "Bewerbung zurückziehen"}
      </button>
    );
  }
  return (
    <div className="nv-card p-4 space-y-3">
      <label htmlFor="withdraw-reason" className="nv-field-label">
        Warum ziehst du zurück?
      </label>
      <p className="nv-help -mt-2">Deine Bewerbung wird schon bearbeitet. Ein kurzer Satz reicht – das Team kann danach noch nachfragen.</p>
      <textarea
        id="withdraw-reason"
        className="nv-input !min-h-20 text-sm"
        rows={3}
        maxLength={1000}
        value={reason}
        aria-invalid={!!error}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <p className="nv-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setOpen(false)} disabled={pending}>
          Abbrechen
        </button>
        <button type="button" className="nv-btn nv-btn-danger nv-btn-sm" disabled={pending || reason.trim().length < 3} onClick={withdraw}>
          {pending ? "Wird zurückgezogen …" : "Zurückziehen"}
        </button>
      </div>
    </div>
  );
}

export function MarkRead({ applicationId }: { applicationId: string }) {
  useEffect(() => {
    void markMessagesReadAction(applicationId);
  }, [applicationId]);
  return null;
}
