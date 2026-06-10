import { splitCodeRefs } from "@/lib/timeline";
import { TaskDrawerLink } from "./task-drawer-link";

/**
 * Renders body text with any task-code references turned into in-app links.
 * Server component; the code refs render a client `TaskDrawerLink` (only
 * serializable props), so each mention gets a hover preview and opens the task
 * drawer in place — consistent with task links elsewhere.
 */
export function CodeLinkedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segs = splitCodeRefs(text);
  return (
    <span className={className}>
      {segs.map((s, i) =>
        s.isCode ? (
          <TaskDrawerLink
            key={i}
            code={s.text}
            className="font-mono text-[0.92em] text-accent align-baseline hover:underline"
          >
            {s.text}
          </TaskDrawerLink>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </span>
  );
}
