import type { SelectOption } from "@/components/Select";

export type PositionStatusValue = "OPEN" | "CLOSED" | "HIDDEN";

/** Positions-Status fürs Dropdown – mit Farbpunkt und kurzer Erklärung. */
export const POSITION_STATUS_OPTIONS: SelectOption<PositionStatusValue>[] = [
  { value: "OPEN", label: "Offen", hint: "Bewerbungen möglich", dot: "bg-[var(--tone-success)]" },
  { value: "CLOSED", label: "Geschlossen", hint: "Sichtbar, aber keine Bewerbungen", dot: "bg-[var(--tone-warn)]" },
  { value: "HIDDEN", label: "Versteckt", hint: "Nicht auf der Website", dot: "bg-[var(--nv-faint)]" },
];
