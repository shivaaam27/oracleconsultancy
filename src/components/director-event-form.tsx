"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarCheck, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { PeoplePicker } from "@/components/people-picker";
import { SwitchRow } from "@/components/ui";
import { useToast } from "./toast";
import { portalDirectorCreateEvent } from "@/app/portal/actions";

type Person = { id: number; name: string };
type Company = { id: number; name: string };

const inputCls = "bare-field w-full rounded-xl ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40 caret-accent";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
const FORM_ID = "director-event-form";

/** Director-only: schedule a calendar event / meeting (any company), as an
 *  iPhone bottom-sheet. Can be driven externally (controlled `open` +
 *  `seedTitle`) by the board's smart capture bar. */
export function DirectorEventForm({
  people, companies, open: controlledOpen, onOpenChange, seedTitle,
}: {
  people: Person[]; companies: Company[];
  open?: boolean; onOpenChange?: (v: boolean) => void; seedTitle?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternalOpen(v); };
  const [allDay, setAllDay] = useState(false);
  const [remind1d, setRemind1d] = useState(true);
  const [attendees, setAttendees] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const picked = people.filter((p) => attendees.includes(p.id)).map((p) => ({ personId: p.id, name: p.name }));
    fd.set("attendees", JSON.stringify(picked));
    if (remind1d) fd.set("reminders", JSON.stringify([1440]));
    fd.set("allDay", allDay ? "1" : "0");
    setBusy(true);
    startTransition(async () => {
      const res = await portalDirectorCreateEvent(fd);
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Event scheduled.", { tone: "success" });
      setOpen(false);
      setAttendees([]);
      router.refresh();
    });
  }

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-bg-elev px-4 py-2 text-sm font-medium text-fg ring-1 ring-border transition-[background-color,transform] hover:bg-bg-muted active:scale-95"
        >
          <CalendarPlus size={15} /> New event / meeting
        </button>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule event / meeting"
        icon={<CalendarPlus size={17} />}
        footer={
          <button
            type="submit"
            form={FORM_ID}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />} Schedule
          </button>
        }
      >
        <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="flex flex-col gap-3.5">
          <div>
            <label className={fieldLabel}>Title</label>
            <input name="title" required defaultValue={seedTitle ?? ""} autoFocus={!!seedTitle} placeholder="Board meeting — Q3" className={inputCls} />
          </div>

          <SwitchRow label="All day" on={allDay} onChange={setAllDay} />

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Start</label>
              <input name="startAt" type={allDay ? "date" : "datetime-local"} required className={inputCls} />
            </div>
            <div>
              <label className={fieldLabel}>End (optional)</label>
              <input name="endAt" type={allDay ? "date" : "datetime-local"} className={inputCls} />
            </div>
            <div>
              <label className={fieldLabel}>Company (optional)</label>
              <select name="companyId" defaultValue="" className={inputCls}>
                <option value="">No company</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Location / meet link</label>
              <input name="location" placeholder="Office or video link" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={fieldLabel}>Attendees</label>
            <PeoplePicker people={people} value={attendees} onChange={setAttendees} emptyLabel="Add attendees" />
          </div>

          <SwitchRow label="Remind attendees" hint="One day before the event" on={remind1d} onChange={setRemind1d} />

          <div>
            <label className={fieldLabel}>Notes / agenda (optional)</label>
            <textarea name="description" rows={3} placeholder="What's it about?" className={inputCls} />
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
