"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, X, Loader2 } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { PeoplePicker } from "@/components/people-picker";
import { useToast } from "./toast";
import { portalDirectorCreateEvent } from "@/app/portal/actions";

type Person = { id: number; name: string };
type Company = { id: number; name: string };

const inputCls = "w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3 py-2.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

/** Director-only: schedule a calendar event / meeting (any company). */
export function DirectorEventForm({ people, companies }: { people: Person[]; companies: Company[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [attendees, setAttendees] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    // Build the attendees JSON the calendar action expects.
    const picked = people.filter((p) => attendees.includes(p.id)).map((p) => ({ personId: p.id, name: p.name }));
    fd.set("attendees", JSON.stringify(picked));
    if (fd.get("remind1d") === "on") fd.set("reminders", JSON.stringify([1440]));
    fd.set("allDay", allDay ? "1" : "0");
    setBusy(true);
    startTransition(async () => {
      const res = await portalDirectorCreateEvent(fd);
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Event scheduled.", { tone: "success" });
      setOpen(false); setAttendees([]);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-bg-elev ring-1 ring-border px-4 py-2 text-sm font-medium text-fg hover:bg-bg-muted transition-colors">
        <CalendarPlus size={15} /> New event / meeting
      </button>
    );
  }

  return (
    <Panel glass className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarPlus size={15} className="text-accent" />
        <span className="text-sm font-semibold">Schedule event / meeting</span>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-fg-muted hover:text-fg"><X size={15} /></button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="flex flex-col gap-3">
        <input name="title" required placeholder="Title (e.g. Board meeting — Q3)" className={inputCls} />
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-accent" /> All day
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-fg-muted">Start
            <input name="startAt" type={allDay ? "date" : "datetime-local"} required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-fg-muted">End (optional)
            <input name="endAt" type={allDay ? "date" : "datetime-local"} className={inputCls} />
          </label>
          <select name="companyId" defaultValue="" className={inputCls}>
            <option value="">Company (optional)…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input name="location" placeholder="Location or meet link" className={inputCls} />
        </div>
        <div>
          <div className="text-[11px] text-fg-muted mb-1">Attendees</div>
          <PeoplePicker people={people} value={attendees} onChange={setAttendees} emptyLabel="Add attendees" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
          <input type="checkbox" name="remind1d" className="accent-accent" /> Remind attendees 1 day before
        </label>
        <textarea name="description" rows={2} placeholder="Notes / agenda (optional)" className={inputCls} />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />} Schedule
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-fg-muted hover:text-fg px-2">Cancel</button>
        </div>
      </form>
    </Panel>
  );
}
