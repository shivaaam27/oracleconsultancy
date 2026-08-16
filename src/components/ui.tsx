import { cn } from "@/lib/cn";
import Link from "next/link";
import { Loader2, ChevronDown, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/** Search field — leading icon + design-system input. Pass-through props
 *  (name/defaultValue/value/onChange…) so it works in forms or controlled. */
export function SearchInput({
  wrapperClassName,
  className,
  ...p
}: { wrapperClassName?: string } & ComponentProps<"input">) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <input
        type="search"
        {...p}
        className={cn(
          "w-full h-9 pl-9 pr-3 text-sm rounded-xl border border-border bg-bg-subtle/60",
          "focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-fg-subtle",
          className
        )}
      />
    </div>
  );
}

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

/**
 * THE page heading. Every admin page opens with this — a title, an optional
 * figures line, and an optional action, over a hairline rule.
 *
 * ⚠️ There used to be three: this, the aurora `<Hero>` from surface-kit, and
 * twenty pages that simply began with content and no heading at all. The
 * `data-page-header` tag the design guide specifies was used by exactly one
 * file. Tagging it here means anything using PageHeader now inherits that
 * treatment, and `metrics` gives the pages that were using Hero for its figure
 * rail somewhere to put them.
 */
export function PageHeader({
  title,
  sub,
  action,
  metrics,
  children,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  /** A figures line under the title — what `<Hero>` used its children for.
   *  `children` does the same thing, so the pages converted from Hero (which
   *  passed their figure rail as children) needed no rewriting. */
  metrics?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section data-page-header className="mb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {sub && <div className="mt-0.5 text-xs text-fg-muted">{sub}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {(metrics ?? children) && <div data-page-header-meta className="mt-2.5">{metrics ?? children}</div>}
    </section>
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

// Spring-ish press compression + release; full focus ring; reduced-motion safe
// (the global prefers-reduced-motion rule neutralises the transition).
const buttonBase =
  "relative inline-flex items-center justify-center gap-1.5 font-medium select-none " +
  "transition-[transform,box-shadow,background-color,opacity] duration-150 ease-[var(--ease-out)] " +
  "active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const buttonStyles = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover btn-primary-rim",
  secondary:
    "bg-bg-elev border border-border text-fg hover:bg-bg-muted btn-rim",
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
  loading?: boolean;
} & ComponentProps<"button">;

const spinnerSize = { xs: 11, sm: 12, md: 14, lg: 14 } as const;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...p
}: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonBase, buttonSizes[size], buttonStyles[variant], className)}
      {...p}
    >
      {loading && <Loader2 size={spinnerSize[size]} className="animate-spin" />}
      {children}
    </button>
  );
}

/**
 * The same button, as a LINK.
 *
 * A link that looks like a button was being hand-rolled with a different set of
 * classes on nearly every page, which is why two "buttons" side by side could be
 * different heights. This shares Button's exact recipe, so they can't drift.
 * Use it for anything that navigates (mailto:, tel:, an href); use `Button` for
 * anything that acts.
 */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...p
}: {
  variant?: keyof typeof buttonStyles;
  size?: keyof typeof buttonSizes;
} & ComponentProps<"a">) {
  return (
    <a className={cn(buttonBase, buttonSizes[size], buttonStyles[variant], className)} {...p}>
      {children}
    </a>
  );
}

/** iPhone-style toggle switch. Presentational by default (the parent control owns
 *  the click + aria); pass `as="button"` semantics from the parent, or use it
 *  inside a labelled <button role="switch" aria-checked>. `on` = enabled (green). */
const switchDims = {
  sm: { track: "w-[40px] h-[24px]", knob: "h-[18px] w-[18px]", on: "translate-x-[19px]", off: "translate-x-[3px]" },
  md: { track: "w-[46px] h-[28px]", knob: "h-[22px] w-[22px]", on: "translate-x-[21px]", off: "translate-x-[3px]" },
} as const;

