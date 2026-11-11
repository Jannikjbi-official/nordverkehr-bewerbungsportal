import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Prohibit } from "@phosphor-icons/react/ssr";
import { Avatar, formatDay } from "@/components/ui";
import { requireTeam } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Nutzer & Sperren" };

export default function UsersPage({ searchParams }: PageProps<"/team/nutzer">) {
  return (
    <div className="space-y-6">
      <header>
        <p className="nv-label">Team // Nutzer</p>
        <h1 className="nv-headline text-4xl mt-2">
          Nutzer &amp; <em>Sperren.</em>
        </h1>
      </header>
      <form className="flex gap-2 max-w-lg" role="search">
        <label htmlFor="uq" className="sr-only">
          Nutzer suchen
        </label>
        <Suspense fallback={<input className="nv-input" disabled />}>
          <SearchInput searchParams={searchParams} />
        </Suspense>
        <button className="nv-btn nv-btn-ghost">Suchen</button>
      </form>
      <Suspense fallback={<div className="nv-skeleton h-96" />}>
        <UserList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchInput({ searchParams }: Pick<PageProps<"/team/nutzer">, "searchParams">) {
  const { q } = await searchParams;
  return <input id="uq" name="q" className="nv-input" placeholder="Name, @discord oder Discord-ID" defaultValue={typeof q === "string" ? q : ""} />;
}

async function UserList({ searchParams }: Pick<PageProps<"/team/nutzer">, "searchParams">) {
  await requireTeam();
  const { q, gesperrt } = await searchParams;
  const query = typeof q === "string" ? q.trim().replace(/^@/, "").slice(0, 80) : "";
  const where: Prisma.UserWhereInput = query
    ? { OR: [{ username: { contains: query, mode: "insensitive" } }, { globalName: { contains: query, mode: "insensitive" } }, { discordId: query }] }
    : {};
  if (gesperrt === "1") where.bansAbout = { some: { liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } };

  const users = await db.user.findMany({
    where,
    include: {
      _count: { select: { applications: { where: { status: { not: "DRAFT" } } }, notesAbout: true } },
      bansAbout: { where: { liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, take: 1 },
    },
    orderBy: [{ lastLoginAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        <Link href="/team/nutzer" className={`nv-pill ${gesperrt !== "1" ? "nv-pill-red" : ""}`}>
          Alle
        </Link>
        <Link href="/team/nutzer?gesperrt=1" className={`nv-pill ${gesperrt === "1" ? "nv-pill-red" : ""}`}>
          Nur gesperrte
        </Link>
      </div>
      <div className="nv-card overflow-hidden">
        <div className="nv-scroll-x">
          <table className="nv-table w-full text-sm min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Nutzer</th>
                <th scope="col">Bewerbungen</th>
                <th scope="col">Notizen</th>
                <th scope="col">Zuletzt aktiv</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="relative">
                  <td>
                    <Link href={`/team/nutzer/${u.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                      <Avatar discordId={u.discordId} avatar={u.avatar} size={30} />
                      <span>
                        <span className="block font-medium">{u.globalName || u.username}</span>
                        <span className="block text-xs text-muted">@{u.username}</span>
                      </span>
                    </Link>
                  </td>
                  <td>{u._count.applications}</td>
                  <td>{u._count.notesAbout}</td>
                  <td className="text-muted">{formatDay(u.lastLoginAt)}</td>
                  <td>
                    {u.bansAbout.length > 0 ? (
                      <span className="nv-pill nv-tone-danger">
                        <Prohibit size={12} aria-hidden /> gesperrt
                      </span>
                    ) : u.isTeam ? (
                      <span className="nv-pill nv-pill-red">Team</span>
                    ) : (
                      <span className="text-muted">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <p className="p-6 text-sm text-muted">Keine Nutzer gefunden.</p>}
      </div>
    </div>
  );
}
