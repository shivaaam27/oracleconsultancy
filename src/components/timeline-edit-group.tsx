import { GitCommitHorizontal, Pencil, ChevronDown } from "lucide-react";
import Link from "next/link";
import { CodeLinkedText } from "./code-linked-text";
import { cleanReason, formatAuditValue, summariseEditGroup, type TimelineEditGroup } from "@/lib/timeline";

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Collapsed "edit session" entry — a burst of field changes shown as one
 * expandable row. Used on per-task, company, and (compact) drawer timelines.
 */
export function TimelineEditGroupView({
  group,
  showTaskCode = false,
  compact = false,
}: {
  group: TimelineEditGroup;
  /** Show the task code on each row (company-wide timeline). */
  showTaskCode?: boolean;
  /** Tighter layout for the drawer. */
  compact?: boolean;
}) {
  const { label } = summariseEditGroup(group);
  const size = compact ? "text-xs" : "text-xs";

  return (
    <details className={`group/edit rounded-lg bg-bg-subtle px-3 py-2 ${size}`}>
      <summary className="cursor-pointer list-none flex items-center gap-1.5 text-fg-muted hover:text-fg">
        <ChevronDown size={11} className="transition-transform group-open/edit:rotate-180 shrink-0" />
        <Pencil size={11} className="shrink-0" />
        <span className="font-medium text-fg">{label}</span>
        <span className="text-fg-subtle ml-auto whitespace-nowrap">{fmtTime(group.createdAt)}</span>
      </summary>
      <ul className="mt-2 space-y-1.5 pl-1">
        {group.items.map((a) => {
          const reason = cleanReason(a.changeReason);
          return (
            <li key={a.id} className="space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {showTaskCode && a.taskCode && (
                  <Link href={`/task/${a.taskCode}`} className="font-mono text-xs text-fg-subtle hover:text-accent">
                    {a.taskCode}
                  </Link>
                )}
                <span className="font-medium text-fg">{a.field}</span>
                {a.oldValue && <span className="text-fg-muted">{formatAuditValue(a.field, a.oldValue)}</span>}
                {a.oldValue && a.newValue && <GitCommitHorizontal size={9} className="text-fg-subtle" />}
                {a.newValue && <span className="text-fg font-medium">{formatAuditValue(a.field, a.newValue)}</span>}
              </div>
              {reason && (
                <p className="italic text-fg-muted pl-1">
                  <CodeLinkedText text={reason} />
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
