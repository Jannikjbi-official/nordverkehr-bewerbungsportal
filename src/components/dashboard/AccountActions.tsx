"use client";

import { useState, useTransition } from "react";
import { SignOut, Trash } from "@phosphor-icons/react/ssr";
import { deleteAccountAction, signOutEverywhereAction } from "@/app/actions/account";

export function DeleteAccount() {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await deleteAccountAction(confirmText);
          if (res && !res.ok) setError(res.error);
        });
      }}
    >
      <label htmlFor="del" className="nv-field-label">
        Zum Bestätigen <span className="font-mono">LÖSCHEN</span> eintippen
      </label>
      <input id="del" className="nv-input" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      <button className="nv-btn nv-btn-danger" disabled={pending || confirmText !== "LÖSCHEN"}>
        <Trash size={16} aria-hidden /> {pending ? "Wird gelöscht …" : "Endgültig löschen"}
      </button>
      {error && <p className="nv-error" role="alert">{error}</p>}
    </form>
  );
}

export function SignOutEverywhere() {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => start(() => signOutEverywhereAction())}>
      <SignOut size={15} aria-hidden /> Auf allen Geräten abmelden
    </button>
  );
}
