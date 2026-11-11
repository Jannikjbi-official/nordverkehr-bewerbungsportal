"use client";

import { useRef, useState } from "react";
import { Select } from "@/components/Select";

/** Aktions-Filter im Audit-Log – schickt das Formular direkt bei Auswahl ab. */
export function AuditFilter({ labels, current }: { labels: Record<string, string>; current: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(current);
  return (
    <form ref={form} className="flex gap-2 max-w-md">
      <Select
        name="aktion"
        ariaLabel="Aktion"
        className="flex-1"
        options={[{ value: "", label: "Alle Aktionen" }, ...Object.entries(labels).map(([k, v]) => ({ value: k, label: v }))]}
        value={value}
        onChange={setValue}
        onAfterChange={() => form.current?.requestSubmit()}
      />
      <button className="nv-btn nv-btn-ghost">Filtern</button>
    </form>
  );
}
