import { DiscordMarkdown } from "@/components/DiscordMarkdown";

/**
 * Vorschau einer Bot-DM, so wie sie in Discord aussieht (immer im
 * Discord-Dark-Look, unabhängig vom Portal-Theme).
 */
export function DiscordPreview({ title, body, publicId }: { title: string; body: string; publicId?: string | null }) {
  return (
    <div className="rounded-xl p-4 text-[15px] leading-[1.375rem]" style={{ background: "#313338", color: "#dbdee1" }}>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-10 w-10 rounded-full object-contain p-1.5" style={{ background: "#1e1f22" }} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="font-medium text-white">Nordverkehr</span>
            <span className="rounded px-1 text-[10px] font-semibold leading-4 text-white" style={{ background: "#5865f2" }}>
              APP
            </span>
            <span className="text-xs" style={{ color: "#949ba4" }}>
              Heute
            </span>
          </p>
          <div className="mt-1 max-w-[520px] rounded-[4px] border-l-4 py-2 pl-3 pr-4" style={{ background: "#2b2d31", borderColor: "#c41e1e" }}>
            <p className="flex items-center gap-2 text-xs font-semibold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-5 w-5 rounded-full object-contain" />
              NORDVERKEHR // TEAM
            </p>
            {title && <p className="mt-2 font-semibold text-white">{title}</p>}
            <DiscordMarkdown text={body || " "} className="mt-1 text-sm [&_strong]:text-white" />
            <p className="mt-3 text-xs" style={{ color: "#949ba4" }}>
              {publicId ? `Bewerbung ${publicId}` : "Nordverkehr Roleplay"} • Heute
            </p>
          </div>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-[3px] px-4 py-1.5 text-sm font-medium text-white" style={{ background: "#4e5058" }}>
            Status ansehen ↗
          </span>
        </div>
      </div>
    </div>
  );
}
