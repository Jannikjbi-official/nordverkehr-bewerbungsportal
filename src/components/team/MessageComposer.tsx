"use client";

import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { PaperPlaneTilt, Plus, Star, WarningCircle, X } from "@phosphor-icons/react/ssr";
import { sendMessageAction } from "@/app/actions/team";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/applications/status";
import { PLACEHOLDERS, renderTemplate, subjectFromTemplateTitle, type TemplateVars } from "@/lib/messages/placeholders";
import { DiscordPreview } from "@/components/team/DiscordPreview";
import { StatusSelect } from "@/components/team/StatusSelect";
import { HelpLink } from "@/components/team/HelpLink";
import type { ApplicationStatus, TemplateCategory } from "@prisma/client";

const DEFAULT_TITLE = "Nachricht vom Nordverkehr-Team";

/** Auf breiten Bildschirmen steht die Vorschau rechts in der Seitenleiste (Platzhalter #composer-preview-slot). */
const WIDE = "(min-width: 1280px)";
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getSlot = () => (window.matchMedia(WIDE).matches ? document.getElementById("composer-preview-slot") : null);

interface Template {
  id: string;
  category: TemplateCategory;
  title: string;
  body: string;
}

interface Props {
  applicationId: string;
  publicId: string | null;
  templates: Template[];
  vars: TemplateVars;
  suggested: TemplateCategory[];
  statusTargets: ApplicationStatus[];
  /** Eigener Name/Avatar für persönliche Nachrichten; claimedByMe = Standard "als ich" */
  sender: { name: string; avatarUrl: string; claimedByMe: boolean };
  /** Rückfrage mit Frist (Einstellungen) */
  followUp?: { reminderDays: number; closeDays: number };
  /** Discord-Interaktionen eingerichtet → DM bekommt den Knopf „Zurückschreiben“ */
  answerButton?: boolean;
}