export function Switch({ on, busy = false, size = "md" }: { on: boolean; busy?: boolean; size?: keyof typeof switchDims }) {
  const d = switchDims[size];
  // data-switch keeps the track and knob genuinely round: the global "square
  // the pills" rule in globals.css exempts it (a toggle reads as a toggle only
  // when it is a capsule).
  return (
    <span
      aria-hidden
      data-switch
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full ring-1 transition-colors duration-200",
        d.track,
        on ? "bg-success ring-success/40" : "bg-bg-subtle ring-border/70",
        busy && "opacity-60",
      )}
    >
      <span className={cn("absolute rounded-full bg-white shadow-sm transition-transform duration-200", d.knob, on ? d.on : d.off)} />
    </span>
  );
}

/** A full-width tappable settings row with an iPhone Switch on the right —
 *  the canonical "toggle as a slider" control. Owns the click + aria (role
 *  switch). Use for sheet options and the profile settings list. */
export function SwitchRow({
  label, hint, on, onChange, busy = false, icon,
}: {
  label: ReactNode;
  hint?: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
  busy?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 rounded-xl bg-bg-subtle/60 px-3.5 py-3 text-left ring-1 ring-border transition-[background-color,transform] hover:bg-bg-subtle active:scale-[0.99] disabled:opacity-60"
    >
      {icon && <span className="shrink-0 text-fg-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-fg-muted">{hint}</span>}
      </span>
      <Switch on={on} busy={busy} />
    </button>
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
/* CountPill                                                              */
/* --------------------------------------------------------------------- */

// One small rounded count badge — replaces the 4 hand-rolled count-badge
// styles. Theme-token only (no hardcoded white/black). Sits next to a section
// heading or tab to show "how many". Defaults to a neutral chip.
//
// Tones:
//  - default/neutral   neutral grey chip
//  - accent            accent-tinted
//  - warn              amber-tinted (lapsing / attention)
//  - danger            red-tinted
//  - transparent/inherit  no background of its own — inherits the PARENT's
//    currentColor (use inside an already-tinted filter chip / badge so the
//    count blends in rather than clashing with a second colour).
const countPillTones = {
  default: "bg-bg-muted text-fg-muted",
  neutral: "bg-bg-muted text-fg-muted",
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  transparent: "bg-transparent text-current",
  inherit: "bg-transparent text-current",
};

export function CountPill({
  count,
  tone = "default",
  className,
  children,
}: {
  /** The number to show. Ignored if `children` is provided. */
  count?: number;
  tone?: keyof typeof countPillTones;
  className?: string;
  /** Override the content (e.g. "9+"). Falls back to `count`. */
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full",
        "text-[11px] font-semibold leading-none tabular whitespace-nowrap",
        countPillTones[tone],
        className
      )}
    >
      {children ?? count}
    </span>
  );
}

/* --------------------------------------------------------------------- */
/* Stat                                                                   */
/* --------------------------------------------------------------------- */

type StatTone = "default" | "info" | "accent" | "warn" | "danger" | "success";

