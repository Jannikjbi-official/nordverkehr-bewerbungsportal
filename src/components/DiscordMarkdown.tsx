import { Fragment, type ReactNode } from "react";

/**
 * Sehr kleiner, sicherer Markdown-Renderer im Discord-Stil (kein HTML,
 * kein dangerouslySetInnerHTML): **fett**, *kursiv*, __unterstrichen__,
 * ~~durchgestrichen~~, `code`, Links, Listen, Überschriften (#, ##, ###),
 * Zitate (> ).
 */
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|https?:\/\/[^\s<>()]+)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith("__")) out.push(<u key={k}>{inline(tok.slice(2, -2), k)}</u>);
    else if (tok.startsWith("~~")) out.push(<s key={k}>{inline(tok.slice(2, -2), k)}</s>);
    else if (tok.startsWith("`"))
      out.push(
        <code key={k} className="rounded px-1 py-0.5 text-[0.85em] font-mono bg-black/25">
          {tok.slice(1, -1)}
        </code>,
      );
    else if (tok.startsWith("http"))
      out.push(
        <a key={k} href={tok} target="_blank" rel="noopener noreferrer nofollow" className="text-[#00a8fc] hover:underline break-all">
          {tok}
        </a>,
      );
    else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function DiscordMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (key: string) => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={key} className={`${list.ordered ? "list-decimal" : "list-disc"} pl-5 space-y-0.5 my-1`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `${key}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((line, idx) => {
    const key = `b${idx}`;
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flush(`${key}-f`);
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
      return;
    }
    flush(`${key}-f`);
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const size = h[1].length === 1 ? "text-lg" : h[1].length === 2 ? "text-base" : "text-sm";
      blocks.push(
        <p key={key} className={`${size} font-bold mt-2 mb-1`}>
          {inline(h[2], key)}
        </p>,
      );
      return;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      blocks.push(
        <p key={key} className="border-l-4 border-white/20 pl-3 my-0.5">
          {inline(q[1], key)}
        </p>,
      );
      return;
    }
    if (line.trim() === "") {
      blocks.push(<div key={key} className="h-[0.6em]" aria-hidden />);
      return;
    }
    blocks.push(
      <p key={key} className="whitespace-pre-wrap break-words">
        {inline(line, key)}
      </p>,
    );
  });
  flush("end");

  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
