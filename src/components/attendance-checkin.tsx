"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Home, Laptop, Coffee, Thermometer } from "lucide-react";
import { portalMarkAttendance } from "@/app/portal/actions";
import { ATTENDANCE_SELF_STATUSES, type AttendanceStatus } from "@/lib/leave-shared";
import { cn } from "@/lib/cn";

const ICON: Record<string, React.ReactNode> = {
  Present: <Home size={16} />, Remote: <Laptop size={16} />, "Half-day": <Coffee size={16} />, Sick: <Thermometer size={16} />,
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** First-thing check-in. Auto-opens once a day when today isn't marked yet
 *  (and isn't a leave/holiday). Dismissing is remembered for the day. */
export function AttendanceCheckin({ firstName, status, editable }: { firstName: string; status: AttendanceStatus | null; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const dayKey = `cos-att-prompt-${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    if (!editable || status) return; // already marked, or locked by leave/holiday
    try { if (localStorage.getItem(dayKey)) return; } catch { /* ignore */ }
    const t = setTimeout(() => setOpen(true), 450);
    return () => clearTimeout(t);
  }, [editable, status, dayKey]);

  const dismiss = () => { try { localStorage.setItem(dayKey, "1"); } catch { /* ignore */ } setOpen(false); };
  const mark = (s: AttendanceStatus) => start(async () => {
    const res = await portalMarkAttendance(s);
    if (res.ok) { try { localStorage.setItem(dayKey, "1"); } catch { /* ignore */ } setOpen(false); router.refresh(); }
  });

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(86vw,19rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl glass glass-menu elevated p-5 data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0 focus:outline-none">
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">{greeting()}, {firstName} 👋</Dialog.Title>
          <Dialog.Description className="text-xs text-fg-muted mt-0.5">Mark your attendance for today.</Dialog.Description>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {ATTENDANCE_SELF_STATUSES.map((s) => (
              <button key={s} type="button" disabled={pending} onClick={() => mark(s)}
                className={cn("group inline-flex flex-col items-center justify-center gap-1 rounded-2xl bg-bg-subtle ring-1 ring-border py-3.5 text-[13px] font-medium transition-all hover:bg-accent hover:text-accent-fg hover:ring-accent hover:-translate-y-0.5 disabled:opacity-50")}>
                <span className="text-fg-muted group-hover:text-accent-fg transition-colors">{ICON[s]}</span>
                {s}
              </button>
            ))}
          </div>
          <button type="button" onClick={dismiss} className="mt-3.5 w-full text-center text-[11px] text-fg-subtle hover:text-fg transition-colors">Maybe later</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