export function MessageComposer({ applicationId, publicId, templates, vars, suggested, statusTargets, sender, followUp = { reminderDays: 0, closeDays: 7 }, answerButton = false }: Props) {
  const router = useRouter();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState<TemplateCategory>(suggested[0] ?? "EINGANG");
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [titleTouched, setTitleTouched] = useState(false);
  const [body, setBody] = useState("");
  const [used, setUsed] = useState<string[]>([]);
  const [grund, setGrund] = useState("");
  const [alsoStatus, setAlsoStatus] = useState<ApplicationStatus | "">("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  // Wer die Bewerbung geclaimt hat, schreibt standardmäßig persönlich
  const [asTeam, setAsTeam] = useState(!sender.claimedByMe);
  // Rückfrage mit Frist: erinnert den Bewerber, wenn keine Antwort kommt (automatisch bei Rückfrage-Bausteinen)
  const [expectReply, setExpectReply] = useState(false);
  const [expectTouched, setExpectTouched] = useState(false);
  // Vorschau in der Seitenleiste – nur solange das Nachrichtenfeld sichtbar ist (Reiter offen)
  const slot = useSyncExternalStore(subscribeWide, getSlot, () => null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVisible(e.contentRect.width > 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rendered = useMemo(
    () => renderTemplate(body, { ...vars, ...(asTeam ? { teammitglied: "das Nordverkehr-Team" } : {}), grund: grund || undefined }),
    [body, vars, grund, asTeam],
  );
  const renderedTitle = useMemo(
    () => renderTemplate(title, { ...vars, ...(asTeam ? { teammitglied: "das Nordverkehr-Team" } : {}) }).text,
    [title, vars, asTeam],
  );
  const byCat = useMemo(() => templates.filter((t) => t.category === category), [templates, category]);
  const needsGrund = /\{grund\}/.test(body);

  function insert(t: Template) {
    // Betreff: erster gewählter Baustein bestimmt den Titel, solange niemand ihn selbst geändert hat
    if (!titleTouched && used.length === 0) setTitle(subjectFromTemplateTitle(t.title));
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${t.body}` : t.body));
    setUsed((u) => (u.includes(t.id) ? u : [...u, t.id]));
    if (t.category === "RUECKFRAGE" && !expectTouched) setExpectReply(true);
    setSent(false);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  async function send() {
    setSendError(null);
    if (
      rendered.missing.length &&
      !(await confirmDialog({
        title: "Platzhalter ohne Wert",
        body: `Nicht ersetzt: ${rendered.missing.map((m) => `{${m}}`).join(", ")}. Trotzdem senden?`,
        confirmLabel: "Trotzdem senden",
      }))
    )
      return;
    if (!(await confirmDialog({ title: "Nachricht senden?", body: "Sie geht per Discord-DM raus und erscheint im Portal des Bewerbers.", confirmLabel: "Senden" }))) return;
    start(async () => {
      const res = await sendMessageAction({
        applicationId,
        title,
        body,
        templateIds: used,
        grund: grund || undefined,
        alsoStatus: alsoStatus ? (alsoStatus as "SUBMITTED") : undefined,
        asTeam,
        expectReply,
      });
      if (!res.ok) setSendError(res.error);
      else {
        setBody("");
        setUsed([]);
        setGrund("");
        setTitle(DEFAULT_TITLE);
        setTitleTouched(false);
        setAlsoStatus("");
        setExpectReply(false);
        setExpectTouched(false);
        setSent(true);
        router.refresh();
      }
    });
  }

  const preview = (
    <div className="space-y-3 min-w-0">
      <p className="nv-mono">Vorschau wie in Discord</p>
      <DiscordPreview title={renderedTitle} body={rendered.text} publicId={publicId} author={asTeam ? null : { name: sender.name, iconUrl: sender.avatarUrl }} answerButton={answerButton} linkLabel="Im Portal antworten" />
      {rendered.missing.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-[var(--tone-warn)]">
          <WarningCircle size={14} className="shrink-0 mt-0.5" aria-hidden />
          Ohne Wert: {rendered.missing.map((m) => `{${m}}`).join(", ")}
        </p>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="@container">
    <div className={`grid gap-6 ${slot ? "" : "@4xl:grid-cols-2"}`}>
      <div className="space-y-4 min-w-0">
        {/* Bausteine */}
        <div>
          <p className="nv-mono mb-2">Bausteine</p>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Kategorien">
            {CATEGORY_ORDER.map((c) => {
              const isSuggested = suggested.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => setCategory(c)}
                  className={`nv-pill transition-colors ${category === c ? "nv-pill-red" : "hover:text-fg"}`}
                >
                  {isSuggested && <Star size={11} weight="fill" className="text-[var(--tone-warn)]" aria-label="Vorgeschlagen" />}
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>
          <ul className="mt-3 grid gap-1.5 @2xl:grid-cols-2 max-h-64 overflow-y-auto pr-1">
            {byCat.length === 0 && <li className="text-sm text-muted">Keine Bausteine in dieser Kategorie.</li>}
            {byCat.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => insert(t)}
                  title={t.body}
                  className={`group w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    used.includes(t.id) ? "border-red-line bg-red-soft" : "border-line hover:border-red-line hover:bg-red-soft"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate flex-1 min-w-0">{t.title}</span>
                    {used.includes(t.id) ? (
                      <span className="text-[0.65rem] text-red-text shrink-0">eingefügt</span>
                    ) : (
                      <Plus size={14} className="text-muted group-hover:text-red-text shrink-0" aria-hidden />
                    )}
                  </span>
                  <span className="mt-0.5 text-xs text-muted line-clamp-1 break-all">{t.body.replace(/\s+/g, " ")}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Klick fügt den Baustein ans Ende an – mehrere lassen sich kombinieren. Maus drauf zeigt den ganzen Text.</p>
        </div>

        {/* Editor */}
        <div className="space-y-3">
          <div>
            <label htmlFor="msg-title" className="nv-field-label">
              Titel
            </label>
            <input
              id="msg-title"
              className="nv-input"
              maxLength={120}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
            />
            <p className="nv-help mt-1">Wird als Betreff der Discord-DM gesendet. Der erste gewählte Baustein setzt ihn automatisch.</p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="msg-body" className="nv-field-label">
                Nachricht
              </label>
              {used.length > 0 && (
                <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm !py-0.5" onClick={() => {
                    setBody("");
                    setUsed([]);
                    if (!titleTouched) setTitle(DEFAULT_TITLE);
                  }}>
                  <X size={12} aria-hidden /> Leeren
                </button>
              )}
            </div>
            <textarea
              id="msg-body"
              ref={textarea}
              className="nv-input font-mono text-sm !min-h-56"
              rows={10}
              maxLength={3800}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setSent(false);
              }}
              placeholder="Baustein wählen oder frei schreiben. Platzhalter wie {name} werden automatisch ersetzt."
            />
            <details className="mt-1.5">
              <summary className="text-xs text-muted cursor-pointer">Platzhalter</summary>
              <HelpLink id="platzhalter" label="Alle Platzhalter erklärt" className="mt-1" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.label}
                    className="nv-kbd hover:text-fg"
                    onClick={() => setBody((b) => b + `{${p.key}}`)}
                  >
                    {`{${p.key}}`}
                  </button>
                ))}
              </div>
            </details>
          </div>

          {needsGrund && (
            <div>
              <label htmlFor="grund" className="nv-field-label">
                Begründung für {"{grund}"}
              </label>
              <textarea id="grund" className="nv-input text-sm !min-h-16" rows={2} maxLength={1000} value={grund} onChange={(e) => setGrund(e.target.value)} />
            </div>
          )}

          {statusTargets.length > 0 && (
            <div>
              <p className="nv-field-label">Gleichzeitig Status ändern (optional)</p>
              <StatusSelect
                label="Gleichzeitig Status ändern"
                options={statusTargets}
                value={alsoStatus || null}
                onChange={(s) => setAlsoStatus(s ?? "")}
                placeholder="Status nicht ändern"
                allowNone
              />
            </div>
          )}
        </div>

        {/* Absender + Senden – direkt am Textfeld */}
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Senden als</span>
            <div className="inline-flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Absender">
              {[
                { team: false, label: sender.name },
                { team: true, label: "Nordverkehr-Team" },
              ].map((o) => (
                <button
                  key={String(o.team)}
                  type="button"
                  role="radio"
                  aria-checked={asTeam === o.team}
                  onClick={() => setAsTeam(o.team)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${asTeam === o.team ? "bg-red text-white" : "text-muted hover:text-fg"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <HelpLink id="absender" label="Unterschied?" />
          </div>
          {followUp.reminderDays > 0 && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="nv-check !mt-0.5"
                checked={expectReply}
                onChange={(e) => {
                  setExpectReply(e.target.checked);
                  setExpectTouched(true);
                }}
              />
              <span>
                Antwort erwartet (Rückfrage mit Frist)
                <span className="block text-xs text-muted">
                  Kommt nichts, erinnert der Bot nach {followUp.reminderDays} Tag{followUp.reminderDays === 1 ? "" : "en"}; nach {followUp.closeDays} Tagen schlägt das Portal vor, die Bewerbung zu schließen.
                </span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted" aria-live="polite">
              {sent ? "Gesendet – Zustellstatus siehst du im Verlauf." : `${rendered.text.length} / 3800 Zeichen`}
            </p>
            <button type="button" className="nv-btn nv-btn-primary" disabled={pending || !body.trim()} onClick={send}>
              <PaperPlaneTilt size={16} weight="fill" aria-hidden /> {pending ? "Sendet …" : "Per DM senden"}
            </button>
          </div>
          {sendError && <p className="nv-error">{sendError}</p>}
        </div>
      </div>

      {/* Vorschau: schmal direkt hier, breit in der Seitenleiste */}
      {!slot && preview}
    </div>
    {slot && visible && createPortal(<div className="nv-card p-5">{preview}</div>, slot)}
    </div>
  );
}
