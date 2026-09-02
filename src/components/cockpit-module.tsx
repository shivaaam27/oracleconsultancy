import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Panel, SectionLabel } from "@/components/surface-kit";

/** One consistent shell for every Administrator module: a glass/elevated panel
 *  with a quiet SectionLabel header (icon + title + optional trailing action) and
 *  a body. Callers manage their own inner spacing (so existing modules drop in
 *  unchanged). Use this for new cockpit modules so they all look identical. */
export function CockpitModule({
  icon,
  title,
  action,
  glass = false,
  className,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  glass?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Panel glass={glass} className={cn("p-4 sm:p-5", className)}>
      <SectionLabel icon={icon} action={action}>
        {title}
      </SectionLabel>
      {children}
    </Panel>
  );
}
