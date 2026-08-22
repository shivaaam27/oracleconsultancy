"use client";

import { Check, PhoneOff, ShieldCheck } from "lucide-react";
import type { PersonRow } from "@/lib/people-queries";
import { RecordList, RecordListHeader, type RecordColumn } from "./record-list";
import { buildColumns } from "./entity-cells";
import { Combobox } from "./combobox";
import { getInitials } from "@/lib/names";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { cn } from "@/lib/cn";

/**
 * The People list, on the shared shell (Stage 4 of the ERPNext redesign).
 *
 * The columns — which, in what order, how wide, what they are called — come
 * from `ENTITY_VIEWS.person`. Only the cells that DO something are overridden
 * here: the manager combobox, the tap-to-cycle portal role, the workload
 * figure and the name cell's avatar.
 *
 * Rendered `bare` and headerless because People groups its rows into company
 * housings that already draw the frame and the heading; the shared column
 * header sits once above them.
 */

const PERSON_COLUMNS = ENTITY_VIEWS.person!.listColumns;

export type ManagerPicker = {
  labels: string[];
  labelById: Map<number, string>;
  labelToId: Map<string, number>;
};

/** The column names, drawn once above the company housings. Uses the same
 *  metadata as the rows, so the two can never drift apart. */
export function PeopleListHeader({ selectMode }: { selectMode: boolean }) {
  const columns = buildColumns<PersonRow & Record<string, unknown>>(PERSON_COLUMNS) as RecordColumn<PersonRow>[];
  return <RecordListHeader columns={columns} hasSelection={selectMode} className="rounded-xl" />;
}

export function PeopleRecordList({
  items,
  selectMode,
  selected,
  directoryHints,
  managerPicker,
  onOpen,
  onSetManager,
  onSetRole,
}: {
  items: PersonRow[];
  selectMode: boolean;
  selected: Set<number>;
  directoryHints?: Record<number, { onLeave: boolean; present: number; absent: number }> | null;
  managerPicker: ManagerPicker;
  onOpen: (p: PersonRow) => void;
  onSetManager: (personId: number, managerId: number) => void;
  onSetRole: (personId: number, role: "staff" | "manager" | "director") => void;
}) {
  const columns = buildColumns<PersonRow & Record<string, unknown>>(PERSON_COLUMNS, {
    overrides: {
      name: (x) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="relative shrink-0">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-bg-subtle text-[9px] font-semibold text-fg-muted ring-1 ring-border">
              {getInitials(x.name)}
            </span>
            {directoryHints?.[x.id]?.onLeave && (
              <span title="On approved leave today" className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-warn ring-2 ring-bg-elev" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-base font-medium leading-tight">{x.name}</span>
              {!x.hasContact && <PhoneOff size={11} className="shrink-0 text-danger" />}
            </span>
            <span className="block truncate text-xs text-fg-subtle">
              {[x.role, x.companyName].filter(Boolean).join(" · ") || "—"}
            </span>
          </span>
        </span>
      ),

      managerId: (x) => (
        <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <Combobox
            options={managerPicker.labels}
            defaultValue={x.managerId != null ? managerPicker.labelById.get(x.managerId) ?? "" : ""}
            placeholder="Set manager…"
            className="h-6 w-full rounded-md bg-bg-subtle px-2 text-xs text-fg ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
            onCommit={(v) => {
              const id = managerPicker.labelToId.get(v.trim());
              if (id != null) onSetManager(x.id, id);
            }}
          />
        </span>
      ),

      portalRole: (x) => {
        const role: string = x.portalRole ?? "staff";
        const next = role === "staff" ? "manager" : role === "manager" ? "director" : "staff";
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (x.portalEnabled) onSetRole(x.id, next as "staff" | "manager" | "director"); }}
            disabled={!x.portalEnabled}
            title={x.portalEnabled ? "Tap to change portal role" : "No portal access"}
            className={cn(
              "inline-flex w-full items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 transition-colors",
              !x.portalEnabled ? "cursor-default text-fg-subtle ring-border"
                : role === "director" || role === "hr" ? "bg-accent-soft text-accent ring-accent/25"
                : role === "manager" ? "bg-info-soft text-info ring-info/25"
                : "bg-bg-muted text-fg-muted ring-border"
            )}
          >
            <ShieldCheck size={10} /> {x.portalEnabled ? role : "none"}
          </button>
        );
      },

      workload: (x) => (
        <span className={cn(
          "tabular text-xs font-semibold",
          x.workload.overdue > 0 ? "text-danger"
            : x.workload.open >= 5 ? "text-warn"
            : x.workload.open === 0 ? "text-fg-subtle"
            : "text-info"
        )}>
          {x.workload.open}{x.workload.overdue ? ` · ${x.workload.overdue}↓` : ""}
        </span>
      ),
    },
  }) as RecordColumn<PersonRow>[];

  return (
    <RecordList<PersonRow>
      rows={items}
      rowKey={(x) => x.id}
      bare
      showHeader={false}
      showFooter={false}
      onRowClick={onOpen}
      columns={columns}
      selectionSlot={selectMode ? (x) => (
        <span className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
          selected.has(x.id) ? "border-accent bg-accent text-accent-fg" : "border-border-strong"
        )}>
          {selected.has(x.id) && <Check size={12} strokeWidth={3} />}
        </span>
      ) : undefined}
    />
  );
}
