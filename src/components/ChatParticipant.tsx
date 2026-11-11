import { Robot, UsersThree } from "@phosphor-icons/react/ssr";
import { Avatar, cn } from "@/components/ui";
import type { MessageDirection } from "@prisma/client";

export interface ChatPerson {
  discordId: string;
  avatar: string | null;
  globalName: string | null;
  username: string;
  isAdmin?: boolean;
  isTeam?: boolean;
}

/** Profilbild im Nachrichtenverlauf: Discord-Avatar, Roboter für System/KI. */
export function ChatAvatar({ direction, person, size = 36 }: { direction: MessageDirection; person: ChatPerson | null; size?: number }) {
  if (direction === "SYSTEM" || direction === "AI_TO_APPLICANT") {
    return (
      <div className="shrink-0 rounded-full grid place-items-center bg-red-soft text-red-text" style={{ width: size, height: size }} aria-hidden>
        <Robot size={size / 2} />
      </div>
    );
  }
  if (person) return <Avatar discordId={person.discordId} avatar={person.avatar} size={size} />;
  return (
    <div className="shrink-0 rounded-full grid place-items-center bg-red-soft text-red-text" style={{ width: size, height: size }} aria-hidden>
      <UsersThree size={size / 2} />
    </div>
  );
}

/** Kennzeichnung, wer geantwortet hat: Admin, Team oder automatisch. */
export function ChatRoleBadge({ direction, person }: { direction: MessageDirection; person: ChatPerson | null }) {
  const label =
    direction === "SYSTEM" ? "Automatisch" : direction === "AI_TO_APPLICANT" ? "KI" : direction === "APPLICANT_TO_TEAM" ? "Bewerber" : person?.isAdmin ? "Admin" : "Team";
  const strong = label === "Admin" || label === "Team";
  return (
    <span
      className={cn(
        "nv-pill !text-[0.65rem] !py-0 !px-1.5 align-middle",
        strong ? (label === "Admin" ? "nv-pill-red" : "nv-tone-info") : "nv-tone-muted",
      )}
    >
      {label}
    </span>
  );
}

export const personName = (p: ChatPerson | null, fallback: string) => p?.globalName || p?.username || fallback;
