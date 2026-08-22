"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { CellFormat, ListColumnDef, FormSectionDef } from "@/lib/entity-view";
import type { RecordColumn } from "@/components/record-list";
import type { RecordSection, RecordField } from "@/components/record-page";

/**
 * The client half of Stage 3: metadata in, shell props out.
 *
 * `entity-view.ts` says a column is `{ key: "deadline", format: "date" }` —
 * declarative, no functions, so it can cross the server/client boundary (and
 * live in a database later). This file holds the ONE renderer per format name,
 * and builds the `RecordColumn[]` / `RecordSection[]` the shells expect.
 *
 * Anything genuinely interactive (an inline status editor, a deadline picker)
 * cannot be described by metadata, so a screen passes an `overrides` map for
 * those keys. That is the escape hatch, and it should stay small: if you find
 * yourself overriding every column, the format vocabulary is missing something —
 * add the format here rather than overriding.
 */

/* ------------------------------------------------------------ formatters --- */

function shortDate(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const Empty = () => <span className="text-fg-subtle">—</span>;

export const CELL_FORMATTERS: Record<CellFormat, (value: unknown, row: Record<string, unknown>) => ReactNode> = {
  text: (v) => (v == null || v === "" ? <Empty /> : <span className="truncate">{String(v)}</span>),

  muted: (v) => (v == null || v === "" ? <Empty /> : <span className="truncate text-fg-muted">{String(v)}</span>),

  number: (v) => <span className="tabular">{v == null ? "—" : String(v)}</span>,

  code: (v) =>
    v == null ? <Empty /> : (
      <span className="tabular inline-flex items-center rounded-sm bg-bg-subtle px-1.5 py-0.5 font-mono text-xs font-medium text-fg-muted ring-1 ring-border">
        {String(v)}
      </span>
    ),

  date: (v) => {
    const s = shortDate(v);
    return s ? <span className="tabular text-fg-muted">{s}</span> : <Empty />;
  },

  status: (v) =>
    v == null ? <Empty /> : (
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot(String(v)))} />
        <span className="truncate">{String(v)}</span>
      </span>
    ),

  priority: (v) =>
    v == null ? <Empty /> : (
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot(String(v)))} />
        <span className="truncate">{String(v)}</span>
      </span>
    ),

  people: (v) => {
    const names = Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : [];
    if (!names.length) return <span className="text-xs italic text-fg-subtle">—</span>;
    return <span className="truncate">{names.join(", ")}</span>;
  },

  company: (v, row) => {
    if (v == null || v === "") return <Empty />;
    const accent = typeof row.companyAccent === "string" ? row.companyAccent : null;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {accent && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />}
        <span className="truncate">{String(v)}</span>
      </span>
    );
  },
};

function statusDot(s: string): string {
  if (s === "Completed" || s === "Closed") return "bg-success";
  if (s === "Blocked" || s === "Escalated") return "bg-danger";
  if (s === "Waiting External" || s === "Under Review") return "bg-warn";
  if (s === "In Progress") return "bg-accent";
  return "bg-fg-subtle";
}

function priorityDot(p: string): string {
  if (p === "Critical") return "bg-danger";
  if (p === "High") return "bg-warn";
  if (p === "Medium") return "bg-accent";
  return "bg-fg-subtle";
}

/* --------------------------------------------------------------- builders --- */

/**
 * Metadata → `RecordList` columns.
 *
 * `sortHrefs` / `sortedBy` come from the page (only it knows the current URL);
 * `overrides` supply interactive cells by column key.
 */
export function buildColumns<T extends Record<string, unknown>>(
  defs: ListColumnDef[],
  opts?: {
    sortHrefs?: Record<string, string>;
    sortedBy?: { key: string; dir: "asc" | "desc" };
    overrides?: Record<string, (row: T) => ReactNode>;
  }
): RecordColumn<T>[] {
  return defs.map((d) => {
    const override = opts?.overrides?.[d.key];
    const format = CELL_FORMATTERS[d.format ?? "text"];
    return {
      key: d.key,
      label: d.label,
      width: d.width,
      align: d.align,
      hideBelow: d.hideBelow,
      defaultHidden: d.defaultHidden,
      sortHref: d.sortable ? opts?.sortHrefs?.[d.key] : undefined,
      sorted: opts?.sortedBy?.key === d.key ? opts.sortedBy.dir : undefined,
      render: override ?? ((row: T) => format(row[d.key], row)),
    };
  });
}

/**
 * Metadata → `RecordPage` / `RecordBody` sections.
 *
 * A field with no value is dropped rather than shown empty, unless `overrides`
 * supplies something for it (a "Set category" prompt, say).
 */
export function buildSections<T extends Record<string, unknown>>(
  defs: FormSectionDef[],
  row: T,
  overrides?: Record<string, (row: T) => ReactNode>
): RecordSection[] {
  return defs.map((s) => {
    const fields: RecordField[] = [];
    for (const f of s.fields) {
      const override = overrides?.[f.key];
      const value = row[f.key];
      if (!override && (value == null || value === "")) continue;
      fields.push({
        label: f.label,
        full: f.full,
        value: override ? override(row) : CELL_FORMATTERS[f.format ?? "text"](value, row),
      });
    }
    return { id: s.id, title: s.title, fields, collapsible: s.collapsible, defaultOpen: s.defaultOpen };
  });
}
