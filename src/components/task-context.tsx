import { CodeLinkedText } from "./code-linked-text";

/**
 * The two standing pieces of a task's story, in priority order:
 *  1. Description (`comments`) — the main message / context, always shown.
 *  2. Latest update (`latestUpdate`) — current status, a distinct labelled block.
 *
 * Used in the task popups (peek + drawer). Returns null when there's nothing to
 * show, so callers can pass it straight through.
 */
export function TaskContext({
  comments,
  latestUpdate,
  className,
}: {
  comments?: string | null;
  latestUpdate?: string | null;
  className?: string;
}) {
  const hasDesc = !!comments?.trim();
  const hasUpd = !!latestUpdate?.trim();
  if (!hasDesc && !hasUpd) return null;

  return (
    <div className={className ?? "space-y-2.5"}>
      {hasDesc && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          <CodeLinkedText text={comments!} />
        </p>
      )}
      {hasUpd && (
        <div className="rounded-lg bg-bg-muted/50 px-2.5 py-2">
          <div className="text-xs uppercase tracking-wider text-fg-subtle mb-0.5">Latest update</div>
          <p className="text-sm leading-relaxed">
            <CodeLinkedText text={latestUpdate!} />
          </p>
        </div>
      )}
    </div>
  );
}
