"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { Trash2, RotateCcw, X, Loader2 } from "lucide-react";
import { TableShell, Th, Td } from "./ui";
import { AuditMenu } from "./audit-menu";
import { bulkDeleteAuditEntries } from "@/app/audit/actions";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";

type AuditRow = {
  id: number;
  task_code: string | null;
  company_id: number | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  entry_type: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
};

function fmt(d: string | null) {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—";
}

export function AuditTable({
  rows,
  cMap,
  showDeleted,
}: {
  rows: AuditRow[];
  cMap: Record<string, string>;
  showDeleted: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const { toast } = useToast();

  // Only non-deleted rows are bulk-selectable for deletion
  const selectableIds = useMemo(
    () => rows.filter((r) => !r.deleted_at).map((r) => r.id),
    [rows]
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  };

  const onBulkDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    start(async () => {
      const res = await bulkDeleteAuditEntries(ids);
      if (res.ok) {
        toast(`Deleted ${res.deleted} ${res.deleted === 1 ? "entry" : "entries"}.`, { tone: "success" });
        setSelected(new Set());
      } else {
        toast(res.error ?? "Couldn't delete.", { tone: "danger" });
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm sticky top-2 z-10 backdrop-blur">
          <span className="text-fg-muted">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={pending}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-muted"
            >
              <X size={12} /> Clear
            </button>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs bg-danger text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete {selected.size}
            </button>
          </div>
        </div>
      )}

      <TableShell>
        <table className="w-full">
          <thead>
            <tr>
              <Th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  className="accent-accent"
                  aria-label="Select all"
                />
              </Th>
              <Th>When</Th>
              <Th>Company</Th>
              <Th>Task</Th>
              <Th>Field</Th>
              <Th>Old</Th>
              <Th>New</Th>
              <Th>Reason</Th>
              <Th>By</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const isDeleted = !!a.deleted_at;
              return (
                <tr
                  key={a.id}
                  className={cn(
                    "group hover:bg-bg-subtle transition-colors",
                    isDeleted && "opacity-50",
                    selected.has(a.id) && "bg-accent/5"
                  )}
                >
                  <Td>
                    {!isDeleted ? (
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        className="accent-accent"
                        aria-label={`Select entry ${a.id}`}
                      />
                    ) : (
                      <span className="text-[10px] text-danger uppercase tracking-wider">del</span>
                    )}
                  </Td>
                  <Td className="font-mono text-xs text-fg-muted whitespace-nowrap">{fmt(a.created_at)}</Td>
                  <Td className="whitespace-nowrap text-xs">{a.company_id ? cMap[a.company_id] : ""}</Td>
                  <Td className="font-mono text-xs">
                    {a.task_code ? (
                      <Link href={`/task/${a.task_code}`} className="hover:text-accent">{a.task_code}</Link>
                    ) : ""}
                  </Td>
                  <Td className="text-xs">{a.field}</Td>
                  <Td className="text-fg-muted max-w-[140px] truncate text-xs">{a.old_value}</Td>
                  <Td className="max-w-[140px] truncate text-xs">{a.new_value}</Td>
                  <Td className="max-w-[160px] truncate text-xs">
                    {a.change_reason ? (
                      <span className="text-fg-muted italic">{a.change_reason}</span>
                    ) : (
                      <span className="text-fg-subtle text-[11px]">—</span>
                    )}
                  </Td>
                  <Td className="text-xs text-fg-muted">{a.created_by}</Td>
                  <Td>
                    <AuditMenu entryId={a.id} currentReason={a.change_reason} deleted={isDeleted} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {rows.length === 0 && (
        <div className="text-center py-12 text-fg-muted text-sm">
          No audit entries in this range.
        </div>
      )}
    </div>
  );
}
