"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, Plus, X, Check, Ban, Trash2, Loader2, Plane, PartyPopper, Settings2 } from "lucide-react";
import { Badge, Button } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { LEAVE_STATUS_TONE, type LeaveType, type LeaveRequestRow, type Holiday } from "@/lib/leave-shared";
import type { LeaveMetrics } from "@/lib/leave";
import {
  createLeaveRequestAction, decideLeaveRequestAction, deleteLeaveRequestAction,
  saveLeaveTypeAction, archiveLeaveTypeAction, addHolidayAction, deleteHolidayAction,
} from "@/app/hrms/leave/actions";

type Lite = { id: number; name: string };
type Tab = "overview" | "requests" | "setup";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function LeaveBoard({
  types, requests, holidays, metrics, people, companies,
}: {
  types: LeaveType[];
  requests: LeaveRequestRow[];
  holidays: Holiday[];
  metrics: LeaveMetrics;
  people: Lite[];
  companies: Lite[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [newOpen, setNewOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, start] = useTransition();

  const activeTypes = types.filter((t) => t.active);
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveToday = requests.filter((r) => r.status === "Approved" && r.startDate.slice(0, 10) <= today && r.endDate.slice(0, 10) >= today);
  const pending = requests.filter((r) => r.status === "Pending");
  const upcomingHolidays = holidays.filter((h) => h.date.slice(0, 10) >= today).slice(0, 6);

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusyId(id);
    start(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) { toast(res.error ?? "Something went wrong", { tone: "danger" }); return; }
      if (okMsg) toast(okMsg, { tone: "success" });
      router.refresh();
    });
  }

  const tabs: Array<{ key: Tab; label: string; icon: typeof CalendarDays }> = [
    { key: "overview", label: "Overview", icon: CalendarDays },
    { key: "requests", label: "Requests", icon: Plane },
    { key: "setup", label: "Setup", icon: Settings2 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-bg-subtle p-1 ring-1 ring-border/60">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setNewOpen(true)}><Plus size={14} /> New leave request</Button>
      </div>

      {tab === "overview" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Pending", value: metrics.pending, tone: metrics.pending ? "text-warn" : "text-fg-subtle" },
              { label: "On leave today", value: metrics.onLeaveToday, tone: metrics.onLeaveToday ? "text-info" : "text-fg-subtle" },
              { label: "Approved this month", value: metrics.approvedThisMonth, tone: "text-success" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-bg-elev ring-1 ring-border/70 px-3 py-2.5 text-center">
                <div className={cn("text-xl font-semibold tabular", s.tone)}>{s.value}</div>
                <div className="text-[11px] text-fg-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="glass elevated rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/70 text-xs font-medium uppercase tracking-wider text-fg-muted">On leave today</div>
            {onLeaveToday.length ? (
              <div className="divide-y divide-border/50">
                {onLeaveToday.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.leaveTypeColor ?? "var(--accent)" }} />
                    <span className="flex-1 min-w-0 truncate">{r.personName}</span>
                    <span className="text-xs text-fg-muted">{r.leaveTypeName} · until {fmtShort(r.endDate)}</span>
                  </div>
                ))}
              </div>
            ) : <div className="px-4 py-3 text-sm text-fg-muted">Everyone's in today.</div>}
          </div>

          {pending.length > 0 && (
            <div className="glass elevated rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/70 text-xs font-medium uppercase tracking-wider text-fg-muted">Awaiting your decision</div>
              <div className="divide-y divide-border/50">
                {pending.map((r) => <RequestRow key={r.id} r={r} busy={busyId === r.id} run={run} />)}
              </div>
            </div>
          )}

          {upcomingHolidays.length > 0 && (
            <div className="glass elevated rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/70 text-xs font-medium uppercase tracking-wider text-fg-muted flex items-center gap-1.5"><PartyPopper size={12} /> Upcoming holidays</div>
              <div className="divide-y divide-border/50">
                {upcomingHolidays.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="flex-1 truncate">{h.name}</span>
                    <span className="text-xs text-fg-muted">{fmt(h.date)}{h.companyName ? ` · ${h.companyName}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div className="glass elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {requests.length ? requests.map((r) => <RequestRow key={r.id} r={r} busy={busyId === r.id} run={run} showDelete />)
            : <div className="px-4 py-10 text-center text-sm text-fg-muted">No leave requests yet.</div>}
        </div>
      )}

      {tab === "setup" && (
        <SetupTab types={types} holidays={holidays} companies={companies} busyId={busyId} run={run} />
      )}

      <NewRequestDialog open={newOpen} onOpenChange={setNewOpen} people={people} types={activeTypes} />
    </div>
  );
}

function RequestRow({ r, busy, run, showDelete }: {
  r: LeaveRequestRow; busy: boolean;
  run: (id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void;
  showDelete?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 px-4 py-2.5", busy && "opacity-60")}>
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.leaveTypeColor ?? "var(--accent)" }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{r.personName} <span className="text-fg-muted font-normal">· {r.leaveTypeName}</span></div>
        <div className="text-xs text-fg-muted">
          {fmtShort(r.startDate)}{r.endDate.slice(0, 10) !== r.startDate.slice(0, 10) ? `–${fmtShort(r.endDate)}` : ""}
          {" · "}{r.days} day{r.days === 1 ? "" : "s"}{r.halfDay ? " (half)" : ""}{r.reason ? ` · ${r.reason}` : ""}
        </div>
      </div>
      <Badge tone={LEAVE_STATUS_TONE[r.status]}>{r.status}</Badge>
      {r.status === "Pending" && (
        <>
          <button type="button" disabled={busy} onClick={() => run(r.id, () => decideLeaveRequestAction(r.id, "Approved"), "Approved.")}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium bg-success-soft text-success ring-1 ring-success/25 hover:bg-success-soft/80"><Check size={12} /> Approve</button>
          <button type="button" disabled={busy} onClick={() => run(r.id, () => decideLeaveRequestAction(r.id, "Rejected"), "Rejected.")}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-danger"><Ban size={12} /> Reject</button>
        </>
      )}
      {showDelete && (
        <button type="button" disabled={busy} onClick={() => run(r.id, () => deleteLeaveRequestAction(r.id), "Deleted.")}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-danger">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      )}
    </div>
  );
}

function SetupTab({ types, holidays, companies, busyId, run }: {
  types: LeaveType[]; holidays: Holiday[]; companies: Lite[]; busyId: number | null;
  run: (id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";

  function addType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    start(async () => {
      const res = await saveLeaveTypeAction(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Leave type added.", { tone: "success" }); form.reset(); location.reload();
    });
  }
  function addHoliday(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    start(async () => {
      const res = await addHolidayAction(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Holiday added.", { tone: "success" }); form.reset(); location.reload();
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="glass elevated rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/70 text-xs font-medium uppercase tracking-wider text-fg-muted">Leave types</div>
        <div className="divide-y divide-border/50">
          {types.map((t) => (
            <div key={t.id} className={cn("flex items-center gap-2 px-4 py-2 text-sm", !t.active && "opacity-50")}>
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: t.color ?? "var(--accent)" }} />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="text-xs text-fg-muted">
                {t.defaultDays > 0 ? `${t.defaultDays} days/${t.cycleMonths === 12 ? "yr" : `${t.cycleMonths}mo`}` : "uncapped"}
                {t.halfPayDays > 0 ? ` (${t.defaultDays - t.halfPayDays} full + ${t.halfPayDays} half)` : ""} · {t.paid ? "paid" : "unpaid"}
              </span>
              {t.active && (
                <button type="button" disabled={busyId === t.id} onClick={() => run(t.id, () => archiveLeaveTypeAction(t.id), "Archived.")}
                  className="text-fg-muted hover:text-danger"><X size={13} /></button>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={addType} className="p-3 border-t border-border/70 grid grid-cols-2 gap-2">
          <input name="name" placeholder="New type name" className={cn(input, "col-span-2")} required />
          <input name="defaultDays" type="number" min={0} placeholder="Total days" className={input} />
          <input name="cycleMonths" type="number" min={1} defaultValue={12} placeholder="Cycle (months)" className={input} />
          <input name="halfPayDays" type="number" min={0} defaultValue={0} placeholder="Half-pay days" className={input} title="Days of the entitlement paid at half wage (e.g. sick 63)" />
          <input name="color" type="color" defaultValue="#2563eb" className="h-9 w-full rounded-md border border-border bg-bg-subtle" />
          <label className="col-span-2 inline-flex items-center gap-1.5 text-xs text-fg-muted"><input type="checkbox" name="paid" defaultChecked className="accent-accent" /> Paid leave</label>
          <Button type="submit" size="sm" loading={pending} className="col-span-2"><Plus size={13} /> Add leave type</Button>
        </form>
      </div>

      <div className="glass elevated rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/70 text-xs font-medium uppercase tracking-wider text-fg-muted">Public holidays</div>
        <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
          {holidays.length ? holidays.map((h) => (
            <div key={h.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="flex-1 truncate">{h.name}</span>
              <span className="text-xs text-fg-muted">{fmt(h.date)}{h.companyName ? ` · ${h.companyName}` : ""}</span>
              <button type="button" disabled={busyId === h.id} onClick={() => run(h.id, () => deleteHolidayAction(h.id), "Removed.")}
                className="text-fg-muted hover:text-danger"><X size={13} /></button>
            </div>
          )) : <div className="px-4 py-3 text-sm text-fg-muted">No holidays yet.</div>}
        </div>
        <form onSubmit={addHoliday} className="p-3 border-t border-border/70 grid grid-cols-2 gap-2">
          <input name="name" placeholder="Holiday name" className={cn(input, "col-span-2")} required />
          <input name="date" type="date" className={input} required />
          <select name="companyId" className={input} defaultValue="">
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button type="submit" size="sm" loading={pending} className="col-span-2"><Plus size={13} /> Add holiday</Button>
        </form>
      </div>
    </div>
  );
}

function NewRequestDialog({ open, onOpenChange, people, types }: {
  open: boolean; onOpenChange: (o: boolean) => void; people: Lite[]; types: LeaveType[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [half, setHalf] = useState(false);
  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createLeaveRequestAction(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Leave request added.", { tone: "success" });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(480px,calc(100vw-2rem))] max-h-[88dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl glass glass-menu elevated outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">New leave request</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>
          <form onSubmit={submit} className="p-5 space-y-3">
            <div>
              <label className={label}>Person *</label>
              <select name="personId" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Leave type *</label>
              <select name="leaveTypeId" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.defaultDays > 0 ? ` (${t.defaultDays}/yr)` : ""}</option>)}
              </select>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <input type="checkbox" name="halfDay" checked={half} onChange={(e) => setHalf(e.target.checked)} className="accent-accent" /> Half day
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>{half ? "Date *" : "Start *"}</label>
                <input name="startDate" type="date" required className={input} />
              </div>
              {!half && (
                <div>
                  <label className={label}>End *</label>
                  <input name="endDate" type="date" required className={input} />
                </div>
              )}
            </div>
            <div>
              <label className={label}>Reason</label>
              <input name="reason" className={input} placeholder="Optional" />
            </div>
            <p className="text-[11px] text-fg-subtle">Days are counted Mon–Sat, excluding public holidays.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={pending}>Add request</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
