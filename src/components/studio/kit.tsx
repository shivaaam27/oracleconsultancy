/**
 * The Studio kit — the building blocks of the redesign (design/studio-mockup).
 *
 * Presentational only: no data, no state, safe in server and client components.
 * Everything must sit inside <StudioScope>, which switches on the `.studio`
 * tokens in globals.css. Colours come from those tokens (`var(--st-…)`), never
 * hex values in a page, so the dark theme keeps working.
 *
 * The pattern every page follows (see Plan.dc.html in the mockup):
 *   <StudioScope>
 *     <StudioHeader title="Tasks" left={…chips} right={…buttons} />
 *     <StudioCardRow> <StudioCard tone="dark">…</StudioCard> ×2 </StudioCardRow>
 *     …the list or the record…
 *   </StudioScope>
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StudioSwipeRow } from "./swipe-row";

export type StudioTexture = "rings" | "contour" | "hatch" | "dots" | "paper-dots" | "paper-rings";

export function StudioScope({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("studio", className)}>{children}</div>;
}

export function StudioHeader({ title, left, right, sub }: { title: ReactNode; left?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    // Phone (mockup M_Rules): the title and the page's buttons share the first
    // line; the filters take the second. The inner wrapper dissolves (contents)
    // so the three can be ordered.
    <div data-page-header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2 max-sm:contents">
        <div className="min-w-0 max-sm:order-1">
          <h1 className="m-0 whitespace-nowrap text-[34px] font-medium leading-[0.95] tracking-[-0.035em] sm:text-[56px]">{title}</h1>
          {sub && <div className="mt-2 text-[13px] text-[var(--st-muted)]">{sub}</div>}
        </div>
        {/* Phone: the header's filters stay on ONE line and share it (owner, 25 Sept 2026). */}
        {left && <div className="flex min-w-0 items-center gap-1.5 pb-0.5 max-sm:order-3 max-sm:w-full max-sm:flex-nowrap sm:flex-wrap sm:gap-2">{left}</div>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2 max-sm:order-2 sm:gap-2.5">{right}</div>}
    </div>
  );
}

/** Two (or three) equal summary cards under the header. On a phone they are
 *  ONE card you swipe (swipe-row.tsx); from md they sit side by side. */
export function StudioCardRow({ children, className, cols = 2 }: { children: ReactNode; className?: string; cols?: 2 | 3 }) {
  return <StudioSwipeRow className={className} cols={cols}>{children}</StudioSwipeRow>;
}

