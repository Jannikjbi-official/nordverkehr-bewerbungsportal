"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, PencilSimple, Plus, Trash } from "@phosphor-icons/react/ssr";
import { deleteTemplateAction, reorderTemplatesAction, saveTemplateAction } from "@/app/actions/team";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/applications/status";
import { PLACEHOLDERS, renderTemplate } from "@/lib/messages/placeholders";
import { DiscordPreview } from "@/components/team/DiscordPreview";
import type { TemplateCategory } from "@prisma/client";

interface Template {
  id: string;
  category: TemplateCategory;
  title: string;
  body: string;
  active: boolean;
}

const SAMPLE = {
  name: "Jonas",
  discord_tag: "@jonas.hh",
  position: "Support",
  bewerbungs_id: "NV-2026-0042",
  datum: "11. November 2026",
  termin: "Donnerstag, 13. November 2026 um 19:00 Uhr",
  teammitglied: "Jannik",
  grund: "Deine Antworten waren uns an einigen Stellen zu knapp.",
  sperrfrist: "11. Dezember 2026",
  bearbeitungszeit: "in der Regel 3–7 Tage",
  dashboard_link: "https://bewerbung.nordverkehr.xyz/dashboard",
};

export function TemplateManager({ templates: initial }: { templates: Template[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initial);
  const [category, setCategory] = useState<TemplateCategory>("EINGANG");
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Nach router.refresh() neue Server-Daten übernehmen
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setTemplates(initial);
  }

  const list = templates.filter((t) => t.category === category);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = list.findIndex((t) => t.id === e.active.id);
    const newIndex = list.findIndex((t) => t.id === e.over!.id);
    const moved = arrayMove(list, oldIndex, newIndex);
    setTemplates((all) => [...all.filter((t) => t.category !== category), ...moved]);
    start(async () => {
      await reorderTemplatesAction(moved.map((t) => t.id));
      router.refresh();
    });
  }

  function save() {
    if (!editing) return;
    setError(null);
    start(async () => {
      const res = await saveTemplateAction({
        id: editing.id,
        category: editing.category ?? category,
        title: editing.title ?? "",
        body: editing.body ?? "",
        active: editing.active ?? true,
      });
      if (!res.ok) setError(res.error);
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Kategorien">
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={`nv-pill transition-colors ${category === c ? "nv-pill-red" : "hover:text-fg"}`}
            >
              {CATEGORY_LABEL[c]} <span className="text-faint">{templates.filter((t) => t.category === c).length}</span>
            </button>
          ))}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {list.map((t) => (
                <SortableItem
                  key={t.id}
                  t={t}
                  active={editing?.id === t.id}
                  onEdit={() => setEditing(t)}
                  onDelete={() => {
                    if (!confirm(`Baustein „${t.title}“ löschen?`)) return;
                    start(async () => {
                      await deleteTemplateAction(t.id);
                      router.refresh();
                    });
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {list.length === 0 && <p className="text-sm text-muted">Noch keine Bausteine in dieser Kategorie.</p>}
        <button type="button" className="nv-btn nv-btn-ghost" onClick={() => setEditing({ category, title: "", body: "", active: true })}>
          <Plus size={16} aria-hidden /> Neuer Baustein
        </button>
      </div>

      <div className="min-w-0">
        {editing ? (
          <div className="nv-card p-5 space-y-4 xl:sticky xl:top-28">
            <p className="nv-mono">{editing.id ? "Baustein bearbeiten" : "Neuer Baustein"}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <div>
                <label htmlFor="tpl-title" className="nv-field-label">
                  Titel
                </label>
                <input id="tpl-title" className="nv-input" maxLength={80} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <label htmlFor="tpl-cat" className="nv-field-label">
                  Kategorie
                </label>
                <select id="tpl-cat" className="nv-input" value={editing.category ?? category} onChange={(e) => setEditing({ ...editing, category: e.target.value as TemplateCategory })}>
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="tpl-body" className="nv-field-label">
                Text
              </label>
              <textarea id="tpl-body" className="nv-input font-mono text-sm !min-h-48" maxLength={3500} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button key={p.key} type="button" title={p.label} className="nv-kbd hover:text-fg" onClick={() => setEditing({ ...editing, body: `${editing.body ?? ""}{${p.key}}` })}>
                    {`{${p.key}}`}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="nv-check !mt-0" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Aktiv (im Editor auswählbar)
            </label>
            <div>
              <p className="nv-mono mb-2">Vorschau (Beispieldaten)</p>
              <DiscordPreview title="Nachricht vom Nordverkehr-Team" body={renderTemplate(editing.body ?? "", SAMPLE).text} publicId={SAMPLE.bewerbungs_id} />
            </div>
            {error && <p className="nv-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="nv-btn nv-btn-quiet" onClick={() => setEditing(null)}>
                Abbrechen
              </button>
              <button type="button" className="nv-btn nv-btn-primary" disabled={pending} onClick={save}>
                {pending ? "Speichert …" : "Speichern"}
              </button>
            </div>
          </div>
        ) : (
          <div className="nv-card p-8 text-center text-sm text-muted">Wähle links einen Baustein zum Bearbeiten oder lege einen neuen an.</div>
        )}
      </div>
    </div>
  );
}

function SortableItem({ t, active, onEdit, onDelete }: { t: Template; active: boolean; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 rounded-xl border p-3 bg-surface ${active ? "border-red-line" : "border-line"} ${isDragging ? "opacity-60 z-10 relative" : ""}`}
    >
      <button type="button" className="nv-btn nv-btn-quiet !p-1 cursor-grab touch-none" aria-label={`„${t.title}“ verschieben`} {...attributes} {...listeners}>
        <DotsSixVertical size={16} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium flex items-center gap-2">
          {t.title}
          {!t.active && <span className="nv-pill !text-[0.65rem] !py-0">inaktiv</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted line-clamp-2 whitespace-pre-wrap">{t.body}</p>
      </div>
      <button type="button" className="nv-btn nv-btn-quiet !p-1.5" aria-label={`„${t.title}“ bearbeiten`} onClick={onEdit}>
        <PencilSimple size={15} aria-hidden />
      </button>
      <button type="button" className="nv-btn nv-btn-quiet !p-1.5" aria-label={`„${t.title}“ löschen`} onClick={onDelete}>
        <Trash size={15} aria-hidden />
      </button>
    </li>
  );
}