export function Stat({
  label,
  value,
  tone = "default",
  icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  /** Optional small caption under the number. */
  hint?: ReactNode;
}) {
  const accent: Record<StatTone, string> = {
    default: "",
    info: "ring-1 ring-info/25 bg-gradient-to-br from-info-soft/40 to-transparent",
    accent: "ring-1 ring-accent/25 bg-gradient-to-br from-accent-soft/40 to-transparent",
    warn: "ring-1 ring-warn/25 bg-gradient-to-br from-warn-soft/50 to-transparent",
    danger: "ring-1 ring-danger/25 bg-gradient-to-br from-danger-soft/50 to-transparent",
    success: "ring-1 ring-success/25 bg-gradient-to-br from-success-soft/50 to-transparent",
  };
  // Tinted icon tile + tone-coloured number, so the metric reads at a glance.
  const tile: Record<StatTone, string> = {
    default: "bg-bg-muted text-fg-muted",
    info: "bg-info-soft text-info",
    accent: "bg-accent-soft text-accent",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  };
  const valueTint: Record<StatTone, string> = {
    default: "", info: "text-info", accent: "text-accent", warn: "text-warn", danger: "text-danger", success: "text-success",
  };
  return (
    <div
      className={cn(
        "relative bg-bg-elev border border-border rounded-2xl p-4 transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        accent[tone]
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.08em] text-fg-muted">{label}</div>
        {icon && (
          <span className={cn("h-7 w-7 rounded-xl grid place-items-center shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5", tile[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className={cn("text-[28px] leading-tight font-semibold mt-2 tabular tracking-tight", valueTint[tone])}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-fg-subtle mt-0.5">{hint}</div>}
    </div>
  );
}

/** A responsive strip of Stat cards — the canonical glanceable header for any
 *  list/dashboard page. Two columns on mobile, one row from sm up. */
export function StatStrip({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: StatTone; icon?: ReactNode; hint?: ReactNode }>;
  className?: string;
}) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[Math.min(5, Math.max(2, items.length))] ?? "sm:grid-cols-4";
  return (
    <div className={cn("grid grid-cols-2 gap-2", cols, className)}>
      {items.map((s, i) => (
        <Stat key={i} label={s.label} value={s.value} tone={s.tone} icon={s.icon} hint={s.hint} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Table                                                                  */
/* --------------------------------------------------------------------- */

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-bg-elev border border-border rounded-2xl overflow-x-auto elevated", className)}>
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
/* Register list (canonical record list)                                  */
/* --------------------------------------------------------------------- */

// The ONE look for every register / record list (Documents, People, Vendors,
// Assets, Tools, Leave …). A solid raised card whose rows are divided by a
// hairline. Purely presentational + composable: existing per-row content drops
// straight into <RegisterRow> children. Based on the cleanest existing solid
// style (the Vendors register) so registers stop diverging.
//
//   <RegisterList header={<RegisterGroupHeader>…</RegisterGroupHeader>}>
//     {rows.map((r) => (
//       <RegisterRow key={r.id} onClick={() => open(r)}>
//         …existing row content…
//       </RegisterRow>
//     ))}
//   </RegisterList>

export function RegisterList({
  children,
  header,
  className,
}: {
  children: ReactNode;
  /** Optional sticky-feel group header strip rendered above the rows
   *  (e.g. a "OVERDUE · 3" band). Use <RegisterGroupHeader> for the stock look. */
  header?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Same frame as RecordList, so a register and a record list are the
        // same object to the eye (Stage 4).
        "overflow-hidden rounded-xl border border-border bg-bg-elev",
        "divide-y divide-border",
        className
      )}
    >
      {header}
      {children}
    </div>
  );
}

// A single register row. Accepts arbitrary children (lay them out yourself —
// usually a leading icon, a `min-w-0 flex-1` body, then trailing actions).
// `onClick` makes the whole row activatable (adds pointer + keyboard support);
// omit it for a static row. `className` merges in (e.g. selected/busy states).
export function RegisterRow({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      data-list-row
      className={cn(
        // py comes from the global [data-list-row] rule (9px, 4px on Compact),
        // so every register honours the density switch like the task list.
        "flex items-center gap-3 px-3 transition-colors",
        "hover:bg-bg-subtle",
        interactive && "cursor-pointer select-none",
        className
      )}
    >
      {children}
    </div>
  );
}

/** The stock group-header strip for a <RegisterList header={…}> — a coloured
 *  dot + uppercase label + optional trailing count. Matches the canonical
 *  FieldLabel/Th tracking (0.08em). */
export function RegisterGroupHeader({
  children,
  tone = "muted",
  action,
}: {
  children: ReactNode;
  tone?: "muted" | "warn" | "danger";
  action?: ReactNode;
}) {
  const dot =
    tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-fg-subtle";
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 bg-bg-subtle/50">
      <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
        {children}
      </span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
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

/** A transparent compose input with a blinking-caret affordance: while empty it
 *  shows a blinking caret bar followed by the placeholder, inviting a click;
 *  once you type, the real caret + text take over. Use for "Add an update…",
 *  message/capture/search rows etc. — pass value/onChange/onKeyDown as usual.
 *  The native caret is hidden while empty (so there's never a double caret) and
 *  restored once there's text. Reduced-motion users get a solid (non-blinking)
 *  bar via the global media rule. */
export function CaretInput({
  placeholder = "",
  className,
  wrapperClassName,
  ...props
}: { wrapperClassName?: string } & ComponentProps<"input">) {
  // Transparent compose field; the bordered row owns the ring (see .bare-field).
  return (
    <span className={cn("relative block min-w-0 flex-1", wrapperClassName)}>
      <input
        {...props}
        placeholder=" "
        className={cn(
          "bare-field peer w-full focus:outline-none caret-accent placeholder-shown:caret-transparent",
          className,
        )}
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden items-center text-sm peer-placeholder-shown:flex">
        <span className="caret-blink mr-1 inline-block h-[1.15em] w-px rounded-full bg-accent" />
        <span className="truncate text-fg-muted">{placeholder}</span>
      </span>
    </span>
  );
}

/** Textarea twin of {@link CaretInput} — a transparent multi-line compose box
 *  that shows a blinking caret + placeholder at the top-left while empty. Put
 *  the padding/text-size in `className`; the overlay inherits the same classes
 *  so the placeholder lines up exactly with where typing will start. */
export function CaretTextarea({
  placeholder = "",
  className,
  wrapperClassName,
  ...props
}: { wrapperClassName?: string } & ComponentProps<"textarea">) {
  return (
    <span className={cn("relative block w-full min-w-0", wrapperClassName)}>
      <textarea
        {...props}
        placeholder=" "
        className={cn(
          "bare-field peer w-full focus:outline-none caret-accent placeholder-shown:caret-transparent",
          className,
        )}
      />
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 hidden flex-col peer-placeholder-shown:flex", className)}>
        <span className="flex items-center">
          <span className="caret-blink mr-1 inline-block h-[1.15em] w-px rounded-full bg-accent" />
          <span className="truncate text-fg-muted">{placeholder}</span>
        </span>
      </span>
    </span>
  );
}

/**
 * THE dropdown for a form field — pick one of a fixed list.
 *
 * There are exactly two dropdowns in this system and one rule for choosing:
 *   • `Select`      — a fixed list INSIDE A FORM. Native, so it submits with
 *                     FormData and gives the OS wheel picker on a phone.
 *   • `FluidSelect` — a fixed list in a TOOLBAR or FILTER, where nothing is being
 *                     submitted. A portalled popover with check marks and dots.
 * Anything you can type into, or that accepts a brand-new value, is `Combobox`.
 * Never write a bare `<select>`; it will not match either of them.
 *
 * `wrapperClassName` exists because this renders a positioning <div> around the
 * native element — a caller that needs `flex-1` must put it on the WRAPPER, or
 * the layout collapses. That is the trap that kept people writing raw selects.
 *
 * Draws its own chevron, so it opts out of the global raw-select styling in
 * globals.css via `data-kit-select` — otherwise you would see two arrows.
 */
export function Select({
  className,
  wrapperClassName,
  size = "md",
  ...p
}: {
  wrapperClassName?: string;
  /** `sm` for dense strips — a bulk-action bar, a table row. Use this rather
   *  than hand-writing `h-8 px-2`: ad-hoc sizing was how dropdowns drifted to
   *  three different heights, and a px override collapses the chevron gap. */
  size?: "sm" | "md";
} & Omit<ComponentProps<"select">, "size">) {
  const box = size === "sm" ? "h-8 pl-2.5 pr-7 text-xs" : "h-9 pl-3 pr-8 text-sm";
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        data-kit-select
        {...p}
        className={cn("w-full py-1.5 rounded-lg appearance-none cursor-pointer", box, className)}
      />
      <ChevronDown
        size={size === "sm" ? 13 : 14}
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-subtle",
          size === "sm" ? "right-2" : "right-2.5"
        )}
      />
    </div>
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
