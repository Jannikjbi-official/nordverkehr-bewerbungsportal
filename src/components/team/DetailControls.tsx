"use client";

import type { KindKey } from "@/lib/kinds";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useRef, useState, useTransition } from "react";
import { mentionQueryAt } from "@/lib/team/mentions";
import { ArrowClockwise, CalendarPlus, MinusCircle, ThumbsDown, ThumbsUp, Trash } from "@phosphor-icons/react/ssr";
import {
  addCommentAction,
  changeStatusAction,
  deleteCommentAction,
  requestSecondOpinionAction,
  setFollowUpAction,
  clearFollowUpAction,
  setImprovementTipAction,
  retryDeliveryAction,
  setInterviewAction,
  voteAction,
} from "@/app/actions/team";
import { STATUS_LABEL } from "@/lib/applications/status";
import { REJECTION_CATEGORIES, type RejectionCategory } from "@/lib/applications/rejection";
import { StatusDot, StatusSelect } from "@/components/team/StatusSelect";
import { Select } from "@/components/Select";
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

const ACCEPT_TEXT: Record<KindKey, { hint: string; confirm: string }> = {
  team: { hint: "Ins Team aufnehmen", confirm: "Die Person wird ins Team aufgenommen." },
  whitelist: { hint: "Whitelist freigeben", confirm: "Die Whitelist wird freigegeben – die Rolle der Stelle wird vergeben." },
  beta: { hint: "In die Beta aufnehmen", confirm: "Die Person kommt in die Beta – die Rolle der Stelle wird vergeben." },
};

