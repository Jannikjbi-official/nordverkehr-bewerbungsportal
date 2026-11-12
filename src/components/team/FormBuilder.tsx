"use client";

import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, DotsSixVertical, PencilSimple, Plus, Trash, Warning } from "@phosphor-icons/react/ssr";
import {
  archiveQuestionAction,
  deleteSectionAction,
  reorderQuestionsAction,
  reorderSectionsAction,
  saveQuestionAction,
  saveSectionAction,
} from "@/app/actions/admin";
import { QUESTION_TYPE_LABEL, type FormQuestion, type FormSectionDef } from "@/lib/applications/form";
import { QuestionField } from "@/components/apply/QuestionField";
import { Select } from "@/components/Select";
import { KEY_PATTERN, findSimilarQuestions, suggestKey, type ExistingQuestion } from "@/lib/applications/similarity";
import type { QuestionType } from "@prisma/client";

const TYPES = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Fehler");
      else {
        after?.();
        router.refresh();
      }
    });
  };
  return { pending, error, run };
}

interface BuilderContext {
  keyPrefix: string | null;
  existingQuestions: ExistingQuestion[];
}

export function FormBuilder({
  positionId,
  sections: initial,
  keyPrefix,
  existingQuestions,
}: { positionId: string | null; sections: FormSectionDef[] } & BuilderContext) {
  const [sections, setSections] = useState(initial);
  const { pending, error, run } = useRun();
  const [newTitle, setNewTitle] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setSections(initial);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const moved = arrayMove(sections, sections.findIndex((s) => s.id === e.active.id), sections.findIndex((s) => s.id === e.over!.id));
    setSections(moved);
    run(() => reorderSectionsAction(moved.map((s) => s.id)));
  }

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map((s, i) => (
            <SortableSection key={s.id} section={s} index={i} ctx={{ keyPrefix, existingQuestions }} />
          ))}
        </SortableContext>
      </DndContext>
      {sections.length === 0 && <p className="text-sm text-muted">Noch keine Schritte.</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSectionAction({ positionId, title: newTitle, description: null }), () => setNewTitle(""));
        }}
      >
        <label htmlFor="new-section" className="sr-only">
          Neuer Schritt
        </label>
        <input id="new-section" className="nv-input" placeholder="Titel für neuen Schritt" maxLength={80} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button className="nv-btn nv-btn-ghost" disabled={pending || newTitle.trim().length < 2}>
          <Plus size={16} aria-hidden /> Schritt
        </button>
      </form>
      {error && <p className="nv-error">{error}</p>}
    </div>
  );
}

