import Link from "next/link";
import { Question } from "@phosphor-icons/react/ssr";

/** Kleiner „Was heißt das?“-Link zur passenden Stelle in /team/hilfe. */
export function HelpLink({ id, label = "Was heißt das?", className = "" }: { id: string; label?: string; className?: string }) {
  return (
    <Link
      href={`/team/hilfe#${id}`}
      className={`inline-flex items-center gap-1 text-xs font-normal text-muted underline-offset-2 hover:text-fg hover:underline ${className}`}
      title="Erklärung in Hilfe & Begriffe"
    >
      <Question size={13} aria-hidden />
      {label}
    </Link>
  );
}
