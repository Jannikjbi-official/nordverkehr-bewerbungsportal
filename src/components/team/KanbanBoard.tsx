"use client";

import Link from "next/link";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChatCircleDots, WarningCircle } from "@phosphor-icons/react/ssr";
import { changeStatusAction } from "@/app/actions/team";
import { BOARD_STATUSES, STATUS_LABEL, STATUS_TONE, canTeamTransition } from "@/lib/applications/status";
import { avatarUrl } from "@/lib/discord/snowflake";
import type { ApplicationStatus } from "@prisma/client";
import { TagPills } from "@/components/team/TagPills";
import { QuizPill } from "@/components/team/QuizPill";

export interface BoardItem {
  id: string;
  publicId: string;
  status: ApplicationStatus;
  name: string;
  discordId: string;
  avatar: string | null;
  position: string;
  submittedAt: string | null;
  votes: { pro: number; contra: number; abstain: number };
  flags: number;
  unread: number;
  tags: string[];
  quiz?: { correct: number | null; total: number; min: number | null } | null;
}

export function KanbanBoard({ items: initial }: { items: BoardItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dragging, setDragging] = useState<BoardItem | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string; href?: string } | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const item = items.find((i) => i.id === e.active.id);
    const to = e.over?.id as ApplicationStatus | undefined;
    if (!item || !to || item.status === to) return;
    if (!canTeamTransition(item.status, to)) {
      setMessage({ tone: "err", text: `${STATUS_LABEL[item.status]} → ${STATUS_LABEL[to]} ist nicht möglich.` });
      return;
    }
    if ((to === "ACCEPTED" || to === "REJECTED") && !(await confirmDialog({
        title: `${item.name} auf „${STATUS_LABEL[to]}“ setzen?`,
        body: to === "REJECTED" ? "Die Bewerbung wird abgelehnt, die Sperrfrist startet." : "Die Person wird ins Team aufgenommen.",
        confirmLabel: STATUS_LABEL[to],
        tone: to === "REJECTED" ? "danger" : "default",
      }))) return;

    const prev = items;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: to } : i)));
    start(async () => {
      const res = await changeStatusAction({ applicationId: item.id, to: to as "SUBMITTED" });
      if (!res.ok) {
        setItems(prev);
        setMessage({ tone: "err", text: res.error });
      } else {
        setMessage({
          tone: "ok",
          text: `${item.name}: ${STATUS_LABEL[to]}. Denk an eine Nachricht an den Bewerber.`,
          href: `/team/bewerbungen/${item.id}?status=${to}#nachricht`,
        });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div aria-live="polite">
        {message && (
          <div className={`rounded-xl border px-4 py-2.5 text-sm flex items-center justify-between gap-3 ${message.tone === "ok" ? "nv-tone-success" : "nv-tone-danger"}`}>
            <span>{message.text}</span>
            {message.href && (
              <Link href={message.href} className="nv-btn nv-btn-ghost nv-btn-sm">
                Nachricht schreiben
              </Link>
            )}
          </div>
        )}
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(items.find((i) => i.id === e.active.id) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable: "Leertaste zum Aufnehmen, Pfeiltasten zum Verschieben zwischen Spalten, Leertaste zum Ablegen.",
          },
        }}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 nv-scroll-x snap-x">
          {BOARD_STATUSES.map((s) => (
            <Column key={s} status={s} items={items.filter((i) => i.status === s)} />
          ))}
        </div>
        <DragOverlay>{dragging ? <Card item={dragging} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ status, items }: { status: ApplicationStatus; items: BoardItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABEL[status]}
      className={`snap-start w-72 shrink-0 rounded-2xl border p-3 transition-colors ${isOver ? "border-red-line bg-red-soft" : "border-line bg-card"}`}
    >
      <header className="flex items-center justify-between px-1 pb-3">
        <h2 className={`text-sm font-semibold nv-tone-${STATUS_TONE[status]} !bg-transparent`}>{STATUS_LABEL[status]}</h2>
        <span className="text-xs text-muted tabular-nums">{items.length}</span>
      </header>
      <ul className="space-y-2 min-h-24">
        {items.map((i) => (
          <DraggableCard key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

function DraggableCard({ item }: { item: BoardItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <li ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? "opacity-30" : ""} aria-roledescription="Karte">
      <Card item={item} />
    </li>
  );
}

function Card({ item, overlay }: { item: BoardItem; overlay?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-3 cursor-grab active:cursor-grabbing ${overlay ? "shadow-[var(--nv-shadow)] rotate-1" : "hover:border-line-strong"}`}>
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl(item.discordId, item.avatar, 64)} alt="" className="h-8 w-8 rounded-full" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/team/bewerbungen/${item.id}`}
            className="block text-sm font-medium truncate hover:text-red-text"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {item.name}
          </Link>
          <p className="text-xs text-muted truncate">
            {item.position} · <span className="font-mono">{item.publicId}</span>
          </p>
        </div>
      </div>
      {item.tags.length > 0 && (
        <div className="mt-2">
          <TagPills tags={item.tags} />
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-xs">
        <span className="tabular-nums">
          <span className="text-[var(--tone-success)]">+{item.votes.pro}</span>{" "}
          <span className="text-[var(--tone-danger)]">−{item.votes.contra}</span>
        </span>
        {item.quiz && <QuizPill correct={item.quiz.correct} total={item.quiz.total} min={item.quiz.min} />}
        {item.unread > 0 && (
          <span className="inline-flex items-center gap-1 text-red-text">
            <ChatCircleDots size={13} aria-hidden /> {item.unread}
          </span>
        )}
        {item.flags > 0 && (
          <span className="inline-flex items-center gap-1 text-[var(--tone-warn)]">
            <WarningCircle size={13} aria-hidden /> {item.flags}
          </span>
        )}
      </div>
    </div>
  );
}
