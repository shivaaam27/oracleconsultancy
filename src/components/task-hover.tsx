"use client";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

type Props = {
  children: React.ReactNode;
  actionItem: string;
  latestUpdate?: string | null;
  assignees?: string[];
  status: string;
  priority: string;
  className?: string;
};

export function TaskHover({
  children,
  actionItem,
  latestUpdate,
  assignees,
  status,
  priority,
  className,
}: Props) {
  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className={cn("inline-block", className)}>{children}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            align="start"
            sideOffset={6}
            className="z-50 max-w-sm rounded-xl vibrancy-strong shadow-lg p-3 text-sm leading-snug"
          >
            <div className="font-medium mb-2">{actionItem}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted mb-2">
              <span>{status}</span>
              <span>· {priority}</span>
              {assignees && assignees.length > 0 && <span>· {assignees.join(", ")}</span>}
            </div>
            {latestUpdate && (
              <div className="text-xs text-fg-muted border-t border-border pt-2 line-clamp-4">
                {latestUpdate}
              </div>
            )}
            <Tooltip.Arrow className="fill-[var(--bg-elev)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
