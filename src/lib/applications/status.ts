import type { ApplicationStatus, TemplateCategory } from "@prisma/client";

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Entwurf",
  SUBMITTED: "Eingereicht",
  IN_REVIEW: "In Prüfung",
  INTERVIEW: "Gespräch",
  ACCEPTED: "Angenommen",
  REJECTED: "Abgelehnt",
  WITHDRAWN: "Zurückgezogen",
};

/** Kurze Erklärung für Bewerber im Dashboard. */
export const STATUS_HINT: Record<ApplicationStatus, string> = {
  DRAFT: "Noch nicht abgeschickt – du kannst jederzeit weitermachen.",
  SUBMITTED: "Ist bei uns angekommen und wartet darauf, gelesen zu werden.",
  IN_REVIEW: "Das Team liest sich deine Bewerbung gerade durch.",
  INTERVIEW: "Wir wollen dich kennenlernen – Infos zum Gespräch findest du unten.",
  ACCEPTED: "Willkommen im Team! Alles Weitere bekommst du per Nachricht.",
  REJECTED: "Diesmal hat es nicht gepasst. Die Begründung findest du in den Nachrichten.",
  WITHDRAWN: "Du hast die Bewerbung zurückgezogen.",
};

/** Tonalität der Status-Badges (CSS-Klassen in globals.css). */
export const STATUS_TONE: Record<ApplicationStatus, "muted" | "info" | "warn" | "accent" | "success" | "danger"> = {
  DRAFT: "muted",
  SUBMITTED: "info",
  IN_REVIEW: "warn",
  INTERVIEW: "accent",
  ACCEPTED: "success",
  REJECTED: "danger",
  WITHDRAWN: "muted",
};

export const OPEN_STATUSES: ApplicationStatus[] = ["DRAFT", "SUBMITTED", "IN_REVIEW", "INTERVIEW"];
export const ACTIVE_STATUSES: ApplicationStatus[] = ["SUBMITTED", "IN_REVIEW", "INTERVIEW"];

/** Wird die Bewerbung schon bearbeitet? (Status über "Eingegangen" hinaus oder geclaimt) */
export function isInProcessing(app: { status: ApplicationStatus; claimedById?: string | null }) {
  return app.status === "IN_REVIEW" || app.status === "INTERVIEW" || (app.status === "SUBMITTED" && !!app.claimedById);
}

/** Nach einem Rückzug während der Bearbeitung bleibt der Chat so lange offen (Rückfragen des Teams). */
export const FOLLOW_UP_DAYS = 14;

export function canFollowUp(app: { status: ApplicationStatus; withdrawnInReview?: boolean; decidedAt?: Date | null }, now = Date.now()) {
  return (
    app.status === "WITHDRAWN" &&
    !!app.withdrawnInReview &&
    !!app.decidedAt &&
    now - app.decidedAt.getTime() < FOLLOW_UP_DAYS * 86_400_000
  );
}
export const FINAL_STATUSES: ApplicationStatus[] = ["ACCEPTED", "REJECTED", "WITHDRAWN"];
/** Spalten im Kanban-Board (Team). */
export const BOARD_STATUSES: ApplicationStatus[] = ["SUBMITTED", "IN_REVIEW", "INTERVIEW", "ACCEPTED", "REJECTED"];
/** Fortschritt für Bewerber. */
export const TIMELINE: ApplicationStatus[] = ["SUBMITTED", "IN_REVIEW", "INTERVIEW", "ACCEPTED"];

/** Welche Statuswechsel darf das Team vornehmen? */
const TEAM_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: [],
  SUBMITTED: ["IN_REVIEW", "INTERVIEW", "ACCEPTED", "REJECTED"],
  IN_REVIEW: ["SUBMITTED", "INTERVIEW", "ACCEPTED", "REJECTED"],
  INTERVIEW: ["IN_REVIEW", "ACCEPTED", "REJECTED"],
  ACCEPTED: ["IN_REVIEW", "INTERVIEW"],
  REJECTED: ["IN_REVIEW", "INTERVIEW"],
  WITHDRAWN: [],
};

export function canTeamTransition(from: ApplicationStatus, to: ApplicationStatus) {
  return TEAM_TRANSITIONS[from].includes(to);
}

export function allowedTeamTargets(from: ApplicationStatus) {
  return TEAM_TRANSITIONS[from];
}

/** Bei Statuswechsel vorgeschlagene Baustein-Kategorien. */
export const SUGGESTED_CATEGORIES: Partial<Record<ApplicationStatus, TemplateCategory[]>> = {
  SUBMITTED: ["EINGANG"],
  IN_REVIEW: ["RUECKFRAGE", "EINGANG"],
  INTERVIEW: ["EINLADUNG"],
  ACCEPTED: ["ANNAHME"],
  REJECTED: ["ABLEHNUNG", "SONSTIGES"],
};

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  EINGANG: "Eingang",
  RUECKFRAGE: "Rückfrage",
  EINLADUNG: "Gesprächseinladung",
  ANNAHME: "Annahme",
  ABLEHNUNG: "Ablehnung",
  ERINNERUNG: "Erinnerung",
  SONSTIGES: "Sonstiges",
};

export const CATEGORY_ORDER: TemplateCategory[] = [
  "EINGANG",
  "RUECKFRAGE",
  "EINLADUNG",
  "ANNAHME",
  "ABLEHNUNG",
  "ERINNERUNG",
  "SONSTIGES",
];