function SortableSection({ section, index, ctx }: { section: FormSectionDef; index: number; ctx: BuilderContext }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const [questions, setQuestions] = useState(section.questions);
  const [editing, setEditing] = useState<Partial<FormQuestion> | null>(null);
  const [meta, setMeta] = useState<{ title: string; description: string } | null>(null);
  const { pending, error, run } = useRun();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [prevQuestions, setPrevQuestions] = useState(section.questions);
  if (prevQuestions !== section.questions) {
    setPrevQuestions(section.questions);
    setQuestions(section.questions);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const moved = arrayMove(questions, questions.findIndex((q) => q.id === e.active.id), questions.findIndex((q) => q.id === e.over!.id));
    setQuestions(moved);
    run(() => reorderQuestionsAction(moved.map((q) => q.id)));
  }

  return (
    <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`nv-card ${isDragging ? "opacity-60 relative z-10" : ""}`}>
      <header className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <button type="button" className="nv-btn nv-btn-quiet !p-1 cursor-grab touch-none" aria-label={`Schritt „${section.title}“ verschieben`} {...attributes} {...listeners}>
          <DotsSixVertical size={18} aria-hidden />
        </button>
        <span className="font-mono text-xs text-red-text">{String(index + 1).padStart(2, "0")}</span>
        {meta ? (
          <form
            className="flex-1 flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveSectionAction({ id: section.id, positionId: null, title: meta.title, description: meta.description || null }), () => setMeta(null));
            }}
          >
            <input className="nv-input !py-1.5" aria-label="Titel" value={meta.title} maxLength={80} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            <input className="nv-input !py-1.5" aria-label="Beschreibung" placeholder="Beschreibung (optional)" value={meta.description} maxLength={400} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            <button className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending}>
              OK
            </button>
          </form>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{section.title}</p>
            {section.description && <p className="text-xs text-muted truncate">{section.description}</p>}
          </div>
        )}
        {!meta && (
          <button type="button" className="nv-btn nv-btn-quiet !p-1.5" aria-label="Schritt bearbeiten" onClick={() => setMeta({ title: section.title, description: section.description ?? "" })}>
            <PencilSimple size={15} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="nv-btn nv-btn-quiet !p-1.5"
          aria-label="Schritt löschen"
          onClick={async () =>
            (await confirmDialog({
              title: "Schritt löschen?",
              body: `„${section.title}“ wird samt Fragen gelöscht. Eingereichte Antworten bleiben erhalten.`,
              confirmLabel: "Löschen",
              tone: "danger",
            })) && run(() => deleteSectionAction(section.id))
          }
        >
          <Trash size={15} aria-hidden />
        </button>
      </header>

      <div className="p-4 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {questions.map((q) => (
                <SortableQuestion
                  key={q.id}
                  q={q}
                  onEdit={() => setEditing(q)}
                  onArchive={async () =>
                    (await confirmDialog({ title: "Frage entfernen?", body: "Bereits eingereichte Antworten bleiben erhalten.", confirmLabel: "Entfernen", tone: "danger" })) &&
                    run(() => archiveQuestionAction(q.id))
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {editing ? (
          <QuestionEditor
            q={editing}
            ctx={ctx}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(q, confirmSimilar) =>
              run(
                () =>
                  saveQuestionAction({
                    id: q.id,
                    sectionId: section.id,
                    key: q.key || null,
                    confirmSimilar,
                    label: q.label ?? "",
                    helpText: q.helpText || null,
                    placeholder: q.placeholder || null,
                    type: q.type ?? "LONG_TEXT",
                    required: q.required ?? true,
                    minLength: q.minLength ?? null,
                    maxLength: q.maxLength ?? null,
                    minValue: q.minValue ?? null,
                    maxValue: q.maxValue ?? null,
                    options: q.options ?? [],
                    correctOption: q.type === "QUIZ" ? (q.correctOption ?? null) : null,
                  }),
                () => setEditing(null),
              )
            }
          />
        ) : (
          <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setEditing({ type: "LONG_TEXT", required: true, options: [] })}>
            <Plus size={14} aria-hidden /> Frage hinzufügen
          </button>
        )}
        {error && <p className="nv-error">{error}</p>}
      </div>
    </section>
  );
}

