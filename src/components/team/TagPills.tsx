import { Robot } from "@phosphor-icons/react/ssr";
import { tagLabel } from "@/lib/ai/tags";

/** KI-Kategorien als kleine Pills (Manipulationsversuch rot hervorgehoben). */
export function TagPills({ tags, size = "sm" }: { tags: string[]; size?: "sm" | "md" }) {
  if (!tags.length) return null;
  const cls = size === "sm" ? "!text-[0.65rem] !py-0 !px-1.5" : "!text-xs !py-0.5";
  return (
    <span className="inline-flex flex-wrap gap-1" aria-label="KI-Einordnung">
      {tags.map((t) => (
        <span key={t} className={`nv-pill ${cls} ${t === "manipulation" ? "nv-tone-danger" : ""}`} title="KI-Einordnung (kein Ranking)">
          {size === "md" && t !== "manipulation" && <Robot size={11} aria-hidden />}
          {tagLabel(t)}
        </span>
      ))}
    </span>
  );
}
