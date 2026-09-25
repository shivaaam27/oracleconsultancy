"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The record body — ERPNext's form view below the header and tabs:
 *
 *    ┌──────────────────────────────────────────────┬───────────────┐
 *    │ collapsible sections, 2-column field grid    │   sidebar     │
 *    │                                              │   (assigned,  │
 *    │                                              │    files,     │
 *    │                                              │    tags)      │
 *    ├──────────────────────────────────────────────┴───────────────┤
 *    │ activity timeline                                            │
 *    └──────────────────────────────────────────────────────────────┘
 *
 * It is layout only — it holds no record state and knows nothing about tasks,
 * people or documents. Props are shaped like the metadata that drives them
 * (`formSections` on an EntityDef).
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
          <dt className="text-xs uppercase tracking-[0.04em] text-fg-subtle">{f.label}</dt>
          <dd className="mt-0.5 min-w-0 text-base text-fg">{f.value}</dd>
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
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{section.title}</span>
            <ChevronDown size={13} className={cn("shrink-0 text-fg-subtle transition-transform", !open && "-rotate-90")} />
          </button>
          {open && body}
        </>
      ) : (
        <>
          <div className="border-b border-border bg-bg-subtle px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{section.title}</span>
          </div>
          {body}
        </>
      )}
    </section>
  );
}

/**
 * The body — sections left, sidebar right, activity last. The task drawer
 * draws its own header and tabs around it.
 */
export function RecordBody({
  sections,
  sidebar,
  timeline,
  main,
}: {
  sections?: RecordSection[];
  sidebar?: ReactNode;
  timeline?: ReactNode;
  /**
   * Content for the LEFT COLUMN, beside the sidebar, under the sections — a
   * form, a tab's own panel. Anything meant to run full width under the whole
   * body belongs after RecordBody, not here.
   */
  main?: ReactNode;
}) {
  return (
    <>
      {(sections?.length || sidebar || main) && (
        <div className={cn("grid gap-3", sidebar && "lg:grid-cols-[minmax(0,1fr)_260px]")}>
          <div className="min-w-0 space-y-3">
            {sections?.map((s) => <Section key={s.id} section={s} />)}
            {main}
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
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</span>
      </div>
      <div className="space-y-2 px-3 py-2.5 text-base">{children}</div>
    </section>
  );
}
