"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideProbationAction, mentorFeedbackAction, setMentorAction } from "@/app/actions/team";
import { confirmDialog } from "@/components/ConfirmDialog";

const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** Probezeit-Abschluss (Admins) und Pate mit Rückmeldung – unter der Einarbeitungs-Checkliste. */
export function ProbationPanel({
  applicationId,
  probationUntil,
  result,
  decidedAt,
  isAdmin,
  meId,
  mentorId,
  team,
  feedback,
  feedbackDue,
}: {
  applicationId: string;
  probationUntil: string | null;
  result: "PASSED" | "ENDED" | null;
  decidedAt: string | null;
  isAdmin: boolean;
  meId: string;
  mentorId: string | null;
  team: { id: string; name: string }[];
  feedback: { rating: "good" | "help"; note: string | null; by: string; at: string } | null;
  /** 14 Tage nach der Annahme – Rückmeldung fällig */
  feedbackDue: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Fehler");
      else router.refresh();
    });

  async function decide(decision: "PASSED" | "EXTEND" | "END") {
    if (decision === "END") {
      const ok = await confirmDialog({
        title: "Im Team beenden?",
        body: "Die Person ist danach nicht mehr im Team: Rollen und Namens-Präfix werden entfernt, ein belegter Platz wird frei. Das steht im Bot-Log.",
        confirmLabel: "Beenden",
        tone: "danger",
      });
      if (!ok) return;
    }
    run(() => decideProbationAction(applicationId, decision));
  }

  const mentorName = team.find((t) => t.id === mentorId)?.name ?? null;
  const canGiveFeedback = !feedback && (mentorId === meId || isAdmin) && !!mentorId;

  return (
    <div className="border-t border-line pt-3 space-y-3">
      <div>
        <p className="nv-field-label">Probezeit-Abschluss</p>
        {result ? (
          <p className={`text-sm ${result === "PASSED" ? "text-[var(--tone-success)]" : "text-[var(--tone-danger)]"}`}>
            {result === "PASSED" ? "✓ Bestanden" : "Beendet – nicht mehr im Team"}
            {decidedAt && <span className="text-xs text-muted"> · {day(decidedAt)}</span>}
          </p>
        ) : isAdmin ? (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending} onClick={() => decide("PASSED")}>
              Bestanden
            </button>
            <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => decide("EXTEND")}>
              +14 Tage
            </button>
            <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" disabled={pending} onClick={() => decide("END")}>
              Beenden
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted">{probationUntil ? `Endet am ${day(probationUntil)} – die Leitung entscheidet.` : "Die Leitung entscheidet am Ende der Probezeit."}</p>
        )}
      </div>

      <div>
        <label htmlFor="mentor" className="nv-field-label">
          Pate
        </label>
        <select
          id="mentor"
          className="nv-input text-sm"
          value={mentorId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => setMentorAction(applicationId, e.target.value || null))}
        >
          <option value="">– kein Pate –</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {feedback ? (
          <p className="mt-2 text-sm">
            {feedback.rating === "good" ? "👍 Läuft gut" : "🆘 Braucht Hilfe"}
            <span className="text-xs text-muted">
              {" "}
              · {feedback.by} · {day(feedback.at)}
            </span>
            {feedback.note && <span className="block text-xs text-fg-2 mt-0.5">{feedback.note}</span>}
          </p>
        ) : mentorName ? (
          <p className="nv-help mt-1">{feedbackDue ? `Rückmeldung von ${mentorName} ist fällig.` : `Nach zwei Wochen fragt der Bot ${mentorName} nach einer kurzen Rückmeldung.`}</p>
        ) : null}
        {canGiveFeedback && (
          <div className="mt-2 space-y-1.5">
            <input className="nv-input text-sm" maxLength={1000} placeholder="Kurze Notiz (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-1.5">
              <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => run(() => mentorFeedbackAction(applicationId, "good", note))}>
                👍 Läuft gut
              </button>
              <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => run(() => mentorFeedbackAction(applicationId, "help", note))}>
                🆘 Braucht Hilfe
              </button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="nv-error text-xs">{error}</p>}
    </div>
  );
}
