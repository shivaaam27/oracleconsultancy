import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* --------------------------------------------------------------------- */
/* Surface primitives                                                     */
/* --------------------------------------------------------------------- */

export function Card({ className, ...p }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-bg-elev border border-border rounded-2xl elevated transition-shadow",
        className
      )}
      {...p}
    />
  );
}

/** Solid raised surface — for cards, panels, sheets. */
export function Surface({
  className,
  elevation = "md",
  ...p
}: { elevation?: "sm" | "md" | "lg" } & ComponentProps<"div">) {
  const shadow =
    elevation === "lg" ? "shadow-lg" : elevation === "sm" ? "shadow-sm" : "shadow-md";
  return (
    <div
      className={cn("bg-bg-elev border border-border rounded-2xl", shadow, className)}
      {...p}
    />
  );
}

/** Translucent macOS-style material — for floating bars, popovers, overlays. */
export function Vibrancy({
  className,
  strong = false,
  ...p
}: { strong?: boolean } & ComponentProps<"div">) {
  return (
    <div
      className={cn(strong ? "vibrancy-strong" : "vibrancy", "rounded-2xl shadow-pill", className)}
      {...p}
    />
  );
}

/* --------------------------------------------------------------------- */
/* Headings                                                               */
/* --------------------------------------------------------------------- */

export function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-4 gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {sub && <div className="text-xs text-fg-muted mt-0.5">{sub}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
        {children}
      </h2>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Button                                                                 */
/* --------------------------------------------------------------------- */

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none";

const buttonStyles = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm hover:shadow",
  secondary:
    "bg-bg-elev border border-border text-fg hover:bg-bg-muted shadow-sm",
  ghost: "text-fg-muted hover:text-fg hover:bg-bg-muted",
  danger:
    "bg-danger text-white hover:opacity-90 shadow-sm",
  "danger-soft":
    "bg-danger-soft text-danger hover:bg-danger hover:text-white border border-transparent hover:border-danger",
};

const buttonSizes = {
  xs: "h-7 px-2 text-[11px] rounded-md",
  sm: "h-8 px-2.5 text-xs rounded-lg",
  md: "h-9 px-3.5 text-sm rounded-lg",
  lg: "h-10 px-4 text-sm rounded-xl",
};

type BtnProps = {
  variant?: keyof typeof buttonStyles;
  size?: keyof typeof buttonSizes;
} & ComponentProps<"button">;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: BtnProps) {
  return (
    <button
      className={cn(buttonBase, buttonSizes[size], buttonStyles[variant], className)}
      {...p}
    />
  );
}

type LinkBtnProps = {
  variant?: keyof typeof buttonStyles;
  size?: keyof typeof buttonSizes;
} & ComponentProps<typeof Link>;

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...p
}: LinkBtnProps) {
  return (
    <Link
      className={cn(buttonBase, buttonSizes[size], buttonStyles[variant], className)}
      {...p}
    />
  );
}

/** Icon-only button, square. */
export function IconButton({
  size = "md",
  variant = "ghost",
  className,
  ...p
}: BtnProps) {
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-10 w-10" : "h-9 w-9";
  return (
    <button
      className={cn(
        buttonBase,
        dim,
        "rounded-lg",
        buttonStyles[variant],
        className
      )}
      {...p}
    />
  );
}

/* --------------------------------------------------------------------- */
/* Badge                                                                  */
/* --------------------------------------------------------------------- */

const badgeTones = {
  default: "bg-bg-muted text-fg-muted",
  accent: "bg-accent-soft text-fg",
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({
  tone = "default",
  className,
  children,
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap leading-5",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------------- */
/* Stat                                                                   */
/* --------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "warn" | "danger" | "success";
  icon?: ReactNode;
}) {
  const accent = {
    default: "",
    warn: "ring-1 ring-warn/25 bg-gradient-to-br from-warn-soft/50 to-transparent",
    danger: "ring-1 ring-danger/25 bg-gradient-to-br from-danger-soft/50 to-transparent",
    success: "ring-1 ring-success/25 bg-gradient-to-br from-success-soft/50 to-transparent",
  }[tone];
  return (
    <div
      className={cn(
        "relative bg-bg-elev border border-border rounded-2xl p-5 transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        accent
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.08em] text-fg-muted">{label}</div>
        {icon && <div className="text-fg-subtle">{icon}</div>}
      </div>
      <div className="text-[28px] leading-tight font-semibold mt-2 tabular tracking-tight">
        {value}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Table                                                                  */
/* --------------------------------------------------------------------- */

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-elev border border-border rounded-2xl overflow-x-auto elevated">
      {children}
    </div>
  );
}

export function Th({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted bg-bg-subtle/60 backdrop-blur-sm border-b border-border",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-3.5 py-2.5 text-sm border-t border-border/70",
        align === "right" ? "text-right tabular" : align === "center" ? "text-center" : "",
        className
      )}
    >
      {children}
    </td>
  );
}

/* --------------------------------------------------------------------- */
/* Empty state, form bits                                                 */
/* --------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      {icon && (
        <div className="text-fg-subtle mb-3 w-12 h-12 rounded-2xl bg-bg-muted/60 flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs text-fg-muted mt-1 max-w-sm">{hint}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-1.5">
      {children}
    </label>
  );
}

export function Input(p: ComponentProps<"input">) {
  return (
    <input
      {...p}
      className={cn("w-full px-3 py-1.5 text-sm h-9 rounded-lg", p.className)}
    />
  );
}

export function Select(p: ComponentProps<"select">) {
  return (
    <select
      {...p}
      className={cn("w-full px-3 py-1.5 text-sm h-9 rounded-lg", p.className)}
    />
  );
}

export function Textarea(p: ComponentProps<"textarea">) {
  return (
    <textarea
      {...p}
      className={cn("w-full px-3 py-2 text-sm rounded-lg", p.className)}
    />
  );
}

/* --------------------------------------------------------------------- */
/* Divider                                                                */
/* --------------------------------------------------------------------- */

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border", className)} />;
}