export function StatusControl({ applicationId, current, targets, kind = "team" }: { applicationId: string; current: ApplicationStatus; targets: ApplicationStatus[]; kind?: KindKey }) {
  const { pending, error, run } = useAction();
  const [to, setTo] = useState<ApplicationStatus | "">("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<RejectionCategory | "">("");
  if (!targets.length) return null;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!to) return;
        if ((to === "ACCEPTED" || to === "REJECTED") && !(await confirmDialog({
            title: `Status auf „${STATUS_LABEL[to]}“ setzen?`,
            body: to === "REJECTED" ? "Die Bewerbung wird abgelehnt, die Sperrfrist startet." : ACCEPT_TEXT[kind].confirm,
            confirmLabel: STATUS_LABEL[to],
            tone: to === "REJECTED" ? "danger" : "default",
          }))) return;
        run(
          () => changeStatusAction({ applicationId, to: to as "SUBMITTED", reason: reason || undefined, category: to === "REJECTED" && category ? category : undefined }),
          () => {
            setTo("");
            setReason("");
            setCategory("");
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
            acceptHint={ACCEPT_TEXT[kind].hint}
          />
        </div>
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={!to || pending}>
          {pending ? "…" : "Setzen"}
        </button>
      </div>
      {to === "REJECTED" && (
        <Select
          ariaLabel="Absagegrund (Kategorie)"
          placeholder="Absagegrund für die Statistik …"
          size="sm"
          options={REJECTION_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          value={category}
          onChange={(v) => setCategory(v)}
        />
      )}
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
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition-colors ${active ? o.tone : "border-line text-muted hover:text-fg hover:border-line-strong"}`}
            >
              {/* Auf schmalen Handys ohne Symbol, damit „Enthaltung“ ganz passt */}
              <span className="hidden min-[420px]:inline-flex">{o.icon}</span>
              <span className="truncate">{o.label}</span>
              <span className="font-display tabular-nums text-fg">{count}</span>
            </button>
          );
        })}
      </div>
      {votes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
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

export function CommentBox({ applicationId, members = [] }: { applicationId: string; members?: { username: string; name: string }[] }) {
  const { pending, error, run } = useAction();
  const [body, setBody] = useState("");
  // @Erwähnung: angefangener Name vor dem Cursor → Vorschläge
  const [query, setQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const suggestions =
    query === null ? [] : members.filter((m) => m.username.toLowerCase().startsWith(query) || m.name.toLowerCase().startsWith(query)).slice(0, 6);
  function insert(username: string) {
    const el = ref.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@[a-z0-9._]*$/i, `@${username} `);
    const next = before + body.slice(caret);
    setBody(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }
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
      {suggestions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Teammitglied erwähnen" data-testid="mention-suggestions">
          {suggestions.map((m) => (
            <li key={m.username}>
              <button type="button" className="nv-pill hover:text-fg" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(m.username)}>
                @{m.username}
                {m.name !== m.username && <span className="text-faint"> · {m.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        id="comment"
        className="nv-input !min-h-20 text-sm"
        rows={3}
        maxLength={3000}
        ref={ref}
        placeholder="Interner Kommentar – sieht nur das Team. Mit @name erwähnen."
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setQuery(mentionQueryAt(e.target.value, e.target.selectionStart ?? e.target.value.length));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery(null);
          if ((e.key === "Enter" || e.key === "Tab") && suggestions.length) {
            e.preventDefault();
            insert(suggestions[0].username);
          }
        }}
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

/** Zweitmeinung anfordern: bestimmte Person oder zufällig – bekommt eine DM, bewertet „blind“. */
export function SecondOpinion({
  applicationId,
  members,
  open,
}: {
  applicationId: string;
  members: { id: string; name: string }[];
  open: { name: string; at: string }[];
}) {
  const { pending, error, run } = useAction();
  const [target, setTarget] = useState<string>("random");
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-xl border border-line p-3" data-testid="second-opinion">
      <p className="text-xs font-medium">Zweitmeinung anfordern</p>
      {open.length > 0 && (
        <p className="text-xs text-muted">
          Wartet auf: {open.map((o) => o.name).join(", ")}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          ariaLabel="Wen fragen?"
          size="sm"
          className="sm:flex-1 min-w-0"
          value={target}
          onChange={setTarget}
          options={[{ value: "random", label: "Zufällig (verfügbar & zuständig)" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
        />
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm w-full sm:w-auto"
          disabled={pending}
          onClick={() =>
            run(
              async () => {
                const r = await requestSecondOpinionAction(applicationId, target);
                if (r.ok) setDone(r.data.name);
                return r;
              },
              () => setTarget("random"),
            )
          }
        >
          {pending ? "Fragt …" : "Anfragen"}
        </button>
      </div>
      {done && <p className="text-xs text-[var(--tone-success)]">{done} wurde per DM gefragt.</p>}
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}

/** Tipp fürs nächste Mal (nur bei Absage) – sieht der Bewerber. */
export function ImprovementTip({ applicationId, tip }: { applicationId: string; tip: string | null }) {
  const { pending, error, run } = useAction();
  const [value, setValue] = useState(tip ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-2" data-testid="improvement-tip">
      <label htmlFor="tip" className="nv-field-label">
        Tipp fürs nächste Mal <span className="font-normal text-muted">(sieht der Bewerber)</span>
      </label>
      <textarea
        id="tip"
        className="nv-input text-sm !min-h-20"
        rows={3}
        maxLength={600}
        placeholder="z. B. „Erzähl bei den Szenarien mehr von deinem eigenen Vorgehen.“"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">Erscheint im Dashboard und bei einer Wiederbewerbung.</p>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm shrink-0"
          disabled={pending || value.trim() === (tip ?? "")}
          onClick={() => run(() => setImprovementTipAction(applicationId, value), () => setSaved(true))}
        >
          {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
      {saved && <p className="text-xs text-[var(--tone-success)]">Gespeichert.</p>}
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}

/** Wiedervorlage: an einem Tag per DM und in der Team-Übersicht an diese Bewerbung erinnern. */
export function FollowUp({ applicationId, current, minDay }: { applicationId: string; current: { id: string; day: string; note: string | null } | null; minDay: string }) {
  const { pending, error, run } = useAction();
  const [day, setDay] = useState(current?.day ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  return (
    <div className="space-y-2" data-testid="follow-up">
      <p className="nv-mono">Wiedervorlage</p>
      {current && (
        <p className="text-xs text-muted">
          Erinnerung am <strong className="text-fg">{new Date(`${current.day}T12:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "long" })}</strong>
          {current.note ? ` – „${current.note}“` : ""}{" "}
          <button type="button" className="nv-link" disabled={pending} onClick={() => run(() => clearFollowUpAction(current.id))}>
            entfernen
          </button>
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="fu-day">
          Tag
        </label>
        <input id="fu-day" type="date" min={minDay} className="nv-input sm:!w-44" value={day} onChange={(e) => setDay(e.target.value)} />
        <label className="sr-only" htmlFor="fu-note">
          Notiz
        </label>
        <input id="fu-note" className="nv-input min-w-0 flex-1" maxLength={300} placeholder="Notiz (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm w-full" disabled={pending || !day} onClick={() => run(() => setFollowUpAction(applicationId, day, note))}>
        {pending ? "Speichert …" : current ? "Wiedervorlage ändern" : "Erinnere mich"}
      </button>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}

/** Wiedervorlage in der Team-Übersicht als erledigt markieren. */
export function FollowUpDone({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm shrink-0" disabled={pending} onClick={() => run(() => clearFollowUpAction(id))}>
      Erledigt
    </button>
  );
}
