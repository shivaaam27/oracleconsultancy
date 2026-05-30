import React from "react";

/**
 * Tiny, dependency-free Markdown renderer for Notes. Supports headings (#, ##,
 * ###), bullet/numbered lists, blockquotes, bold **x**, italic *x*, inline
 * `code`, and [links](url). Renders to React elements (no dangerouslySetInnerHTML),
 * so it's safe from HTML injection.
 */

function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: links, code, bold, italic.
  const re = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) nodes.push(<a key={k} href={m[3]} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{m[2]}</a>);
    else if (m[4]) nodes.push(<code key={k} className="rounded bg-bg-muted px-1 py-0.5 text-[0.85em] font-mono">{m[5]}</code>);
    else if (m[6]) nodes.push(<strong key={k} className="font-semibold">{m[7]}</strong>);
    else if (m[8]) nodes.push(<em key={k}>{m[9]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => <li key={idx}>{inline(it, `li-${key}-${idx}`)}</li>);
    blocks.push(list.ordered
      ? <ol key={key++} className="list-decimal pl-5 space-y-0.5 my-1.5">{items}</ol>
      : <ul key={key++} className="list-disc pl-5 space-y-0.5 my-1.5">{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet) { if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(bullet[1]); continue; }
    if (numbered) { if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(numbered[1]); continue; }
    flushList();
    if (!line.trim()) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl === 1 ? "text-lg font-semibold mt-3 mb-1" : lvl === 2 ? "text-base font-semibold mt-2.5 mb-1" : "text-sm font-semibold mt-2 mb-0.5";
      blocks.push(<p key={key++} className={cls}>{inline(h[2], `h-${key}`)}</p>);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { blocks.push(<blockquote key={key++} className="border-l-2 border-border pl-3 text-fg-muted my-1.5">{inline(quote[1], `q-${key}`)}</blockquote>); continue; }
    blocks.push(<p key={key++} className="my-1.5 leading-relaxed">{inline(line, `p-${key}`)}</p>);
  }
  flushList();

  return <div className={className}>{blocks}</div>;
}
