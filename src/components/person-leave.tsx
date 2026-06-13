"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Plane, Check, X, Plus, Loader2, CalendarCheck } from "lucide-react";
import { Badge, Button } from "./ui";
import { EmptyState, SectionCard } from "./drawer-kit";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { LEAVE_STATUS_TONE, type LeaveRequestRow, type PersonLeaveBalance } from "@/lib/leave-shared";
import type { PersonAttendanceSummary } from "@/lib/leave";
import { decideLeaveRequestAction, createLeaveRequestAction } from "@/app/hrms/leave/actions";

function fmtRange(startISO: string, endISO: string): string {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const s = new Date(`${startISO.slice(0, 10)}T00:00:00`);
  const e = new Date(`${endISO.slice(0, 10)}T00:00:00`);
  const sStr = s.toLocaleDateString("en-GB", o);
  if (startISO.slice(0, 10) === endISO.slice(0, 10)) return sStr;
  return `${sStr} – ${e.toLocaleDateString("en-GB", o)}`;
}

/** Leave snapshot for the person drawer: attendance + balances + actionable requests. */
export function PersonLeave({
  personId,
  balances,
  requests,
  attendance,
  onChanged,
}: {
  personId: number;
  balances: PersonLeaveBalance[];
  requests: LeaveRequestRow[];
  attendance: PersonAttendanceSummary;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = requests.filter(
    (r) => r.status === "Pending" || (r.status === "Approved" && r.endDate.slice(0, 10) >= today)
  );
  const past = requests.filter((r) => !upcoming.includes(r));
  const capped = balances.filter((b) => b.entitlement > 0);
  const uncapped = balances.filter((b) => b.entitlement <= 0 && b.taken > 0);

  function decide(id: number, status: "Approved" | "Rejected") {
    setBusyId(id);
    startTransition(async () => {
      const res = await decideLeaveRequestAction(id, status);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(status === "Approved" ? "Leave approved." : "Leave rejected.", { tone: "success" });
      onChanged?.();
    });
  }

  function recordLeave(form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set("personId", String(personId));
    setBusyId(-1);
    startTransition(async () => {
      const res = await createLeaveRequestAction(fd);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Leave recorded (pending).", { tone: "success" });
      setRecording(false);
      onChanged?.();
    });
  }

  return (
    <div className="space-y-3">
      {/* Attendance this month — only when the register has been used */}
      {attendance.recorded > 0 && (
        <SectionCard className="p-3.5">
          <div className="text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5 mb-2">
            <CalendarCheck size={12} /> Attendance this month
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Present", value: attendance.present, tone: "text-success" },
              { label: "Absent", value: attendance.absent, tone: attendance.absent ? "text-danger" : "text-fg-subtle" },
              { label: "Leave/Sick", value: attendance.onLeave, tone: "text-info" },
              { label: "Recorded", value: attendance.recorded, tone: "text-fg-muted" },
            ].map((t) => (
              <div key={t.label} className="rounded-xl bg-bg-elev ring-1 ring-border/70 px-1.5 py-2">
                <div className={cn("text-base font-semibold tabular leading-none", t.tone)}>{t.value}</div>
                <div className="mt-1 text-[10px] text-fg-muted leading-tight">{t.label}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Balances */}
      <SectionCard>
        <div className="px-4 py-2.5 border-b border-border/50 text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5">
          <CalendarDays size={12} /> Leave balances
        </div>
        {capped.length === 0 && uncapped.length === 0 ? (
          <EmptyState icon={<CalendarDays size={20} />} title="No leave types" hint="Set up leave types in Leave & Attendance." />
        ) : (
          <div className="divide-y divide-border/50">
            {capped.map((b) => {
              const remaining = b.remaining ?? b.entitlement;
              const pct = b.entitlement > 0 ? Math.min(100, Math.round((b.taken / b.entitlement) * 100)) : 0;
              const low = remaining <= 0;
              return (
                <div key={b.typeId} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color ?? "var(--fg-subtle)" }} />
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">{b.typeName}</span>
                    <span className={cn("text-xs tabular", low ? "text-danger font-medium" : "text-fg-muted")}>{remaining} left</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: low ? "var(--danger)" : b.color ?? "var(--accent)" }} />
                    </div>
                    <span className="text-[10px] text-fg-subtle tabular shrink-0">
                      {b.taken}/{b.entitlement}{b.pending ? ` · ${b.pending} pending` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            {uncapped.map((b) => (
              <div key={b.typeId} className="flex items-center gap-2 px-4 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color ?? "var(--fg-subtle)" }} />
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{b.typeName}</span>
                <span className="text-xs text-fg-muted tabular">{b.taken} taken</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Requests */}
      <SectionCard>
        <div className="px-4 py-2.5 border-b border-border/50 text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5">
          <Plane size={12} /> Leave requests
          {requests.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{requests.length}</span>
          )}
        </div>
        {requests.length === 0 ? (
          <EmptyState icon={<Plane size={20} />} title="No leave requests" hint="Record leave below, or staff can request it from the portal." />
        ) : (
          <div className="divide-y divide-border/50">
            {[...upcoming, ...past].slice(0, 12).map((r) => {
              const busy = busyId === r.id;
              return (
                <div key={r.id} className={cn("flex items-center gap-2.5 px-4 py-2", busy && "opacity-60")}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.leaveTypeColor ?? "var(--fg-subtle)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium truncate">{r.leaveTypeName ?? "Leave"}</span>
                    <span className="block text-[10px] text-fg-subtle truncate">
                      {fmtRange(r.startDate, r.endDate)} · {r.halfDay ? "½ day" : `${r.days} day${r.days === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  {r.status === "Pending" ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" disabled={busy} onClick={() => decide(r.id, "Approved")} aria-label="Approve"
                        className="h-6 w-6 inline-flex items-center justify-center rounded-md bg-success-soft text-success ring-1 ring-success/25 hover:bg-success-soft/80 disabled:opacity-50">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(r.id, "Rejected")} aria-label="Reject"
                        className="h-6 w-6 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50">
                        <X size={12} />
                      </button>
                    </span>
                  ) : (
                    <Badge tone={LEAVE_STATUS_TONE[r.status]} className="shrink-0">{r.status}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Record leave */}
        {recording ? (
          <form
            onSubmit={(e) => { e.preventDefault(); recordLeave(e.currentTarget); }}
            className="border-t border-border/50 p-3 space-y-2 bg-bg-subtle/40"
          >
            <select name="leaveTypeId" required defaultValue=""
              className="w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40">
              <option value="" disabled>Leave type…</option>
              {balances.map((b) => <option key={b.typeId} value={b.typeId}>{b.typeName}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <input type="date" name="startDate" required className="flex-1 rounded-md bg-bg-elev text-xs ring-1 ring-border px-2 py-1.5" />
              <span className="text-[11px] text-fg-subtle">to</span>
              <input type="date" name="endDate" required className="flex-1 rounded-md bg-bg-elev text-xs ring-1 ring-border px-2 py-1.5" />
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
              <input type="checkbox" name="halfDay" value="1" className="accent-accent" /> Half day
            </label>
            <input name="reason" placeholder="Reason (optional)" className="w-full rounded-md bg-bg-elev text-xs ring-1 ring-border px-2.5 py-1.5" />
            <div className="flex items-center gap-1.5">
              <Button type="submit" disabled={busyId === -1} loading={busyId === -1} size="xs">
                {busyId !== -1 && <Check size={11} />} Save
              </Button>
              <button type="button" onClick={() => setRecording(false)} className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted">Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setRecording(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-[11px] font-medium text-accent hover:bg-bg-muted/40 transition-colors border-t border-border/50">
            <Plus size={13} /> Record leave
          </button>
        )}
      </SectionCard>
    </div>
  );
}
