"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, ChevronDown } from "lucide-react";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { portalCorrectAttendance } from "@/app/portal/attendance-actions";
import { ATTENDANCE_TONE, type AttendanceStatus } from "@/lib/leave-shared";

/** Statuses a manager may set by hand (mirrors the server allow-list). The two
 *  derived states ("On leave"/"Holiday") never appear here — they're read-only. */
const MANUAL_STATUSES: AttendanceStatus[] = ["Present", "Absent", "Remote", "Half-day", "Sick"];

export type TeamAttendanceRow = {
  id: number;
  name: string;
  status: string; // recorded, or derived "On leave" / "Holiday"; "" = not marked
  editable: boolean; // false for derived states (leave/holiday)
};

function toneFor(status: string): "default" | "success" | "warn" | "danger" | "info" {
  return (ATTENDANCE_TONE as Record<string, "default" | "success" | "warn" | "danger" | "info">)[status] ?? "default";
}

/** "Team attendance today" — one row per team member with their status and, for
 *  editable rows, an inline picker so a manager / HR / director can correct the
 *  day. Derived rows (on approved leave / a public holiday) show read-only with
 *  a quiet note. Optimistic: the chosen status shows immediately, then a refresh
 *  reconciles with the server. */
export function TeamAttendance({ today, todayStr }: { today: TeamAttendanceRow[]; todayStr: string }) {
  if (today.length === 0) return null;
  return (
    <Reveal>
      <Panel className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <SectionLabel icon={<CalendarCheck size={13} />}>Team attendance today</SectionLabel>
          <span className="text-xs text-fg-muted">{today.length} people</span>
        </div>
        <ul className="divide-y divide-border/60">
          {today.map((r) => (
            <Row key={r.id} row={r} todayStr={todayStr} />
          ))}
        </ul>
      </Panel>
    </Reveal>
  );
}

function Row({ row, todayStr }: { row: TeamAttendanceRow; todayStr: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // Optimistic local status — shows the picked value before the refresh lands.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const shown = optimistic ?? row.status;

  function set(status: AttendanceStatus | null) {
    setOpen(false);
    setOptimistic(status ?? "");
    start(async () => {
      const res = await portalCorrectAttendance(row.id, todayStr, status);
      if (res.ok) {
        toast(status ? `Marked ${row.name} ${status} today` : `Cleared ${row.name}'s attendance today`, { tone: "success" });
        router.refresh();
      } else {
        setOptimistic(null); // revert
        toast(res.error || "Couldn't save", { tone: "warn" });
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 truncate text-sm font-medium text-fg">{row.name}</span>

      {row.editable ? (
        <StatusPicker
          shown={shown}
          open={open}
          pending={pending}
          onToggle={() => setOpen((v) => !v)}
          onPick={set}
        />
      ) : (
        // Derived state (on leave / a holiday) — never hand-editable.
        <span className="flex items-center gap-1.5">
          {shown ? <Badge tone={toneFor(shown)}>{shown}</Badge> : null}
          <span className="text-xs text-fg-subtle">auto</span>
        </span>
      )}
    </li>
  );
}

function StatusPicker({
  shown,
  open,
  pending,
  onToggle,
  onPick,
}: {
  shown: string;
  open: boolean;
  pending: boolean;
  onToggle: () => void;
  onPick: (s: AttendanceStatus | null) => void;
}) {
  const options = useMemo(() => MANUAL_STATUSES, []);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-5 ring-1 ring-border/60 transition-colors hover:ring-accent/40 disabled:opacity-50",
          shown ? "" : "text-fg-muted",
        )}
      >
        {shown ? <Badge tone={toneFor(shown)}>{shown}</Badge> : <span className="px-1">Mark…</span>}
        <ChevronDown size={13} className="text-fg-subtle" />
      </button>

      {open && (
        <>
          {/* Click-away catcher. */}
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={onToggle} />
          <ul
            role="listbox"
            className="absolute right-0 z-50 mt-1.5 w-36 overflow-hidden rounded-xl glass glass-menu elevated p-1 text-sm"
          >
            {options.map((s) => {
              const active = shown === s;
              return (
                <li key={s}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onPick(s)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-bg-subtle"
                  >
                    <span>{s}</span>
                    {active && <Check size={14} className="text-accent" />}
                  </button>
                </li>
              );
            })}
            {shown && (
              <li className="mt-0.5 border-t border-border/60 pt-0.5">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => onPick(null)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-fg-muted transition-colors hover:bg-bg-subtle"
                >
                  Clear
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
