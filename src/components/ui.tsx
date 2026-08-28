import { cn } from "@/lib/cn";
import Link from "next/link";
import { Loader2, ChevronDown, Search } from "lucide-react";
import { getInitials } from "@/lib/names";
import type { ComponentProps, ReactNode } from "react";

/** Search field — leading icon + design-system input. Pass-through props
 *  (name/defaultValue/value/onChange…) so it works in forms or controlled. */
/* ══════════════════════════════════════════════════ ONE CONTROL BOX ══
 *
 * ⚠️ EVERY CONTROL IN COS IS THIS BOX: a text field, `Select`, `FluidSelect`,
 * `Combobox`, `SearchInput`. One height, one radius, one type size. If you
 * change one, you have changed them all — which is the point.
 *
 * ⚠️ IT WAS MEASURED, NOT GUESSED. Before this existed, one dialog held four
 * control heights (26 · 28 · 32 · 36px) and four type sizes (11.5 · 12 · 12.5 ·
 * 16px), and the kit carried three radii (6 · 8 · 12px). Controls that sit
 * beside each other must not read as three different products.
 *
 * ⚠️ `text-sm`, NOT `text-sm`. The scale is wired to the density tokens,
 * so Compact really is denser; a hard-coded pixel size silently opts out of
 * that and is why nothing lined up. Never write `text-[Npx]` for body text —
 * use `text-xs` / `text-sm` / `text-base`.
 *
 * 6px is the Desk radius for a CONTROL (4px chips, 6px controls, 8px cards).
 * ══════════════════════════════════════════════════════════════════════ */

/** The shared box, minus the padding — which differs by what sits inside. */
export const CONTROL_BOX = "h-8 rounded-md text-sm";
/** The dense variant, for a control INSIDE a grid row. */
export const CONTROL_BOX_SM = "h-7 rounded-md text-xs";

/**
 * A SECONDARY ACTION — the small buttons inside a panel: "Add someone",
 * "Message all in chat", "Delete task", and every square icon button beside them.
 *
 * ⚠️ THEY WERE FOUR DIFFERENT SHAPES SIDE BY SIDE. On the portal task page a
 * single person's row carried a GREEN filled WhatsApp button, a BLUE filled
 * email button, a GREY filled chat button and a bare-ringed X — four treatments
 * inside 120px, with "Message all in chat" and "Add someone" as blue chips above
 * and below them. Desk has ONE blue and keeps semantic colour for meaning; a
 * soft colour fill on an ordinary action spends it on nothing and reads as a
 * different product.
 *
 * So: one resting shape — a hairline on the page's own surface — and colour only
 * on hover, where it says what the thing will do.
 */
export const ACTION_BOX =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50";
/** The square icon-only variant of `ACTION_BOX`. */
export const ACTION_ICON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg-elev text-fg-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50";
/** `ACTION_BOX`, for something that destroys. Red on hover, never at rest. */
export const ACTION_DANGER =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2.5 text-xs font-medium text-danger transition-colors hover:border-danger/50 hover:bg-danger-soft/50 disabled:opacity-50";
/**
 * A full-width text field. ⚠️ Use this rather than hand-writing the classes:
 * seven files had grown their own `const INPUT = "…"`, each subtly different,
 * which is how a form ends up with three field heights in one column.
 */
export const FIELD = "w-full h-8 rounded-md px-2.5 text-sm";
/** The same field for a figure — right-aligned and lining. */
export const FIELD_NUM = "w-full h-8 rounded-md px-2.5 text-sm text-right tabular";

