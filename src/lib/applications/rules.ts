/**
 * Wer darf sich wann bewerben? Rein und testbar.
 */
import type { ApplicationStatus, PositionStatus } from "@prisma/client";
import { OPEN_STATUSES } from "@/lib/applications/status";

export interface EligibilityInput {
  now: Date;
  position: { id: string; status: PositionStatus; cooldownDays: number | null; minAge: number | null };
  settings: { cooldownDays: number; minAge: number };
  /** Alle bisherigen Bewerbungen dieses Nutzers auf diese Position */
  previous: { id: string; status: ApplicationStatus; decidedAt: Date | null }[];
  activeBan: { reason: string; expiresAt: Date | null } | null;
}

export type EligibilityResult =
  | { ok: true; draftId: string | null }
  | {
      ok: false;
      code: "closed" | "banned" | "open_exists" | "cooldown";
      message: string;
      until?: Date | null;
      applicationId?: string;
    };

const DAY = 24 * 60 * 60 * 1000;

export function effectiveCooldownDays(position: EligibilityInput["position"], settings: EligibilityInput["settings"]) {
  return position.cooldownDays ?? settings.cooldownDays;
}

export function effectiveMinAge(position: { minAge: number | null }, settings: { minAge: number }) {
  return position.minAge ?? settings.minAge;
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { now, position, previous, activeBan } = input;

  if (activeBan && (!activeBan.expiresAt || activeBan.expiresAt > now)) {
    return {
      ok: false,
      code: "banned",
      message: activeBan.expiresAt
        ? "Du bist für Bewerbungen aktuell gesperrt."
        : "Du bist für Bewerbungen gesperrt.",
      until: activeBan.expiresAt,
    };
  }

  const draft = previous.find((a) => a.status === "DRAFT");
  const open = previous.find((a) => OPEN_STATUSES.includes(a.status) && a.status !== "DRAFT");
  if (open) {
    return {
      ok: false,
      code: "open_exists",
      message: "Du hast für diese Position schon eine offene Bewerbung.",
      applicationId: open.id,
    };
  }

  const cooldownDays = effectiveCooldownDays(position, input.settings);
  const lastRejection = previous
    .filter((a) => a.status === "REJECTED" && a.decidedAt)
    .sort((a, b) => b.decidedAt!.getTime() - a.decidedAt!.getTime())[0];
  if (lastRejection && cooldownDays > 0) {
    const until = new Date(lastRejection.decidedAt!.getTime() + cooldownDays * DAY);
    if (until > now) {
      return { ok: false, code: "cooldown", message: "Nach einer Absage gilt eine Sperrfrist.", until };
    }
  }

  // Geschlossene Positionen: nur bestehende Entwürfe bleiben sichtbar, Absenden nicht möglich
  if (position.status !== "OPEN") {
    return { ok: false, code: "closed", message: "Für diese Position nehmen wir gerade keine Bewerbungen an." };
  }

  return { ok: true, draftId: draft?.id ?? null };
}

export function cooldownUntil(decidedAt: Date | null, days: number): Date | null {
  if (!decidedAt || days <= 0) return null;
  return new Date(decidedAt.getTime() + days * DAY);
}
