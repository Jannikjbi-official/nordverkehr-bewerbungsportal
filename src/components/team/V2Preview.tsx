import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";

type Node = {
  type: number;
  content?: string;
  divider?: boolean;
  accent_color?: number;
  label?: string;
  url?: string;
  emoji?: { name?: string };
  components?: Node[];
  accessory?: { media?: { url?: string } };
};

const hex = (n?: number) => (n === undefined ? "#c41e1e" : `#${n.toString(16).padStart(6, "0")}`);

function render(n: Node, key: string): React.ReactNode {
  switch (n.type) {
    case 10:
      return <DiscordMarkdown key={key} text={n.content ?? ""} className="text-sm [&_strong]:text-white" />;
    case 14:
      return n.divider ? <hr key={key} className="my-3 border-0 h-px" style={{ background: "#3f4147" }} /> : <div key={key} className="h-2" />;
    case 9:
      return (
        <div key={key} className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">{n.components?.map((c, i) => render(c, `${key}-${i}`))}</div>
          {n.accessory?.media?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.accessory.media.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          )}
        </div>
      );
    case 1:
      return (
        <div key={key} className="flex flex-wrap gap-2 mt-2">
          {n.components?.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: "#4e5058" }}>
              {b.emoji?.name && <span aria-hidden>{b.emoji.name}</span>}
              {b.label} ↗
            </span>
          ))}
        </div>
      );
    default:
      return null;
  }
}

/** Vorschau einer Components-V2-Nachricht im Discord-Look (immer dunkel). */
export function V2Preview({ message, author = "Nordverkehr" }: { message: RESTPostAPIChannelMessageJSONBody; author?: string }) {
  const container = (message.components as unknown as Node[] | undefined)?.[0];
  return (
    <div className="rounded-xl p-4 text-[15px] leading-[1.375rem]" style={{ background: "#313338", color: "#dbdee1" }}>
      <p className="flex items-center gap-1.5 mb-1">
        <span className="font-medium text-white">{author}</span>
        <span className="rounded px-1 text-[10px] font-semibold leading-4 text-white" style={{ background: "#5865f2" }}>
          APP
        </span>
      </p>
      {container && (
        <div className="max-w-[600px] rounded-lg border-l-4 p-4 space-y-1" style={{ background: "#2b2d31", borderColor: hex(container.accent_color) }}>
          {container.components?.map((c, i) => render(c, `n${i}`))}
        </div>
      )}
    </div>
  );
}
