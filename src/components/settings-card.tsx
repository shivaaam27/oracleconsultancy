import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Compact, consistent settings card: small icon tile + title + optional
 *  description, then the content. Replaces the old oversized p-5 blocks. */
export function SettingsCard({ id, icon, title, desc, children, className }: {
  id?: string;
  icon: ReactNode;
  title: string;
  desc?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("glass elevated rounded-2xl p-4 sm:p-[1.15rem] scroll-mt-24", className)}>
      <div className="flex items-start gap-2.5">
        <span className="mt-px inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {desc && <p className="mt-0.5 text-xs leading-snug text-fg-muted">{desc}</p>}
        </div>
      </div>
      <div className="mt-3.5 space-y-3.5">{children}</div>
    </section>
  );
}
