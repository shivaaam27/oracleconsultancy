"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import type { Holiday } from "@/lib/leave-shared";
import { addHolidayAction, deleteHolidayAction } from "@/app/hrms/leave/actions";

type Lite = { id: number; name: string };

function fmt(d: string) {
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Public holidays manager. Holidays are what the attendance register uses to
 * auto-fill a day as "Holiday" (and to stop staff checking in on one), so this
 * list stays owner-editable even though the wider Leave module was retired.
 */
export function HolidaysAdmin({ holidays, companies }: { holidays: Holiday[]; companies: Lite[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const SELECT_CLASS = "border border-border bg-bg-subtle focus:outline-none focus:border-accent";
  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";

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

  function remove(id: number) {
    setBusyId(id);
    start(async () => {
      const res = await deleteHolidayAction(id);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Removed.", { tone: "success" }); location.reload();
    });
  }

  return (
    <div className="glass elevated rounded-2xl overflow-hidden max-w-xl">
      <div className="px-4 py-2.5 border-b border-border/70 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Public holidays</div>
      <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
        {holidays.length ? holidays.map((h) => (
          <div key={h.id} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="flex-1 truncate">{h.name}</span>
            <span className="text-xs text-fg-muted">{fmt(h.date)}{h.companyName ? ` · ${h.companyName}` : ""}</span>
            <button type="button" disabled={busyId === h.id} onClick={() => remove(h.id)}
              className="text-fg-muted hover:text-danger"><X size={13} /></button>
          </div>
        )) : <div className="px-4 py-3 text-sm text-fg-muted">No holidays yet.</div>}
      </div>
      <form onSubmit={addHoliday} className="p-3 border-t border-border/70 grid grid-cols-2 gap-2">
        <input name="name" placeholder="Holiday name" className={cn(input, "col-span-2")} required />
        <input name="date" type="date" className={input} required />
        <Select name="companyId" className={SELECT_CLASS} defaultValue="">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button type="submit" size="sm" loading={pending} className="col-span-2"><Plus size={13} /> Add holiday</Button>
      </form>
    </div>
  );
}
