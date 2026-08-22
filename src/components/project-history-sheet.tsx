"use client";

// HISTORY — who changed which figure, and what it was before.
//
// The workbook cannot answer this at all: a cell is retyped and the old number
// is gone. This screen is deliberately plain and read-only — there is nothing to
// press, because a trail you can edit is not a trail.
//
// Filtering is by URL (`?sheet=requisition`), the Desk rule: a filter held in
// component state cannot be bookmarked, shared or saved as a view.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  type AuditRow, ENTITY_LABELS, AUDIT_ENTITIES,
  fieldLabel, displayValue, actorLabel, describeAudit, summarise,
} from "@/lib/project-audit-shared";
import { cn } from "@/lib/cn";

/** "18 Aug 2026, 14:05" in the reader's own time zone (Dar es Salaam here). */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ProjectHistorySheet({
  rows, sheet, counts,
}: {
  rows: AuditRow[];
  sheet: string | null;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();

  const go = (key: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (key) q.set("sheet", key); else q.delete("sheet");
    const s = q.toString();
    router.push(s ? `${path}?${s}` : path);
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      {/* The rail: every sheet that has ever been changed, with its count. */}
      <div className="flex flex-wrap items-center gap-1">
        <Chip label="Everything" count={total} on={!sheet} onClick={() => go(null)} />
        {AUDIT_ENTITIES.filter((e) => counts[e]).map((e) => (
          <Chip
            key={e}
            label={ENTITY_LABELS[e] ?? e}
            count={counts[e]}
            on={sheet === e}
            onClick={() => go(e)}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[8px] border border-border p-6 text-center text-base text-fg-muted">
          Nothing has been changed yet. Every figure you type, approve or delete from
          here on is recorded on this page — what it was, what it became, and when.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[8px] border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-muted/40 text-left text-fg-muted">
                <th className="px-3 py-2 font-normal">When</th>
                <th className="px-3 py-2 font-normal">Who</th>
                <th className="px-3 py-2 font-normal">What changed</th>
                <th className="px-3 py-2 font-normal">Was</th>
                <th className="px-3 py-2 font-normal">Became</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 text-fg-muted">{when(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{actorLabel(r.createdBy)}</td>
                  <td className="px-3 py-1.5">
                    <span className="text-fg">{describeAudit(r)}</span>
                    {r.action === "created" && r.newValue && (
                      <span className="ml-1.5 text-fg-subtle">{summarise(r.newValue)}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-fg-muted">
                    {r.field ? displayValue(r.field, r.oldValue) : r.oldValue ?? ""}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.field ? (
                      <span className="inline-flex items-center gap-1">
                        <ArrowRight size={11} className="text-fg-subtle" />
                        <span className="font-medium">{displayValue(r.field, r.newValue)}</span>
                      </span>
                    ) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-fg-subtle">
        {rows.length === 1 ? "1 entry" : `${rows.length} entries`} · nothing here can be
        edited or removed, including by an assistant. Deleting a row from a sheet leaves
        its history behind on purpose.
      </p>
    </div>
  );
}

function Chip({
  label, count, on, onClick,
}: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[4px] border px-2 py-1 text-sm",
        on ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:text-fg",
      )}
    >
      {label} <span className="text-fg-subtle">{count}</span>
    </button>
  );
}

/** Field labels are exported for the record drawers that will reuse this later. */
export { fieldLabel };
