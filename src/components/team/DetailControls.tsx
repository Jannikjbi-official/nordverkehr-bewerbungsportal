"use client";

import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useState, useTransition } from "react";
import { ArrowClockwise, CalendarPlus, MinusCircle, ThumbsDown, ThumbsUp, Trash } from "@phosphor-icons/react/ssr";
import {
  addCommentAction,
  changeStatusAction,
  deleteCommentAction,
  retryDeliveryAction,
  setInterviewAction,
  voteAction,
} from "@/app/actions/team";
import { STATUS_LABEL } from "@/lib/applications/status";
import { StatusDot, StatusSelect } from "@/components/team/StatusSelect";
import type { ApplicationStatus } from "@prisma/client";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Fehler");
      else {
        after?.();
        router.refresh();
      }
    });
  };
  return { pending, error, run };
}

export function StatusControl({ applicationId, current, targets }: { applicationId: string; current: ApplicationStatus; targets: ApplicationStatus[] }) {
  const { pending, error, run } = useAction();
  const [to, setTo] = useState<ApplicationStatus | "">("");
  const [reason, setReason] = useState("");
  if (!targets.length) return null;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!to) return;
        if ((to === "ACCEPTED" || to === "REJECTED") && !(await confirmDialog({
            title: `Status auf „${STATUS_LABEL[to]}“ setzen?`,
            body: to === "REJECTED" ? "Die Bewerbung wird abgelehnt, die Sperrfrist startet." : "Die Person wird ins Team aufgenommen.",
            confirmLabel: STATUS_LABEL[to],
            tone: to === "REJECTED" ? "danger" : "default",
          }))) return;
        run(
          () => changeStatusAction({ applicationId, to: to as "SUBMITTED", reason: reason || undefined }),
          () => {
            setTo("");
            setReason("");
            // Passende Bausteine im Editor vorschlagen
            const url = new URL(window.location.href);
            url.searchParams.set("status", to);
            window.history.replaceState(null, "", url);
            document.getElementById("nachricht")?.scrollIntoView({ behavior: "smooth" });
          },
        );
      }}
    >
      <p className="nv-mono">Status ändern</p>
      <p className="flex items-center gap-2 text-sm text-muted">
        Aktuell: <StatusDot status={current} /> <span className="text-fg">{STATUS_LABEL[current]}</span>
      </p>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <StatusSelect
            label="Neuer Status"
            options={targets}
            value={to || null}
            onChange={(s) => setTo(s ?? "")}
            placeholder="Neuer Status …"
            disabled={pending}
          />
        </div>
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={!to || pending}>
          {pending ? "…" : "Setzen"}
        </button>
      </div>
      {to === "REJECTED" && (
        <textarea
          className="nv-input !min-h-16 text-sm"
          rows={2}
          maxLength={1000}
          placeholder="Interner Grund (optional, wird als {grund} vorgeschlagen)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {error && <p className="nv-error">{error}</p>}
    </form>
  );
}

type VoteValue = "PRO" | "CONTRA" | "ABSTAIN";

export function VotePanel({
  applicationId,
  mine,
  votes,
}: {
  applicationId: string;
  mine: VoteValue | null;
  votes: { value: VoteValue; name: string }[];
}) {
  const { pending, error, run } = useAction();
  const opts: { v: VoteValue; label: string; icon: React.ReactNode; tone: string }[] = [
    { v: "PRO", label: "Pro", icon: <ThumbsUp size={16} aria-hidden />, tone: "nv-tone-success" },
    { v: "CONTRA", label: "Contra", icon: <ThumbsDown size={16} aria-hidden />, tone: "nv-tone-danger" },
    { v: "ABSTAIN", label: "Enthaltung", icon: <MinusCircle size={16} aria-hidden />, tone: "nv-tone-info" },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Deine Stimme">
        {opts.map((o) => {
          const count = votes.filter((x) => x.value === o.v).length;
          const active = mine === o.v;
          return (
            <button
              key={o.v}
              type="button"
              disabled={pending}
              aria-pressed={active}
              onClick={() => run(() => voteAction(applicationId, active ? null : o.v))}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs transition-colors ${active ? o.tone : "border-line text-muted hover:text-fg hover:border-line-strong"}`}
            >
              {o.icon}
              <span>{o.label}</span>
              <span className="text-lg font-display tabular-nums text-fg">{count}</span>
            </button>
          );
        })}
      </div>
      {votes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {votes.map((v, i) => (
            <li key={i}>
              {v.name}: <span className="text-fg-2">{v.value === "PRO" ? "Pro" : v.value === "CONTRA" ? "Contra" : "Enthaltung"}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="nv-error mt-2">{error}</p>}
    </div>
  );
}

export function CommentBox({ applicationId }: { applicationId: string }) {
  const { pending, error, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addCommentAction({ applicationId, body }), () => setBody(""));
      }}
      className="space-y-2"
    >
      <label htmlFor="comment" className="sr-only">
        Interner Kommentar
      </label>
      <textarea
        id="comment"
        className="nv-input !min-h-20 text-sm"
        rows={3}
        maxLength={3000}
        placeholder="Interner Kommentar – sieht nur das Team"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex justify-end">
        <button className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || !body.trim()}>
          {pending ? "Speichert …" : "Kommentieren"}
        </button>
      </div>
      {error && <p className="nv-error">{error}</p>}
    </form>
  );
}

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      aria-label="Kommentar löschen"
      className="nv-btn nv-btn-quiet !p-1"
      disabled={pending}
      onClick={async () =>
        (await confirmDialog({ title: "Kommentar löschen?", confirmLabel: "Löschen", tone: "danger" })) && run(() => deleteCommentAction(commentId))
      }
    >
      <Trash size={14} aria-hidden />
    </button>
  );
}

function toLocalInput(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function InterviewForm({ applicationId, at, note }: { applicationId: string; at: string | null; note: string | null }) {
  const { pending, error, run } = useAction();
  const [value, setValue] = useState(toLocalInput(at));
  const [text, setText] = useState(note ?? "");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          setInterviewAction({ applicationId, at: value ? new Date(value).toISOString() : null, note: text || undefined }),
        );
      }}
    >
      <label className="nv-mono block" htmlFor="interview">
        Gesprächstermin
      </label>
      <input id="interview" type="datetime-local" className="nv-input" value={value} onChange={(e) => setValue(e.target.value)} />
      <input className="nv-input text-sm" placeholder="Notiz (z. B. Channel, Gesprächspartner)" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="nv-btn nv-btn-ghost nv-btn-sm w-full" disabled={pending}>
        <CalendarPlus size={15} aria-hidden /> {value ? "Termin speichern" : "Termin entfernen"}
      </button>
      {error && <p className="nv-error">{error}</p>}
    </form>
  );
}

export function RetryDeliveryButton({ messageId }: { messageId: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm !py-0.5" disabled={pending} onClick={() => run(() => retryDeliveryAction(messageId))}>
        <ArrowClockwise size={13} aria-hidden /> Erneut senden
      </button>
      {error && <span className="nv-error ml-2">{error}</span>}
    </>
  );
}
