"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CloudCheck,
  CloudSlash,
  PaperPlaneTilt,
  PencilSimple,
  Spinner,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import {
  CONFIRMATIONS,
  formatAnswerForDisplay,
  validateSection,
  type AnswerMap,
  type AnswerValue,
  type ConfirmationKey,
  type FormSectionDef,
} from "@/lib/applications/form";
import { saveDraft, submitApplicationAction } from "@/app/actions/application";
import { QuestionField } from "@/components/apply/QuestionField";
import type { UploadedFile } from "@/components/apply/FileUpload";

interface Props {
  position: { id: string; title: string; slug: string };
  sections: FormSectionDef[];
  minAge: number;
  displayName: string;
  /** fromProfile: allgemeine Antworten stammen vollständig aus der letzten Bewerbung */
  initial: { draftId: string | null; data: AnswerMap; step: number; age: number | null; fromProfile?: boolean };
  initialUploads: Record<string, UploadedFile>;
}

type Page =
  | { key: string; title: string; kind: "start" | "general" | "confirm" | "review" }
  | { key: string; title: string; kind: "section"; section: FormSectionDef };

/** Schritte des Formulars; zusammengeklappt ersetzt eine Zusammenfassung die allgemeinen Abschnitte. */
function buildPages(sections: FormSectionDef[], collapsed: boolean): Page[] {
  const hasGeneral = sections.some((s) => s.general);
  return [
    { key: "start", title: "Start", kind: "start" },
    ...(collapsed && hasGeneral ? [{ key: "general", title: "Deine Angaben", kind: "general" } as const] : []),
    ...sections.filter((s) => !(collapsed && s.general)).map((s) => ({ key: s.id, title: s.title, kind: "section" as const, section: s })),
    { key: "confirm", title: "Abschluss", kind: "confirm" },
    { key: "review", title: "Überprüfen", kind: "review" },
  ];
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "error"; message: string };