function SortableQuestion({ q, onEdit, onArchive }: { q: FormQuestion; onEdit: () => void; onArchive: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 rounded-xl border border-line bg-surface px-2 py-2 ${isDragging ? "opacity-60 relative z-10" : ""}`}>
      <button type="button" className="nv-btn nv-btn-quiet !p-1 cursor-grab touch-none" aria-label={`Frage „${q.label}“ verschieben`} {...attributes} {...listeners}>
        <DotsSixVertical size={16} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{q.label}</p>
        <p className="text-xs text-muted">
          {q.key && <span className="font-mono">{q.key} · </span>}
          {QUESTION_TYPE_LABEL[q.type]}
          {q.type === "QUIZ" && (q.correctOption ? ` · richtig: „${q.correctOption}“` : " · ⚠ keine Lösung")}
          {q.required ? " · Pflicht" : " · optional"}
          {q.minLength ? ` · min. ${q.minLength} Zeichen` : ""}
        </p>
      </div>
      <button type="button" className="nv-btn nv-btn-quiet !p-1.5" aria-label="Frage bearbeiten" onClick={onEdit}>
        <PencilSimple size={15} aria-hidden />
      </button>
      <button type="button" className="nv-btn nv-btn-quiet !p-1.5" aria-label="Frage entfernen" onClick={onArchive}>
        <Archive size={15} aria-hidden />
      </button>
    </li>
  );
}

function QuestionEditor({
  q: initial,
  ctx,
  pending,
  onSave,
  onCancel,
}: {
  q: Partial<FormQuestion>;
  ctx: BuilderContext;
  pending: boolean;
  onSave: (q: Partial<FormQuestion>, confirmSimilar: boolean) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState(initial);
  const [confirmSimilar, setConfirmSimilar] = useState(false);
  const keyValue = q.key ?? "";
  const keyInvalid = keyValue !== "" && !KEY_PATTERN.test(keyValue);
  const keySuggestion = q.label && q.label.trim().length >= 3 ? suggestKey(q.label, ctx.keyPrefix) : null;
  const similar = findSimilarQuestions({ id: initial.id, key: keyValue || null, label: q.label ?? "" }, ctx.existingQuestions).slice(0, 3);
  const [opts, setOpts] = useState((initial.options ?? []).join("\n"));
  const set = <K extends keyof FormQuestion>(k: K, v: FormQuestion[K]) => setQ((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));
  const type = q.type ?? "LONG_TEXT";
  const isText = ["SHORT_TEXT", "LONG_TEXT", "SCENARIO", "URL"].includes(type);
  const isChoice = ["SELECT", "MULTI_SELECT", "QUIZ"].includes(type);
  const preview: FormQuestion = {
    id: "preview",
    key: null,
    label: q.label || "Fragetext",
    helpText: q.helpText ?? null,
    placeholder: q.placeholder ?? null,
    type,
    required: q.required ?? true,
    minLength: q.minLength ?? null,
    maxLength: q.maxLength ?? null,
    minValue: q.minValue ?? null,
    maxValue: q.maxValue ?? null,
    options: opts.split("\n").map((o) => o.trim()).filter(Boolean),
  };

  return (
    <div className="rounded-xl border border-red-line p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div>
          <label htmlFor="q-label" className="nv-field-label">
            Frage
          </label>
          <input id="q-label" className="nv-input" maxLength={300} value={q.label ?? ""} onChange={(e) => set("label", e.target.value)} />
        </div>
        <div>
          <label htmlFor="q-type" className="nv-field-label">
            Typ
          </label>
          <Select id="q-type" options={TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABEL[t] }))} value={type} onChange={(v) => set("type", v)} />
        </div>
        <div>
          <label htmlFor="q-help" className="nv-field-label">
            Hilfetext
          </label>
          <input id="q-help" className="nv-input" maxLength={400} value={q.helpText ?? ""} onChange={(e) => set("helpText", e.target.value)} />
        </div>
        <div>
          <label htmlFor="q-ph" className="nv-field-label">
            Platzhalter
          </label>
          <input id="q-ph" className="nv-input" maxLength={120} value={q.placeholder ?? ""} onChange={(e) => set("placeholder", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="q-key" className="nv-field-label">
            Key (eindeutig)
          </label>
          <input
            id="q-key"
            className="nv-input font-mono text-sm"
            maxLength={60}
            placeholder={keySuggestion ?? "wird automatisch vergeben"}
            value={keyValue}
            aria-invalid={keyInvalid || undefined}
            aria-describedby="q-key-hint"
            onChange={(e) => set("key", e.target.value.toLowerCase().replace(/\s+/g, "_") || null)}
          />
          <p id="q-key-hint" className={`text-xs mt-1 ${keyInvalid ? "text-red-text" : "text-muted"}`}>
            {keyInvalid
              ? "Nur a–z, 0–9, _ und höchstens ein Punkt, z. B. support.tickets."
              : "Leer lassen = automatisch aus dem Fragetext. Allgemeine Antworten werden über diesen Key zwischen Bewerbungen wiederverwendet."}
          </p>
        </div>
      </div>
      {similar.length > 0 && (
        <div className="nv-tone-warn rounded-xl border p-3 text-sm space-y-2" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <Warning size={16} aria-hidden /> Diese Frage gibt es so ähnlich schon
          </p>
          <ul className="space-y-1">
            {similar.map((h) => (
              <li key={h.id} className="text-xs">
                <span className="opacity-80">{h.where}:</span> „{h.label}“{" "}
                <span className="opacity-80">{h.reason === "key" ? "(gleicher Key)" : `(${Math.round(h.score * 100)} % ähnlich)`}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs opacity-80">Allgemeine Fragen gehören in „Allgemeine Fragen“ – bei Positionen nur fachliche Fragen.</p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" className="nv-check !mt-0" checked={confirmSimilar} onChange={(e) => setConfirmSimilar(e.target.checked)} />
            Ist keine Dublette – trotzdem speichern
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-4 items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="nv-check !mt-0" checked={q.required ?? true} onChange={(e) => set("required", e.target.checked)} /> Pflichtfeld
        </label>
        {isText && (
          <>
            <NumberInput label="Min. Zeichen" value={q.minLength} onChange={(v) => set("minLength", num(v))} />
            <NumberInput label="Max. Zeichen" value={q.maxLength} onChange={(v) => set("maxLength", num(v))} />
          </>
        )}
        {(type === "NUMBER" || type === "MULTI_SELECT") && (
          <>
            <NumberInput label={type === "NUMBER" ? "Min. Wert" : "Min. Auswahl"} value={q.minValue} onChange={(v) => set("minValue", num(v))} />
            <NumberInput label={type === "NUMBER" ? "Max. Wert" : "Max. Auswahl"} value={q.maxValue} onChange={(v) => set("maxValue", num(v))} />
          </>
        )}
      </div>
      {isChoice && (
        <div>
          <label htmlFor="q-opts" className="nv-field-label">
            Optionen (eine pro Zeile)
          </label>
          <textarea id="q-opts" className="nv-input text-sm" rows={4} value={opts} onChange={(e) => setOpts(e.target.value)} />
        </div>
      )}
      {type === "QUIZ" && (
        <div>
          <label htmlFor="q-correct" className="nv-field-label">
            Richtige Antwort
          </label>
          <Select
            id="q-correct"
            placeholder={preview.options.length >= 2 ? "Bitte wählen …" : "Erst mindestens 2 Optionen eintragen"}
            options={preview.options.map((o) => ({ value: o, label: o }))}
            value={q.correctOption && preview.options.includes(q.correctOption) ? q.correctOption : ""}
            onChange={(v) => set("correctOption", v)}
          />
          <p className="nv-help mt-1">Bleibt auf dem Server – Bewerber sehen nur die Optionen. Ausgewertet wird direkt beim Absenden („8 von 10 richtig“).</p>
        </div>
      )}
      <div className="rounded-xl bg-surface-2 p-4">
        <p className="nv-mono mb-3">Vorschau</p>
        <QuestionField q={preview} value={undefined} onChange={() => {}} uploads={{}} onUploaded={() => {}} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={onCancel}>
          Abbrechen
        </button>
        <button
          type="button"
          className="nv-btn nv-btn-primary nv-btn-sm"
          disabled={pending || keyInvalid || (similar.length > 0 && !confirmSimilar)}
          onClick={() => onSave({ ...q, options: preview.options }, confirmSimilar)}
        >
          Frage speichern
        </button>
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      <span className="block text-xs text-muted mb-1">{label}</span>
      <input type="number" className="nv-input !w-28 !py-1.5" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
