"use client";

import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountPill } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * Drawer design kit — the shared primitives every drawer section uses *
 * so People, Companies, Tasks and pop-ups feel identical and modern.  *
 * ------------------------------------------------------------------ */

export type KitTone = "accent" | "success" | "warn" | "danger" | "muted" | "info";

const DOT: Record<KitTone, string> = {
  accent: "bg-accent", success: "bg-success", warn: "bg-warn", danger: "bg-danger", muted: "bg-fg-subtle", info: "bg-info",
};
const TEXT: Record<KitTone, string> = {
  accent: "text-accent", success: "text-success", warn: "text-warn", danger: "text-danger", muted: "text-fg-subtle", info: "text-info",
};
const FILL: Record<KitTone, string> = {
  accent: "bg-accent", success: "bg-success", warn: "bg-warn", danger: "bg-danger", muted: "bg-fg-subtle", info: "bg-info",
};

/** A small circular icon action — used for header contact buttons etc. */
export function IconButton({
  icon, label, href, onClick, tone = "muted", external, className,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: KitTone;
  external?: boolean;
  /** Extra classes (merged last) — e.g. a larger touch target on mobile. */
  className?: string;
}) {
  const cls = cn(
    "inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-border bg-bg-elev/60 transition-all hover:-translate-y-0.5 hover:ring-accent/40 hover:text-accent",
    TEXT[tone],
    className
  );
  if (href) {
    return (
      <a href={href} title={label} aria-label={label} className={cls} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
        {icon}
      </a>
    );
  }
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={cls}>
      {icon}
    </button>
  );
}

/** Slim segmented progress bar (done vs remaining). */
export function ProgressTrack({ value, total, tone = "accent", className }: { value: number; total: number; tone?: KitTone; className?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", FILL[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A section's opening pulse — title, optional count, progress + status chips. */
export function SectionPulse({
  icon, title, count, progress, chips, action,
}: {
  icon?: ReactNode;
  title: string;
  count?: ReactNode;
  progress?: { value: number; total: number; tone?: KitTone };
  chips?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon && <span className="text-accent shrink-0">{icon}</span>}
        <span className="text-sm font-semibold">{title}</span>
        {count != null && <CountPill>{count}</CountPill>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {progress && <ProgressTrack value={progress.value} total={progress.total} tone={progress.tone} />}
      {chips && <div className="flex flex-wrap items-center gap-1.5">{chips}</div>}
    </div>
  );
}

/** A status chip with a leading dot. */
export function StatusChip({ tone, children }: { tone: KitTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle/80 px-2 py-0.5 text-xs font-medium text-fg-muted">
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} /> {children}
    </span>
  );
}

/**
 * A dense, modern list row: status dot · title + meta · trailing chip, with
 * hover-revealed actions so the list stays calm until you reach for it.
 */
export function DrawerRow({
  tone = "muted", title, meta, trailing, actions, onClick, className,
}: {
  tone?: KitTone;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  /** Shown on hover (desktop) / always on touch via group-focus. */
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Wrapper: "button" | "div" = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "group/row relative flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors",
        onClick && "hover:bg-bg-muted/50",
        className
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[tone])} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {meta && <span className="block truncate text-xs text-fg-subtle">{meta}</span>}
      </span>
      {actions && (
        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
          {actions}
        </span>
      )}
      {trailing && <span className="shrink-0">{trailing}</span>}
    </Wrapper>
  );
}

/** A friendly, celebratory empty/positive state — never a cold blank. */
export function EmptyState({ icon, title, hint, tone = "muted", action }: { icon: ReactNode; title: string; hint?: string; tone?: KitTone; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-bg-subtle/70", TEXT[tone])}>{icon}</span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** A solid card wrapper to keep section chrome consistent (content layer — no
 *  glass-on-glass; the drawer itself is the glass chrome). */
export function SectionCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bg-bg-elev rounded-xl ring-1 ring-border/60 overflow-hidden", className)}>{children}</div>;
}

/**
 * The ONE uniform, collapsible section card used by every drawer section so they
 * look and behave identically: a tappable header (icon · title · count · right
 * actions · chevron) over a body that's COLLAPSED BY DEFAULT. The body only
 * renders when open, so an empty section is just a slim one-line header. Pass
 * `defaultOpen` to start expanded; `right` for header actions (they don't toggle).
 */
export function CollapsibleSection({
  icon, title, count, right, defaultOpen = false, contentClassName, children,
}: {
  icon?: ReactNode;
  title: string;
  count?: number;
  right?: ReactNode;
  defaultOpen?: boolean;
  contentClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-bg-elev rounded-xl ring-1 ring-border/60 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3.5 py-2.5">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left">
          {icon && <span className="shrink-0 text-fg-muted">{icon}</span>}
          <span className="truncate text-base font-semibold">{title}</span>
          {count != null && <CountPill>{count}</CountPill>}
        </button>
        {right && <span className="flex shrink-0 items-center gap-1">{right}</span>}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"}
          className="shrink-0 text-fg-subtle hover:text-fg transition-colors">
          <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && <div className={cn("border-t border-border/60", contentClassName)}>{children}</div>}
    </div>
  );
}

/** A small caption used to head a group within a card. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{children}</div>;
}

/** A two-column definition grid (label + value, "—" when empty). */
export function DefGrid({ rows }: { rows: Array<{ label: string; value: string | null; hint?: ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="text-xs uppercase tracking-[0.08em] text-fg-subtle">{r.label}</div>
          <div className={cn("text-sm", r.value ? "text-fg" : "text-fg-subtle")}>{r.value || "—"}</div>
          {r.hint}
        </div>
      ))}
    </div>
  );
}
