"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Megaphone } from "@phosphor-icons/react/ssr";
import { publishChangelogNowAction } from "@/app/actions/admin";
import { confirmDialog } from "@/components/ConfirmDialog";

/** Admin-Übersicht: Stand des Changelogs, sofort veröffentlichen, Uhrzeit ändern. */
export function ChangelogPublishCard({ status, version, timeLabel }: { status: "none" | "pending" | "published"; version: string | null; timeLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="nv-card p-5 space-y-3" aria-labelledby="cl-title">
      <h2 id="cl-title" className="flex items-center gap-2 font-semibold">
        <Megaphone size={18} className="text-red-text" aria-hidden /> Changelog
      </h2>
      <p className="text-sm text-muted">
        {status === "none"
          ? "Für heute gibt es keinen Changelog-Eintrag."
          : status === "pending"
            ? `Version ${version} (heute) ist noch nicht veröffentlicht – geht automatisch ${timeLabel} raus (Website + Discord).`
            : `Version ${version} (heute) ist veröffentlicht.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status === "pending" && (
          <button
            type="button"
            className="nv-btn nv-btn-primary nv-btn-sm"
            disabled={pending}
            onClick={async () => {
              if (!(await confirmDialog({ title: `Version ${version} jetzt veröffentlichen?`, body: "Sie erscheint sofort im Changelog des Team-Bereichs und wird in den Changelog-Kanal gepostet – auch in der Nachtruhe. Später am Tag ergänzte Punkte erscheinen nicht automatisch nochmal in Discord.", confirmLabel: "Jetzt veröffentlichen" }))) return;
              setMsg(null);
              start(async () => {
                const r = await publishChangelogNowAction();
                setMsg(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
                router.refresh();
              });
            }}
          >
            {pending ? "Veröffentliche …" : "Jetzt veröffentlichen & senden"}
          </button>
        )}
        <Link href="/team/admin/discord#changelog" className="nv-btn nv-btn-quiet nv-btn-sm">
          Uhrzeit ändern
        </Link>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--tone-success)]" : "nv-error"}`}>{msg.text}</p>}
    </section>
  );
}
