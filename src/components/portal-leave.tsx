"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plane, Plus, Check, Loader2 } from "lucide-react";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { LEAVE_STATUS_TONE, type LeaveRequestRow, type PersonLeaveBalance } from "@/lib/leave-shared";
import { portalRequestLeave } from "@/app/portal/actions";

const statusClass: Record<string, string> = {
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  default: "bg-bg-muted text-fg-muted",
};

function fmtRange(startISO: string, endISO: string): string {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const s = new Date(`${startISO.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", o);
  if (startISO.slice(0, 10) === endISO.slice(0, 10)) return s;
  return `${s} – ${new Date(`${endISO.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", o)}`;
}

/** Staff self-service leave: balances (read-only) + own requests + request form. */
export function PortalLeave({
  balances,
  requests,
}: {
  balances: PersonLeaveBalance[];
  requests: LeaveRequestRow[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const capped = balances.filter((b) => b.entitlement > 0);

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setBusy(true);
    startTransition(async () => {
      const res = await portalRequestLeave(fd);
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Leave requested — your manager will review it.", { tone: "success" });
      setRequesting(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Balances */}
      {capped.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border">
          <div className="border-b border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5">
            <CalendarDays size={12} /> Your balances
          </div>
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
                    <span className="text-[10px] text-fg-subtle tabular shrink-0">{b.taken}/{b.entitlement}{b.pending ? ` · ${b.pending} pending` : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Requests + request form */}
      <div className="overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border">
        <div className="border-b border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5">
          <Plane size={12} /> Your requests
        </div>
        {requests.length === 0 ? (
          <p className="px-4 py-3 text-xs text-fg-muted">No leave requested yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {requests.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 px-4 py-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.leaveTypeColor ?? "var(--fg-subtle)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium truncate">{r.leaveTypeName ?? "Leave"}</span>
                  <span className="block text-[10px] text-fg-subtle truncate">{fmtRange(r.startDate, r.endDate)} · {r.halfDay ? "½ day" : `${r.days} day${r.days === 1 ? "" : "s"}`}</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", statusClass[LEAVE_STATUS_TONE[r.status]] ?? statusClass.default)}>{r.status}</span>
              </div>
            ))}
          </div>
        )}

        {requesting ? (
          <form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="border-t border-border/50 p-3 space-y-2 bg-bg-subtle/40">
            <select name="leaveTypeId" required defaultValue=""
              className="w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40">
              <option value="" disabled>Leave type…</option>
              {/* Only types you actually have an allowance for — matches the
                  balances panel, so staff can't pick a zero-allowance type. */}
              {capped.map((b) => {
                const remaining = b.remaining ?? b.entitlement;
                return <option key={b.typeId} value={b.typeId}>{b.typeName} ({remaining} left)</option>;
              })}
            </select>
            <div className="flex items-center gap-2">
              <input type="date" name="startDate" required className="flex-1 rounded-md bg-bg-elev text-xs ring-1 ring-border px-2 py-2" />
              <span className="text-[11px] text-fg-subtle">to</span>
              <input type="date" name="endDate" required className="flex-1 rounded-md bg-bg-elev text-xs ring-1 ring-border px-2 py-2" />
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
              <input type="checkbox" name="halfDay" value="1" className="accent-accent" /> Half day
            </label>
            <input name="reason" placeholder="Reason (optional)" className="w-full rounded-md bg-bg-elev text-xs ring-1 ring-border px-2.5 py-2" />
            <div className="flex items-center gap-1.5">
              <Button type="submit" size="sm" variant="primary" disabled={busy}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Submit request
              </Button>
              <button type="button" onClick={() => setRequesting(false)} className="rounded-md px-2 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-muted">Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setRequesting(true)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left text-xs font-medium text-accent hover:bg-bg-muted/40 transition-colors border-t border-border/50">
            <Plus size={14} /> Request leave
          </button>
        )}
      </div>
    </div>
  );
}