export function ApplicationForm({ position, sections, minAge, displayName, initial, initialUploads }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(!!initial.fromProfile);
  const steps = useMemo(() => buildPages(sections, collapsed), [sections, collapsed]);
  const last = steps.length - 1;
  const generalSections = useMemo(() => sections.filter((s) => s.general), [sections]);
  /** Index eines Abschnitts in der aufgeklappten Ansicht */
  const expandedIndex = (sectionId: string) => buildPages(sections, false).findIndex((p) => p.key === sectionId);
  function expandTo(sectionId?: string) {
    setCollapsed(false);
    setErrors({});
    setStep(sectionId ? expandedIndex(sectionId) : 1);
  }

  const [step, setStep] = useState(Math.min(initial.step, last - 1));
  const [data, setData] = useState<AnswerMap>(initial.data);
  const [age, setAge] = useState<number | null>(initial.age);
  const [draftId, setDraftId] = useState<string | null>(initial.draftId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Record<ConfirmationKey, boolean>>({
    voice: false,
    rules: false,
    truth: false,
    privacy: false,
  });
  const [uploads, setUploads] = useState(initialUploads);
  const [save, setSave] = useState<SaveState>(initial.draftId ? { kind: "saved", at: new Date() } : { kind: "idle" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const honeypot = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const saving = useRef<Promise<string | null> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // ─── Autosave ────────────────────────────────────────────
  const persist = useCallback(async (): Promise<string | null> => {
    if (saving.current) await saving.current;
    dirty.current = false;
    setSave({ kind: "saving" });
    const p = saveDraft({ positionId: position.id, draftId, data, step, age })
      .then((res) => {
        if (res.ok) {
          setDraftId(res.data.draftId);
          setSave({ kind: "saved", at: new Date(res.data.savedAt) });
          return res.data.draftId;
        }
        setSave({ kind: "error", message: res.error });
        return null;
      })
      .catch(() => {
        dirty.current = true;
        setSave({ kind: "error", message: "Offline – wird erneut versucht." });
        return null;
      })
      .finally(() => {
        saving.current = null;
      });
    saving.current = p;
    return p;
  }, [position.id, draftId, data, step, age]);

  // Nur nach echten Änderungen speichern (rev zählt Eingaben/Schrittwechsel)
  const [rev, setRev] = useState(0);
  const touch = () => {
    dirty.current = true;
    setRev((r) => r + 1);
  };
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);
  useEffect(() => {
    if (rev === 0) return;
    const t = setTimeout(() => void persistRef.current(), 1200);
    return () => clearTimeout(t);
  }, [rev]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Fokus auf Überschrift beim Schrittwechsel (Screenreader & Tastatur)
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const setAnswer = (qid: string, v: AnswerValue) => {
    setData((d) => ({ ...d, [qid]: v }));
    touch();
    if (errors[qid]) setErrors(({ [qid]: _removed, ...rest }) => rest);
  };

  // ─── Navigation ──────────────────────────────────────────
  const underAge = age !== null && age < minAge;

  function validateStep(i: number): boolean {
    if (i === 0) {
      if (age === null || !Number.isInteger(age) || age < 10 || age > 99) {
        setErrors({ age: "Bitte gib dein Alter an." });
        return false;
      }
      return !underAge;
    }
    const page = steps[i];
    if (page?.kind === "general") {
      // Sollte nicht passieren (nur bei vollständigen Angaben zusammengeklappt) – sonst aufklappen
      const bad = generalSections.find((s) => Object.keys(validateSection(s, data)).length > 0);
      if (bad) {
        expandTo(bad.id);
        return false;
      }
    }
    if (page?.kind === "section") {
      const errs = validateSection(page.section, data);
      setErrors(errs);
      if (Object.keys(errs).length) {
        const first = Object.keys(errs)[0];
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-q="${first}"] input, [data-q="${first}"] textarea, [data-q="${first}"] select, [data-q="${first}"] button`)?.focus());
        return false;
      }
    }
    if (i === last - 1) {
      const missing = CONFIRMATIONS.filter((c) => !confirm[c.key]);
      if (missing.length) {
        setErrors(Object.fromEntries(missing.map((c) => [`confirm:${c.key}`, "Bitte bestätigen."])));
        return false;
      }
    }
    return true;
  }

  function go(to: number) {
    if (to > step && !validateStep(step)) return;
    setErrors({});
    setStep(Math.max(0, Math.min(last, to)));
    touch();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function jumpTo(to: number) {
    // Zurück immer, vorwärts nur über bereits gültige Schritte
    if (to <= step) return go(to);
    for (let i = step; i < to; i++) if (!validateStep(i)) return setStep(i);
    setErrors({});
    setStep(to);
  }

  function submit() {
    setSubmitError(null);
    startSubmit(async () => {
      const id = (await persist()) ?? draftId;
      if (!id) {
        setSubmitError("Dein Entwurf konnte nicht gespeichert werden. Versuch es gleich nochmal.");
        return;
      }
      const res = await submitApplicationAction({
        draftId: id,
        data,
        age: age ?? 0,
        confirmations: confirm,
        website: honeypot.current?.value || undefined,
      });
      if (res.ok) {
        dirty.current = false;
        router.push(`/dashboard/${res.data.applicationId}?neu=1`);
      } else {
        setSubmitError(res.error);
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
          // Zum ersten fehlerhaften Schritt springen
          const firstQ = Object.keys(res.fieldErrors)[0];
          if (firstQ === "age") setStep(0);
          else {
            const target = sections.find((s) => s.questions.some((q) => q.id === firstQ));
            if (target) {
              setCollapsed(false);
              setStep(expandedIndex(target.id));
            }
          }
        }
      }
    });
  }

  const progress = Math.round((step / last) * 100);
  const current = steps[step];
  const section = current.kind === "section" ? current.section : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[240px_1fr] lg:gap-12">
      {/* Schrittliste */}
      <aside className="lg:sticky lg:top-28 self-start">
        <div className="flex items-center justify-between lg:block">
          <p className="nv-mono">
            Schritt {step + 1} / {steps.length}
          </p>
          <SaveIndicator state={save} />
        </div>
        <div
          className="mt-3 h-1.5 rounded-full bg-[var(--nv-border)] overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Fortschritt"
        >
          <div className="h-full bg-red rounded-full transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <ol className="mt-6 hidden lg:flex flex-col gap-1">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => jumpTo(i)}
                aria-current={i === step ? "step" : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  i === step ? "bg-red-soft text-fg" : "text-muted hover:text-fg hover:bg-card-hover"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[0.7rem] ${
                    i < step ? "border-red bg-red text-white" : i === step ? "border-red-line text-red-text" : "border-line"
                  }`}
                >
                  {i < step ? <CheckCircle size={14} weight="bold" aria-hidden /> : i + 1}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      {/* Inhalt */}
      <div className="min-w-0">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step === last) submit();
            else go(step + 1);
          }}
          className="nv-card p-6 sm:p-8 bg-surface"
        >
          {/* Honeypot – für Menschen unsichtbar */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <div key={current.key} className="nv-fade">
            <p className="nv-label">
              {position.title.toUpperCase()}
              {" // "}
              {current.title.toUpperCase()}
            </p>
            <h2 ref={headingRef} tabIndex={-1} className="nv-headline text-3xl sm:text-4xl mt-3 outline-none">
              {step === 0 && (
                <>
                  Moin {displayName}. <em>Los geht&apos;s.</em>
                </>
              )}
              {current.kind === "general" && (
                <>
                  Deine <em>Angaben.</em>
                </>
              )}
              {section && section.title}
              {step === last - 1 && (
                <>
                  Fast <em>geschafft.</em>
                </>
              )}
              {step === last && (
                <>
                  Alles <em>richtig?</em>
                </>
              )}
            </h2>

            {/* Start */}
            {step === 0 && (
              <div className="mt-6 space-y-6">
                <p className="text-muted">
                  Du bewirbst dich als <strong className="text-fg">{position.title}</strong>. Nimm dir Zeit – dein
                  Entwurf wird automatisch gespeichert, du kannst jederzeit pausieren und später weitermachen.
                </p>
                <div className="max-w-xs" data-q="age">
                  <label htmlFor="age" className="nv-field-label">
                    Wie alt bist du?
                  </label>
                  <input
                    id="age"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={99}
                    className="nv-input mt-1"
                    value={age ?? ""}
                    aria-invalid={!!errors.age || underAge}
                    aria-describedby="age-help"
                    onChange={(e) => {
                      setAge(e.target.value === "" ? null : Number(e.target.value));
                      setErrors({});
                      touch();
                    }}
                  />
                  <p id="age-help" className="nv-help mt-1.5">
                    Mindestalter für Team-Positionen: {minAge} Jahre.
                  </p>
                  {errors.age && <p className="nv-error mt-1" role="alert">{errors.age}</p>}
                </div>
                {underAge && (
                  <div className="rounded-xl border nv-tone-warn px-4 py-3 text-sm" role="alert">
                    <p className="font-semibold">Leider noch zu früh.</p>
                    <p className="text-fg-2 mt-0.5">
                      Aus Jugendschutzgründen nehmen wir ins Team erst Leute ab {minAge} Jahren auf. Spiel gern weiter auf
                      dem Server – und komm wieder, wenn&apos;s so weit ist.
                    </p>
                  </div>
                )}
                <ul className="grid gap-2 sm:grid-cols-2 text-sm text-fg-2">
                  <li className="flex gap-2">
                    <CheckCircle size={18} className="text-red-text shrink-0" aria-hidden /> ca. 15–25 Minuten
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle size={18} className="text-red-text shrink-0" aria-hidden /> Eigene Worte statt Copy-Paste
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle size={18} className="text-red-text shrink-0" aria-hidden /> Bestätigung per Discord-DM
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle size={18} className="text-red-text shrink-0" aria-hidden /> Status jederzeit im Dashboard
                  </li>
                </ul>
              </div>
            )}

            {/* Allgemeine Angaben aus der letzten Bewerbung */}
            {current.kind === "general" && (
              <div className="mt-6 space-y-6">
                <p className="text-muted">
                  Die allgemeinen Fragen kennst du schon von deiner letzten Bewerbung – wir haben deine Antworten
                  übernommen. Passt noch alles? Dann einfach weiter.
                </p>
                {generalSections.map((s) => (
                  <ReviewBlock key={s.id} title={s.title} onEdit={() => expandTo(s.id)} editLabel="Anpassen">
                    {s.questions.map((q) => (
                      <ReviewRow key={q.id} label={q.label} value={formatAnswerForDisplay(q.type, data[q.id] ?? null)} />
                    ))}
                  </ReviewBlock>
                ))}
                <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => expandTo()}>
                  <PencilSimple size={14} aria-hidden /> Alle allgemeinen Antworten anpassen
                </button>
              </div>
            )}

            {/* Fragen */}
            {section && (
              <div className="mt-2">
                {section.description && <p className="text-muted">{section.description}</p>}
                <div className="mt-8 space-y-8">
                  {section.questions.map((q) => (
                    <div key={q.id} data-q={q.id}>
                      <QuestionField
                        q={q}
                        value={data[q.id]}
                        error={errors[q.id]}
                        onChange={(v) => setAnswer(q.id, v)}
                        uploads={uploads}
                        onUploaded={(f) => setUploads((u) => ({ ...u, [f.id]: f }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bestätigungen */}
            {step === last - 1 && (
              <div className="mt-6 space-y-4">
                <p className="text-muted">Ein paar Dinge, die uns wichtig sind. Ohne geht&apos;s nicht.</p>
                {CONFIRMATIONS.map((c) => (
                  <div key={c.key} data-q={`confirm:${c.key}`}>
                    <label className="flex items-start gap-3 rounded-xl border border-line p-4 cursor-pointer hover:border-line-strong">
                      <input
                        type="checkbox"
                        className="nv-check"
                        checked={confirm[c.key]}
                        aria-invalid={!!errors[`confirm:${c.key}`]}
                        onChange={(e) => {
                          setConfirm((s) => ({ ...s, [c.key]: e.target.checked }));
                          setErrors(({ [`confirm:${c.key}`]: _r, ...rest }) => rest);
                        }}
                      />
                      <span className="text-sm">
                        {c.label}
                        {"link" in c && c.link && (
                          <>
                            {" "}
                            <a
                              href={c.link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="nv-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {c.link.label} öffnen
                            </a>
                          </>
                        )}
                      </span>
                    </label>
                    {errors[`confirm:${c.key}`] && <p className="nv-error mt-1 ml-1">{errors[`confirm:${c.key}`]}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Überprüfen */}
            {step === last && (
              <div className="mt-6 space-y-6">
                <p className="text-muted">
                  Schau nochmal drüber. Nach dem Absenden kannst du nichts mehr ändern – Rückfragen klären wir per
                  Nachricht.
                </p>
                <ReviewBlock title="Start" onEdit={() => setStep(0)}>
                  <ReviewRow label="Alter" value={age ? String(age) : "–"} />
                </ReviewBlock>
                {sections.map((s) => (
                  <ReviewBlock
                    key={s.id}
                    title={s.title}
                    onEdit={() => {
                      const idx = steps.findIndex((p) => p.key === s.id);
                      if (idx >= 0) setStep(idx);
                      else expandTo(s.id);
                    }}
                  >
                    {s.questions.map((q) => (
                      <ReviewRow
                        key={q.id}
                        label={q.label}
                        value={
                          q.type === "FILE"
                            ? `${Array.isArray(data[q.id]) ? (data[q.id] as string[]).length : 0} Bild(er)`
                            : formatAnswerForDisplay(q.type, data[q.id] ?? null)
                        }
                        missing={q.required && (data[q.id] === undefined || data[q.id] === "" || data[q.id] === null)}
                      />
                    ))}
                  </ReviewBlock>
                ))}
                {submitError && (
                  <div className="rounded-xl border nv-tone-danger px-4 py-3 text-sm flex gap-2" role="alert">
                    <WarningCircle size={18} className="shrink-0 mt-0.5" aria-hidden />
                    {submitError}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="mt-10 pt-6 border-t border-line flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {step > 0 ? (
              <button type="button" onClick={() => go(step - 1)} className="nv-btn nv-btn-ghost">
                <ArrowLeft size={16} aria-hidden /> Zurück
              </button>
            ) : (
              <Link href={`/positionen/${position.slug}`} className="nv-btn nv-btn-quiet">
                <ArrowLeft size={16} aria-hidden /> Zur Position
              </Link>
            )}
            {step < last ? (
              <button type="submit" className="nv-btn nv-btn-primary" disabled={step === 0 && underAge}>
                Weiter <ArrowRight size={16} aria-hidden />
              </button>
            ) : (
              <button type="submit" className="nv-btn nv-btn-primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner size={16} className="animate-spin" aria-hidden /> Wird gesendet …
                  </>
                ) : (
                  <>
                    <PaperPlaneTilt size={16} weight="fill" aria-hidden /> Bewerbung absenden
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="lg:mt-2 flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
      {state.kind === "saving" && (
        <>
          <Spinner size={13} className="animate-spin" aria-hidden /> Speichert …
        </>
      )}
      {state.kind === "saved" && (
        <>
          <CloudCheck size={14} className="text-[var(--tone-success)]" aria-hidden /> Entwurf gespeichert
        </>
      )}
      {state.kind === "error" && (
        <>
          <CloudSlash size={14} className="text-[var(--tone-danger)]" aria-hidden /> {state.message}
        </>
      )}
      {state.kind === "idle" && <>Wird beim Tippen gespeichert</>}
    </p>
  );
}

function ReviewBlock({ title, onEdit, editLabel = "Bearbeiten", children }: { title: string; onEdit: () => void; editLabel?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h3 className="font-semibold text-sm">{title}</h3>
        <button type="button" onClick={onEdit} className="nv-btn nv-btn-quiet nv-btn-sm">
          <PencilSimple size={14} aria-hidden /> {editLabel}
        </button>
      </header>
      <dl className="divide-y divide-[var(--nv-border)]">{children}</dl>
    </section>
  );
}

function ReviewRow({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="px-4 py-3 grid gap-1 sm:grid-cols-[1fr_1.4fr] sm:gap-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-sm whitespace-pre-wrap break-words ${missing ? "text-[var(--tone-danger)]" : ""}`}>
        {missing ? "Fehlt noch" : value || "–"}
      </dd>
    </div>
  );
}