export function StudioCard({
  tone = "dark",
  texture,
  className,
  style,
  children,
}: {
  tone?: "dark" | "light";
  texture?: StudioTexture;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={style}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[20px]",
        tone === "dark" ? "bg-[var(--st-card)] px-6 py-5 text-[var(--st-on-card)]" : "bg-[var(--st-surface)] px-[22px] py-5 text-[var(--st-ink)]",
        texture && `st-tex-${texture}`,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The small grey label across the top of a card, with an optional right side. */
export function CardHead({ label, right, tone = "dark" }: { label: ReactNode; right?: ReactNode; tone?: "dark" | "light" }) {
  return (
    <div className="flex min-h-[26px] shrink-0 items-center justify-between gap-3">
      <div className={tone === "dark" ? "text-[13px] text-[var(--st-on-card-muted)]" : "text-[15px] font-semibold"}>{label}</div>
      {right && <div className="flex items-center gap-2 text-xs text-[var(--st-muted)]">{right}</div>}
    </div>
  );
}

export function BigNumber({ value, unit, size = 76 }: { value: ReactNode; unit?: ReactNode; size?: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="leading-[0.85] tracking-[-0.045em] tabular-nums" style={{ fontSize: size }}>{value}</span>
      {unit && <span className="text-lg text-[var(--st-muted)]">{unit}</span>}
    </div>
  );
}

/** A progress ring. `value` is 0–100. */
export function Ring({
  value,
  size = 120,
  stroke = 12,
  color = "var(--st-ok)",
  track = "var(--st-card-line)",
  label,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: ReactNode;
  sub?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const on = (c * Math.max(0, Math.min(100, value))) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {on > 0 && (
          <circle
            className="st-draw"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${on} ${c}`}
            style={{ "--st-len": on } as CSSProperties}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label != null && <div className="leading-none tracking-[-0.03em] tabular-nums" style={{ fontSize: Math.round(size * 0.24) }}>{label}</div>}
        {sub != null && <div className="mt-1 text-[11px] text-[var(--st-muted)]">{sub}</div>}
      </div>
    </div>
  );
}

/** A half-circle gauge (the mockup's "VO2" card). `value` is 0–100. */
export function Arc({ value, width = 300, stroke = 22, color = "var(--st-ok)", track = "var(--st-line-soft)" }: { value: number; width?: number; stroke?: number; color?: string; track?: string }) {
  const r = (width - stroke) / 2;
  const L = Math.PI * r;
  const on = (L * Math.max(0, Math.min(100, value))) / 100;
  const y = r + stroke / 2;
  const d = `M${stroke / 2} ${y} A${r} ${r} 0 0 1 ${width - stroke / 2} ${y}`;
  const h = Math.round(y + stroke / 2);
  return (
    <svg viewBox={`0 0 ${width} ${h}`} width="100%" height={h} aria-hidden>
      <path d={d} fill="none" stroke={track} strokeWidth={stroke} strokeLinecap="round" />
      {on > 0 && <path className="st-draw" d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${on} ${L}`} style={{ "--st-len": on } as CSSProperties} />}
    </svg>
  );
}

export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

/** A small rounded label. `onCard` = on a dark card. */
export function StudioPill({ children, dot, onCard = false, className }: { children: ReactNode; dot?: string; onCard?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs", onCard ? "bg-[var(--st-card-3)] text-[var(--st-on-card)]" : "bg-[var(--st-page)] text-[var(--st-ink)]", className)}>
      {dot && <Dot color={dot} />}
      {children}
    </span>
  );
}

/** Button looks. Use as className on a <button> or <Link>. */
export const stBtn = {
  /** The black primary (“Filters”, “New rule”). */
  dark: "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[11px] bg-[var(--st-ink)] px-4 text-[13px] font-medium text-[var(--st-page)] transition-opacity hover:opacity-90",
  /** White with a hairline (“Add several”). */
  ghost: "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3.5 text-[13px] transition-colors hover:bg-[var(--st-page)]",
  /** A filter chip in the header (“All companies ▾”). */
  chip: "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] transition-colors hover:bg-[var(--st-page)]",
  /** Light button on a dark card (“Complete”). */
  onCard: "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-[var(--st-on-card)] px-3 text-xs font-semibold text-[#111214] transition-opacity hover:opacity-90",
  /** Outline button on a dark card (“Escalate”). */
  onCardGhost: "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[#34363B] px-3 text-xs text-[var(--st-on-card)] transition-colors hover:bg-[var(--st-card-2)]",
} as const;

/**
 * WHERE A FLOATING SEARCH / FILTER BAR SITS — one place, for every page.
 * 12px above the footer on a desk; clear of the footer below that. The owner
 * has had to point out a gap under a page's bar twice (People, 25 Sept 2026)
 * because each page positioned its own. Use these; never hand-write a bottom.
 *  - `sticky`: a bar in the page's flow (Tasks).
 *  - `fixedLg`: add it where the bar lives inside a panel that stops short of
 *    the footer (People): from lg the bar is placed against the window.
 */
export const stFloatBar = {
  // 64px footer + 12px — at every width below lg (the old md:5.5rem was the
  // retired pill's height, and left a 24px gap on a tablet).
  sticky: "pointer-events-none sticky bottom-[calc(var(--foot-h)+12px+var(--foot-safe))] z-30 flex justify-center lg:bottom-3",
  fixedLg: "lg:fixed lg:inset-x-10 lg:bottom-[calc(var(--foot-h)+var(--foot-safe)+12px)] lg:mt-0",
  /** A bar on a page where the WHOLE WINDOW scrolls (Notes, Assets, Supplies):
   *  12px above the footer at every width. `sticky`'s `lg:bottom-3` is for a
   *  bar inside a panel that ends at the footer (Tasks); on a window-scrolling
   *  page it put the bar 52px UNDER the footer (26 Sept 2026). */
  page: "pointer-events-none sticky bottom-[calc(var(--foot-h)+12px+var(--foot-safe))] z-30 flex justify-center",
} as const;
