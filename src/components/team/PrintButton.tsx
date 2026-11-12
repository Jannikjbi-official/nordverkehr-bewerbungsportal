"use client";

import { Printer } from "@phosphor-icons/react/ssr";

export function PrintButton() {
  return (
    <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" onClick={() => window.print()}>
      <Printer size={14} aria-hidden /> Drucken / PDF
    </button>
  );
}
