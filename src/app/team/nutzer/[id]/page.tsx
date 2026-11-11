import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { Avatar, StatusBadge, formatDay, formatRelative } from "@/components/ui";
import { BanForm, LiftBanButton, NoteForm, DeleteNoteButton } from "@/components/team/UserControls";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Nutzer" };

export default function UserPage({ params }: PageProps<"/team/nutzer/[id]">) {
  return (
    <Suspense fallback={<div className="nv-skeleton h-[32rem]" />}>
      <UserDetail params={params} />
    </Suspense>
  );
}

async function UserDetail({ params }: Pick<PageProps<"/team/nutzer/[id]">, "params">) {
  const { user: me, access } = await requireTeam();
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const u = await db.user.findUnique({
    where: { id },
    include: {
      applications: { where: { status: { not: "DRAFT" } }, include: { position: true }, orderBy: { submittedAt: "desc" } },
      notesAbout: { include: { author: true }, orderBy: { createdAt: "desc" } },
      bansAbout: { include: { createdBy: true, liftedBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!u) notFound();
  const now = new Date();
  const activeBan = u.bansAbout.find((b) => !b.liftedAt && (!b.expiresAt || b.expiresAt > now));

  return (
    <div className="space-y-6">
      <Link href="/team/nutzer" className="nv-btn nv-btn-quiet nv-btn-sm -ml-3">
        <ArrowLeft size={14} aria-hidden /> Alle Nutzer
      </Link>
      <header className="flex items-center gap-4">
        <Avatar discordId={u.discordId} avatar={u.avatar} size={64} />
        <div>
          <p className="nv-label">Nutzer // {u.discordId}</p>
          <h1 className="nv-headline text-4xl mt-1">{u.globalName || u.username}</h1>
          <p className="text-sm text-muted">
            @{u.username} · Account seit {formatDay(u.discordCreatedAt)} · {u.inGuild ? `auf dem Server seit ${formatDay(u.guildJoinedAt)}` : "nicht auf dem Server"}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="nv-card p-5 space-y-4">
          <h2 className="font-semibold">Bewerbungen</h2>
          {u.applications.length === 0 && <p className="text-sm text-muted">Keine eingereichten Bewerbungen.</p>}
          <ul className="space-y-2">
            {u.applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/team/bewerbungen/${a.id}`} className="nv-link">
                  {a.position.title} · {a.publicId}
                </Link>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </section>

        <section className="nv-card p-5 space-y-4">
          <h2 className="font-semibold">Sperre</h2>
          {activeBan ? (
            <div className="rounded-xl border nv-tone-danger p-4 text-sm space-y-1">
              <p className="font-semibold">{activeBan.expiresAt ? `Gesperrt bis ${formatDay(activeBan.expiresAt)}` : "Unbefristet gesperrt"}</p>
              <p className="text-fg-2">{activeBan.reason}</p>
              <p className="text-xs text-muted">
                von {activeBan.createdBy?.globalName ?? activeBan.createdBy?.username ?? "?"} · {formatRelative(activeBan.createdAt)}
              </p>
              <div className="pt-2">
                <LiftBanButton banId={activeBan.id} />
              </div>
            </div>
          ) : u.id === me.id ? (
            <p className="text-sm text-muted">Du kannst dich nicht selbst sperren.</p>
          ) : (
            <BanForm subjectId={u.id} />
          )}
          {u.bansAbout.filter((b) => b !== activeBan).length > 0 && (
            <details>
              <summary className="text-xs text-muted cursor-pointer">Frühere Sperren</summary>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {u.bansAbout
                  .filter((b) => b !== activeBan)
                  .map((b) => (
                    <li key={b.id}>
                      {formatDay(b.createdAt)}: {b.reason} {b.liftedAt ? `(aufgehoben ${formatDay(b.liftedAt)})` : "(abgelaufen)"}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <section className="nv-card p-5 space-y-4">
        <h2 className="font-semibold">Interne Notizen</h2>
        <NoteForm subjectId={u.id} />
        <ul className="space-y-3">
          {u.notesAbout.map((n) => (
            <li key={n.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">
                  {n.author?.globalName ?? n.author?.username ?? "Gelöscht"} · {formatRelative(n.createdAt)}
                </p>
                {(n.authorId === me.id || access.isAdmin) && <DeleteNoteButton noteId={n.id} />}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-fg-2">{n.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
