"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Home, Laptop, Coffee, Thermometer, Lock } from "lucide-react";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { portalMarkAttendance } from "@/app/portal/actions";
import { ATTENDANCE_SELF_STATUSES, ATTENDANCE_ABBR, ATTENDANCE_CELL, type AttendanceStatus } from "@/lib/leave-shared";
import type { PortalAttendanceDay } from "@/lib/attendance";

const SELF_ICON: Record<string, React.ReactNode> = {
  Present: <Home size={15} />, Remote: <Laptop size={15} />, "Half-day": <Coffee size={15} />, Sick: <Thermometer size={15} />,
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PortalAttendance({ days, todayEditable, lockReason }: { days: PortalAttendanceDay[]; todayEditable: boolean; lockReason: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const todayStatus = days.find((d) => d.isToday)?.status ?? null;

  function mark(status: AttendanceStatus) {
    // Ignore a second tap while a mark is already in flight — the buttons dim via
    // `pending`, but guard here too so rapid taps can't queue duplicate requests.
    if (pending) return;
    start(async () => {
      const res = await portalMarkAttendance(status);
      toast(res.ok ? `Marked ${status} for today` : (res.error || "Couldn't save"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-2xl bg-bg-elev ring-1 ring-border overflow-hidden">
      {/* Today */}
      <div className="p-4 border-b border-border/60">
        {todayEditable ? (
          <>
            <div className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted mb-2.5">How are you working today?</div>
            <div className="grid grid-cols-2 gap-2">
              {ATTENDANCE_SELF_STATUSES.map((s) => {
                const active = todayStatus === s;
                return (
                  <button key={s} type="button" disabled={pending} onClick={() => mark(s)}
                    className={cn("inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium ring-1 transition-colors disabled:opacity-50",
                      active ? "bg-accent text-accent-fg ring-accent" : "bg-bg-subtle ring-border text-fg hover:bg-bg-muted/70")}>
                    {active ? <Check size={15} /> : SELF_ICON[s]} {s}
                  </button>
                );
              })}
            </div>
            {todayStatus && <div className="mt-2 text-[11px] text-fg-subtle">You marked <span className="font-medium text-fg">{todayStatus}</span> today — tap another to change it.</div>}
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-fg-muted"><Lock size={14} className="shrink-0" /> {lockReason}</div>
        )}
      </div>

      {/* This week */}
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle mb-2">This week</div>
        <div className="grid grid-cols-6 gap-1.5">
          {days.map((d) => {
            const st = d.status;
            return (
              <div key={d.date} className={cn("rounded-lg ring-1 ring-border/60 px-1 py-1.5 text-center", d.isToday && "ring-2 ring-accent/50")}>
                <div className="text-[10px] text-fg-subtle">{DOW[d.dow]}</div>
                <div className={cn("mt-1 mx-auto h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold", st ? ATTENDANCE_CELL[st] : "bg-bg-muted/50 text-fg-subtle")}>
                  {st ? ATTENDANCE_ABBR[st] : "·"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
