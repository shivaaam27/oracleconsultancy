"use client";

import { Fragment, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import type { DocNode } from "@/lib/offline-notes-shared";

/* ------------------------------------------------------------------ *
 * A note, rendered for reading with no connection.
 *
 * ⚠️ WHY THIS EXISTS RATHER THAN JUST LOADING THE EDITOR. Tiptap is ~122 kB in a
 * lazily-loaded chunk. Offline you get that chunk only if the browser happened to
 * cache it earlier, so building the offline reader on it would mean the reader
 * works or does not depending on where you happened to click last week. This is a
 * few hundred lines of plain React that always work, and reading a note is by far
 * the commonest thing to want when there is no connection.
 *
 * It is READ-ONLY and it is not a second editor. It renders what the writing says;
 * it never writes. The one place it deliberately differs from the real page is
 * pictures: their bytes come from `/api/notes/file/<id>`, which the service worker
 * never caches, so offline they are shown as a labelled gap rather than a broken
 * image icon and a puzzled owner.
 * ------------------------------------------------------------------ */

/** Text with its marks. Links are rendered as plain text offline — following one
 *  would take you to a page that cannot load, which is a worse answer than not
 *  offering. */
function Inline({ node, k }: { node: DocNode; k: number }) {
  if (node.type === "hardBreak") return <br />;
  if (node.type === "mention") {
    const label = (node.attrs?.label as string) || (node.attrs?.id as string) || "mention";
    return (
      <span className="rounded bg-accent/10 px-1 py-px text-accent" key={k}>
        @{label}
      </span>
    );
  }
  if (typeof node.text !== "string") return null;

  let out: ReactNode = node.text;
  for (const m of node.marks ?? []) {
    if (m?.type === "bold") out = <strong>{out}</strong>;
    else if (m?.type === "italic") out = <em>{out}</em>;
    else if (m?.type === "strike") out = <s>{out}</s>;
    else if (m?.type === "code") out = <code className="rounded bg-bg-subtle px-1 py-px text-[0.9em]">{out}</code>;
    else if (m?.type === "link") out = <span className="text-accent underline underline-offset-2">{out}</span>;
  }
  return <Fragment key={k}>{out}</Fragment>;
}

function Inlines({ nodes }: { nodes: DocNode[] | null | undefined }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => (
        <Inline key={i} node={n} k={i} />
      ))}
    </>
  );
}

function Block({ node }: { node: DocNode }): ReactNode {
  const kids = node.content ?? [];

  switch (node.type) {
    case "paragraph":
      // An empty paragraph is a blank line, and a blank line is part of the
      // writing — it gets height rather than being collapsed away.
      return kids.length ? (
        <p className="my-2 leading-relaxed">
          <Inlines nodes={kids} />
        </p>
      ) : (
        <p className="h-4" />
      );

    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      const cls =
        level === 1
          ? "mt-5 mb-2 text-[1.35rem] font-semibold"
          : level === 2
            ? "mt-4 mb-1.5 text-[1.15rem] font-semibold"
            : "mt-3 mb-1 text-[1rem] font-semibold";
      return (
        <div className={cls}>
          <Inlines nodes={kids} />
        </div>
      );
    }

    case "bulletList":
      return (
        <ul className="my-2 list-disc space-y-1 pl-5">
          {kids.map((li, i) => (
            <li key={i}>
              <Blocks nodes={li.content} />
            </li>
          ))}
        </ul>
      );

    case "orderedList":
      return (
        <ol className="my-2 list-decimal space-y-1 pl-5">
          {kids.map((li, i) => (
            <li key={i}>
              <Blocks nodes={li.content} />
            </li>
          ))}
        </ol>
      );

    case "taskList":
      return (
        <ul className="my-2 space-y-1">
          {kids.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              {/* Shown, never tickable: ticking is a change, and this surface
                  does not change anything. */}
              <span
                aria-hidden
                className={`mt-[3px] inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border ${
                  item.attrs?.checked ? "border-accent bg-accent" : "border-border"
                }`}
              />
              <span className={item.attrs?.checked ? "text-fg-muted line-through" : ""}>
                <Blocks nodes={item.content} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "blockquote":
      return (
        <blockquote className="my-2 border-l-2 border-border pl-3 text-fg-muted">
          <Blocks nodes={kids} />
        </blockquote>
      );

    case "callout":
      return (
        <div className="my-2 rounded-md border border-border bg-bg-subtle px-3 py-2">
          <Blocks nodes={kids} />
        </div>
      );

    case "codeBlock":
      return (
        <pre className="my-2 overflow-x-auto rounded-md border border-border bg-bg-subtle p-3 text-sm">
          <code>{(kids ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );

    case "horizontalRule":
      return <hr className="my-4 border-border" />;

    case "table":
      return (
        <div className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {kids.map((row, r) => (
                <tr key={r}>
                  {(row.content ?? []).map((cell, c) => {
                    const Tag = cell.type === "tableHeader" ? "th" : "td";
                    return (
                      <Tag
                        key={c}
                        className={`border border-border px-2 py-1 align-top ${
                          cell.type === "tableHeader" ? "bg-bg-subtle text-left font-medium" : ""
                        }`}
                      >
                        <Blocks nodes={cell.content} />
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "image":
      return (
        <span className="my-2 inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-fg-subtle">
          <ImageOff size={14} />
          {(node.attrs?.alt as string) || "Picture"} — needs a connection
        </span>
      );

    default:
      // An unknown node still has words in it, and showing them beats showing
      // nothing. Notes outlive the code that made them.
      return kids.length ? <Blocks nodes={kids} /> : null;
  }
}

function Blocks({ nodes }: { nodes: DocNode[] | null | undefined }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => (
        <Fragment key={i}>
          <Block node={n} />
        </Fragment>
      ))}
    </>
  );
}

export function OfflineNoteBody({ doc, fallbackText }: { doc: unknown; fallbackText: string }) {
  const root = (doc ?? {}) as DocNode;
  const blocks = Array.isArray(root.content) ? root.content : [];

  // No body JSON (an old note, or one still arriving) — the plain text is still
  // the writing, so show that rather than an empty sheet.
  if (blocks.length === 0) {
    return fallbackText.trim() ? (
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{fallbackText}</div>
    ) : (
      <p className="text-sm text-fg-subtle">This note is empty.</p>
    );
  }

  return (
    <div className="text-sm">
      <Blocks nodes={blocks} />
    </div>
  );
}