export function SearchInput({
  wrapperClassName,
  className,
  ...p
}: { wrapperClassName?: string } & ComponentProps<"input">) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <input
        type="search"
        {...p}
        className={cn(
          // ⚠️ THE ONE BOX. Was `h-9 rounded-xl`, which put a 36px pill beside
          // 32px buttons and 28px fields on every list toolbar in COS.
          "w-full h-8 pl-8 pr-2.5 text-sm rounded-md border border-border bg-bg-subtle/60",
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
      <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
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

/**
 * The edge of a CONTROL that is not a Button — a dropdown trigger, a date field,
 * a picker. One definition, because there were three.
 *
 * `date-popover.tsx`, `task-copy-companies.tsx` and `portal-task-manage.tsx` each
 * declared their own `fieldShell` with `ring-1 ring-border`, while `FluidSelect`
 * drew a real `border`. A ring and a border are the same idea drawn two ways, and
 * because only the border occupies layout space the controls also ended up 2px
 * different in height — which is why a row of dropdowns never quite lined up.
 * Everything uses THIS now: a real border, 6px (the Desk control radius), h-9.
 */
/** The one control box: 32px tall, hairline border. It was 36 (h-9), which is
 *  a comfortable size on its own and a bulky one in a column of settings — the
 *  manage panel had 36px dates and companies beside 32px selects. */
export const CONTROL_SHELL =
  "h-8 rounded-md border border-border bg-bg-elev hover:border-border-strong transition-colors";

/**
 * An initials avatar — ONE definition, because there were five.
 *
 * The per-task people panel drew 32px round avatars with a 2px ring, its own add
 * picker drew 24px ones with no ring, the lead chips were something else again, and
 * the board composer a fourth. The owner's words: "the icons for accountable ...
 * all of this are inconsistent."
 *
 * Sizes are the control ladder, not new numbers: `sm` = 24px (menus, chips),
 * `md` = 28px (panel rows). `lead` carries BOTH halves of the accountable look —
 * the blue fill and the blue edge — so the two can never disagree.
 */
const avatarSizes = { sm: "h-6 w-6 text-xs", md: "h-7 w-7 text-xs" };

export function Avatar({
  name,
  size = "sm",
  lead = false,
  stacked = false,
  className,
}: {
  name: string;
  size?: keyof typeof avatarSizes;
  /** The accountable/lead tint — fill and edge together. */
  lead?: boolean;
  /** In an overlapping cluster the edge has a different job: it separates one
   *  avatar from the one behind it, so it takes the page colour instead of the
   *  tint. Use with `-space-x-1.5` on the wrapper. */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        // 4px — the chip radius. Deliberately the same corner the old
        // `rounded-full` avatars already resolved to (globals squares pills to
        // `--radius-sm`), so every avatar in the app agrees without touching the
        // org chart and the admin row stacks.
        "inline-flex shrink-0 select-none items-center justify-center rounded font-semibold leading-none",
        avatarSizes[size],
        lead ? "bg-accent-soft text-accent" : "bg-bg-subtle text-fg-muted",
        stacked ? "ring-2 ring-bg-elev" : lead ? "ring-1 ring-accent/30" : "ring-1 ring-border",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}

const buttonSizes = {
  /* Desk radii: 4px chips · 6px CONTROLS · 8px cards. `rounded-xl` is 8px, so the
     large button was wearing a card's corner — every size is 6px now, which is
     what made a row of buttons look like it came from two different kits. */
  xs: "h-7 px-2 text-xs rounded-md",
  sm: "h-8 px-2.5 text-xs rounded-md",
  md: "h-9 px-3.5 text-sm rounded-md",
  lg: "h-10 px-4 text-sm rounded-md",
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
        {hint && <span className="mt-0.5 block text-xs text-fg-muted">{hint}</span>}
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
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap leading-5",
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
        "text-xs font-semibold leading-none tabular whitespace-nowrap",
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
        <div className="text-xs uppercase tracking-[0.08em] text-fg-muted">{label}</div>
        {icon && (
          <span className={cn("h-7 w-7 rounded-xl grid place-items-center shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5", tile[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className={cn("text-[28px] leading-tight font-semibold mt-2 tabular tracking-tight", valueTint[tone])}>
        {value}
      </div>
      {hint && <div className="text-xs text-fg-subtle mt-0.5">{hint}</div>}
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
        "px-3.5 py-2.5 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted bg-bg-subtle/60 backdrop-blur-sm border-b border-border",
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
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
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
    <label className="block text-xs font-medium uppercase tracking-[0.08em] text-fg-muted mb-1.5">
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
  // ⚠️ THE ONE BOX — see CONTROL_BOX above. `md` was `h-9`, which is why a
  // dropdown stood a head taller than the field beside it.
  const box = size === "sm" ? "h-7 pl-2 pr-6 text-xs" : "h-8 pl-2.5 pr-7 text-sm";
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        data-kit-select
        {...p}
        className={cn("w-full rounded-md appearance-none cursor-pointer", box, className)}
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
      className={cn("w-full px-2.5 py-1.5 text-sm rounded-md", p.className)}
    />
  );
}

/* --------------------------------------------------------------------- */
/* Divider                                                                */
/* --------------------------------------------------------------------- */

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border", className)} />;
}

/**
 * FieldCell — a labelled box on a data-entry form.
 *
 * ⚠️ THE LABEL IS THE ONLY THING ON SCREEN. `hint` becomes the hover tooltip,
 * not a second line of grey text beside the label.
 *
 * The ops and projects forms grew a running commentary — "stays", "its own",
 * "their reference", "suggests what you have typed before" — sixty of them,
 * on every box. Read once it explains; read every day it is noise, and it made
 * a professional entry screen look like a tutorial. A hint that describes how
 * the FORM behaves (rather than what the field means) belongs in one sentence
 * under the form, said once.
 *
 * Replaced six near-identical private copies of this component.
 */
export function FieldCell({
  label, hint, className, children,
}: {
  label: string;
  /** Shown on hover only. Leave it out unless it genuinely adds something. */
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span
        title={hint ? `${label} — ${hint}` : undefined}
        className={cn(
          "mb-1 flex h-4 items-center overflow-hidden text-xs uppercase tracking-[0.04em] text-fg-subtle",
          hint && "cursor-help decoration-dotted underline-offset-2 hover:underline",
        )}
      >
        <span className="truncate">{label}</span>
      </span>
      {children}
    </label>
  );
}
