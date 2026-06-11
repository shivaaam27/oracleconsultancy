"use client";

import { Fragment } from "react";
import Link from "next/link";
import { TaskActionRow } from "./linkified-answer";

// Task codes like CO01-004 or DAR-007 (optionally bracketed).
const TASK_CODE_RE = /\[?([A-Z]{2,8}\d{0,3}-\d{2,4})\]?/g;

/**
 * Markdown-lite renderer for Oracle Intelligence answers: bold (**x**), bullet lists, and
 * inline clickable task-code chips. Used live while streaming AND for the final
 * message — so nothing reflows when the stream completes. When `withActions` is
 * on (final message only), the unique task codes also get quick action rows.
 */
export function RichAnswer({ text, withActions = false }: { text: string; withActions?: boolean }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const codes = new Set<string>();

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key} className="my-1 space-y-0.5 pl-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-accent shrink-0 leading-relaxed">•</span>
            <span className="flex-1">{renderInline(b, codes)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const heading = line.match(/^\s*#{1,3}\s+(.*)$/);
    if (bullet) { bullets.push(bullet[1]); return; }
    flushBullets(`ul-${i}`);
    if (heading) {
      blocks.push(<p key={i} className="font-semibold mt-1">{renderInline(heading[1], codes)}</p>);
    } else if (line.trim() === "") {
      blocks.push(<div key={i} className="h-1.5" />);
    } else {
      blocks.push(<p key={i} className="leading-relaxed">{renderInline(line, codes)}</p>);
    }
  });
  flushBullets("ul-end");

  const codeList = Array.from(codes).slice(0, 5);

  return (
    <div className="text-sm">
      {blocks}
      {withActions && codeList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {codeList.map((code) => (
            <TaskActionRow key={code} code={code} />
          ))}
        </div>
      )}
    </div>
  );
}

// Render one line: split on **bold**, then linkify task codes within each part.
function renderInline(text: string, codes: Set<string>): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  boldParts.forEach((part, bi) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      out.push(<strong key={`b${bi}`}>{linkifyCodes(part.slice(2, -2), codes, `b${bi}`)}</strong>);
    } else if (part) {
      out.push(<Fragment key={`t${bi}`}>{linkifyCodes(part, codes, `t${bi}`)}</Fragment>);
    }
  });
  return out;
}

function linkifyCodes(text: string, codes: Set<string>, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(TASK_CODE_RE)) {
    if (m.index === undefined) continue;
    if (m.index > last) nodes.push(<Fragment key={`${keyPrefix}-x${n}`}>{text.slice(last, m.index)}</Fragment>);
    const code = m[1];
    codes.add(code);
    nodes.push(
      <Link
        key={`${keyPrefix}-c${n}`}
        href={`/task/${code}`}
        className="inline-flex items-center font-mono text-xs bg-accent/10 text-accent hover:bg-accent/20 px-1.5 py-0.5 rounded transition-colors"
      >
        {code}
      </Link>,
    );
    last = m.index + m[0].length;
    n++;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyPrefix}-e`}>{text.slice(last)}</Fragment>);
  return nodes;
}
