"use client";

/**
 * Small shared pieces for the Studio Assets, Tools & Vendors screens: the row
 * "⋯" menu, the pill, the field shells used inside their sheets, and the
 * number/date formats. Nothing here fetches or writes.
 */
import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import type { AssetStatus } from "@/lib/assets-shared";
import type { ToolCondition } from "@/lib/site-tools-shared";
import { cn } from "@/lib/cn";

export const FIELD = "st-field h-10 w-full rounded-[10px] px-3 text-[13px] outline-none";
export const AREA = "st-field w-full rounded-[10px] px-3 py-2.5 text-[13px] outline-none";
const LABEL = "mb-1.5 block text-xs text-[var(--sh-muted,var(--st-muted))]";

export const STATUS_DOT: Record<AssetStatus, string> = {
  in_store: "#19C37D",
  assigned: "#2490EF",
  maintenance: "#F5A524",
  retired: "#8E9197",
};
export const STATUS_WORD: Record<AssetStatus, string> = {
  in_store: "In store",
  assigned: "Handed out",
  maintenance: "In the workshop",
  retired: "Retired",
};
export const CONDITION_DOT: Record<ToolCondition, string> = { good: "#19C37D", needs_repair: "#F5A524", retired: "#8E9197" };

export function Pill({ dot, children, className }: { dot?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-[var(--st-page)] px-2.5 text-xs", className)}>
      {dot && <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** A two-or-more way switch inside a sheet (Person | Team). */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-[11px] bg-[var(--sh-hover,var(--st-seg))] p-[3px]" role="tablist">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cn("h-[30px] flex-1 rounded-lg px-3 text-xs transition-colors", value === k ? "bg-[var(--sh-bg,var(--st-surface))] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--sh-sub,var(--st-sub))] hover:text-[var(--sh-fg,var(--st-ink))]")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function RowMenu({ children, label = "More", dark = false }: { children: ReactNode; label?: string; dark?: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={label} onClick={(e) => e.stopPropagation()}
          className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors", dark ? "border border-[#2E3035] text-[#E6E6E3] hover:bg-[#1F2023]" : "text-[var(--st-muted)] hover:bg-[var(--st-page)] hover:text-[var(--st-ink)]")}>
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="studio z-[140] w-60 rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] p-1.5 text-[13px] text-[var(--st-ink)] shadow-[0_16px_40px_rgba(17,18,20,0.16)]">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ onSelect, icon, children, tone }: { onSelect: () => void; icon: ReactNode; children: ReactNode; tone?: "bad" }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-[var(--st-page)]", tone === "bad" && "text-[var(--st-late-text)]")}>
      {icon}<span className="flex-1">{children}</span>
    </DropdownMenu.Item>
  );
}
export function MenuLine() {
  return <div className="my-1 h-px bg-[var(--st-line)]" />;
}

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
/** TZS 1,250,000 — or "1.3M" when `short`. */
export function tzs(n: number, short = false): string {
  if (short && Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (short && Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  return nf.format(n);
}
export function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }) : "—";
}
/** "3 days", "5 months", "2 years" since an ISO date. */
export function since(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const d = Math.max(0, Math.round((now - new Date(iso).getTime()) / 86_400_000));
  if (d < 1) return "today";
  if (d < 45) return `${d} day${d === 1 ? "" : "s"}`;
  const m = Math.round(d / 30.4);
  if (m < 24) return `${m} month${m === 1 ? "" : "s"}`;
  return `${Math.round(d / 365)} years`;
}
/** YYYY-MM-DD for a date field's default. */
export function ymd(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }) : "";
}
export const shortName = (n: string) => n.replace(/^(Mr|Mrs|Ms|Miss|Dr|Chef)\.?\s+/i, "");
