import { DiscordMarkdown } from "@/components/DiscordMarkdown";

/**
 * Vorschau einer Bot-DM, so wie sie in Discord aussieht (Components V2:
 * Container mit Akzentleiste, Kopf mit Bild rechts, Trenner, Button im
 * Container). Immer im Discord-Dark-Look, unabhängig vom Portal-Theme.
 */
export function DiscordPreview({
  title,
  body,
  publicId,
  author,
}: {
  title: string;
  body: string;
  publicId?: string | null;
  /** Persönlicher Absender; ohne Angabe "NORDVERKEHR // TEAM" */
  author?: { name: string; iconUrl: string } | null;
}) {
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
          <div className="mt-1 max-w-[520px] rounded-lg border-l-4 p-4" style={{ background: "#2b2d31", borderColor: "#c41e1e" }}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs" style={{ color: "#949ba4" }}>
                  {author ? `${author.name} · Nordverkehr-Team` : "NORDVERKEHR // TEAM"}
                </p>
                {title && <p className="mt-1 text-xl font-bold leading-tight text-white">{title}</p>}
              </div>
              {author ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={author.iconUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                // Als Team: Nordverkehr-Logo als Profilbild
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo.png" alt="" className="h-16 w-16 shrink-0 rounded-lg object-contain p-2" style={{ background: "#1e1f22" }} />
              )}
            </div>
            <hr className="my-3 border-0 h-px" style={{ background: "#3f4147" }} />
            <DiscordMarkdown text={body || " "} className="text-sm [&_strong]:text-white" />
            <p className="mt-3 text-xs" style={{ color: "#949ba4" }}>
              {publicId ? `Bewerbung ${publicId}` : "Nordverkehr Roleplay"} · Heute
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium text-white" style={{ background: "#4e5058" }}>
              Status ansehen ↗
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
