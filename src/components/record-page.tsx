"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * RecordPage — the ONE record screen (Stage 2 of the ERPNext redesign).
 *
 * ERPNext's form view, in the order the eye expects it:
 *
 *    ┌──────────────────────────────────────────────┬───────────────┐
 *    │ title · status · primary action · ⋯          │               │
 *    ├──────────────────────────────────────────────┤   sidebar     │
 *    │ collapsible sections, 2-column field grid    │   (assigned,  │
 *    │                                              │    files,     │
 *    │                                              │    tags)      │
 *    ├──────────────────────────────────────────────┴───────────────┤
 *    │ activity timeline                                            │
 *    └──────────────────────────────────────────────────────────────┘
 *
 * It is layout only — it holds no record state and knows nothing about tasks,
 * people or documents. Props are shaped like the metadata that will drive them
 * in Stage 3 (`formSections` on an EntityDef).
 *
 * It renders happily inside the drawer OR on a full page, which is the point:
 * when a record gets its own URL later, nothing here changes.
 */

export type RecordField = {
  label: string;
  value: ReactNode;
  /** Span both columns — long text, a description, a note. */
  full?: boolean;
};

export type RecordSection = {
  id: string;
  title: string;
  fields?: RecordField[];
  /** Anything that isn't a label/value pair. Rendered under the fields. */
  body?: ReactNode;
  /** Collapsible sections remember nothing — they start open unless told. */
  collapsible?: boolean;
  defaultOpen?: boolean;
};

/* -------------------------------------------------------------- fields --- */

function FieldGrid({ fields }: { fields: RecordField[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {fields.map((f, i) => (
        <div key={i} className={cn("min-w-0", f.full && "sm:col-span-2")}>
          <dt className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{f.label}</dt>
          <dd className="mt-0.5 min-w-0 text-[13px] text-fg">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ section }: { section: RecordSection }) {
  const [open, setOpen] = useState(section.defaultOpen !== false);
  const body = (
    <div className="space-y-3 px-3 py-3">
      {section.fields && section.fields.length > 0 && <FieldGrid fields={section.fields} />}
      {section.body}
    </div>
  );
  return (
    <section id={section.id} className="overflow-hidden rounded-xl border border-border bg-bg-elev">
      {section.collapsible ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 border-b border-border bg-bg-subtle px-3 py-2 text-left"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{section.title}</span>
            <ChevronDown size={13} className={cn("shrink-0 text-fg-subtle transition-transform", !open && "-rotate-90")} />
          </button>
          {open && body}
        </>
      ) : (
        <>
          <div className="border-b border-border bg-bg-subtle px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{section.title}</span>
          </div>
          {body}
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- page --- */

export function RecordPage({
  title,
  subtitle,
  code,
  status,
  primaryAction,
  actions,
  tabs,
  activeTab,
  onTabChange,
  sections,
  sidebar,
  timeline,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The record's identifier, shown as a mono chip beside the title. */
  code?: string;
  /** A badge — the record's state in one word. */
  status?: ReactNode;
  primaryAction?: ReactNode;
  /** Secondary buttons and the ⋯ menu. */
  actions?: ReactNode;
  /**
   * A tab. Give it an `href` and it renders as a LINK instead of a button.
   *
   * ⚠️ `href` is a STRING on purpose. Records whose tab lives in the URL
   * (Companies uses `?tab=`) are server components, and React refuses to pass a
   * FUNCTION from a server component to a client one — an earlier attempt at a
   * `tabHref: (id) => string` prop crashed the company page with exactly that.
   * Data crosses the boundary; callbacks do not.
   */
  tabs?: { id: string; label: string; count?: number; href?: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  sections?: RecordSection[];
  /** Right-hand column: assigned, attachments, tags. Stacks under on mobile. */
  sidebar?: ReactNode;
  /** Activity, at the bottom, full width — the last thing, always. */
  timeline?: ReactNode;
  /** Free body, rendered under the sections. Used when the active tab supplies
   *  its own content (conversation, history, an edit form). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header — who am I, what state am I in, what is the one thing to do */}
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {code && (
              <span className="tabular shrink-0 rounded-sm bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg-muted ring-1 ring-border">
                {code}
              </span>
            )}
            {status}
          </div>
          <h2 className="mt-1 text-[18px] font-semibold leading-tight text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-fg-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {primaryAction}
        </div>
      </header>

      {/* Tabs */}
      {tabs && tabs.length > 0 && (
        <div role="tablist" className="-mt-1 flex gap-1 border-b border-border">
          {tabs.map((t) => {
            const active = t.id === activeTab;
            const cls = cn(
              "-mb-px border-b-2 px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg"
            );
            const inner = (
              <>
                {t.label}
                {t.count !== undefined && <span className="tabular ml-1.5 text-[11px] text-fg-subtle">{t.count}</span>}
              </>
            );
            return t.href ? (
              <Link key={t.id} href={t.href} role="tab" aria-selected={active} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={t.id} role="tab" aria-selected={active} type="button" onClick={() => onTabChange?.(t.id)} className={cls}>
                {inner}
              </button>
            );
          })}
        </div>
      )}

      <RecordBody sections={sections} sidebar={sidebar} timeline={timeline} />
      {children}
    </div>
  );
}

/**
 * The body on its own — sections left, sidebar right, activity last.
 *
 * Split out because the task record currently lives inside the drawer, which
 * already draws its own header and tabs. The drawer uses RecordBody; a full
 * record page uses RecordPage. Same layout either way, which is the point.
 */
export function RecordBody({
  sections,
  sidebar,
  timeline,
}: {
  sections?: RecordSection[];
  sidebar?: ReactNode;
  timeline?: ReactNode;
}) {
  return (
    <>
      {(sections?.length || sidebar) && (
        <div className={cn("grid gap-3", sidebar && "lg:grid-cols-[minmax(0,1fr)_260px]")}>
          <div className="min-w-0 space-y-3">
            {sections?.map((s) => <Section key={s.id} section={s} />)}
          </div>
          {sidebar && <aside className="min-w-0 space-y-3">{sidebar}</aside>}
        </div>
      )}
      {timeline}
    </>
  );
}

/** A titled block for the right-hand column. */
export function RecordSidebarBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-bg-elev">
      <div className="border-b border-border bg-bg-subtle px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</span>
      </div>
      <div className="space-y-2 px-3 py-2.5 text-[13px]">{children}</div>
    </section>
  );
}
