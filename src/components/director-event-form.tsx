"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarCheck, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { PeoplePicker } from "@/components/people-picker";
import { SwitchRow } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { CompanyMultiSelect } from "@/components/company-multi-select";
import { DateTimeField, dateOf, FIELD_TRIGGER } from "@/components/date-time-field";
import { DatePopover } from "@/components/date-popover";
import { useToast } from "./toast";
import { portalDirectorCreateEvent } from "@/app/portal/actions";

type Person = { id: number; name: string; companyId?: number | null; companyIds?: number[] };
type Company = { id: number; name: string };
type EventResult =
  | { ok: true; id?: number; meetLink?: string | null; sentCount?: number; sentVia?: "google" | "email"; sendNote?: string }
  | { ok: false; error: string };

// Every field is a defined, FILLED box (matching the task composer) so none of
// them read as "invisible", and every control is the same height.
const inputCls = "w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm text-fg placeholder:text-fg-muted transition-colors hover:ring-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
const selectBtn = "flex w-full items-center justify-between rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm transition-colors hover:ring-accent/40";
const FORM_ID = "director-event-form";

const RECURRENCE_OPTS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Companies a person belongs to — their primary company plus any extra links. */
function personCompanyIds(p: Person): number[] {
  if (p.companyIds && p.companyIds.length) return p.companyIds;
  return p.companyId != null ? [p.companyId] : [];
}

/** Schedule a calendar event / meeting, as an iPhone bottom-sheet. Used by
 *  managers (portal home) and directors (board smart-capture bar). Mirrors the
 *  command-centre event form: multi-company (one task per company), recurrence,
 *  Meet link, and "track as a task". Companies + attendees are permission-scoped
 *  by the caller (getScopedPickerData); attendees narrow to the picked
 *  company(ies) here. Can be driven externally (controlled `open` + `seedTitle`). */
export function DirectorEventForm({
  people, companies, open: controlledOpen, onOpenChange, seedTitle,
  action = portalDirectorCreateEvent, triggerLabel = "New event / meeting",
}: {
  people: Person[]; companies: Company[];
  open?: boolean; onOpenChange?: (v: boolean) => void; seedTitle?: string;
  action?: (fd: FormData) => Promise<EventResult>;
  triggerLabel?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternalOpen(v); };
  const [allDay, setAllDay] = useState(false);
  const [remind1d, setRemind1d] = useState(true);
  // Opt-in, not opt-out — see the note in calendar-board.tsx.
  const [addMeet, setAddMeet] = useState(false);
  const [trackTask, setTrackTask] = useState(true);
  const [attendees, setAttendees] = useState<number[]>([]);
  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [startVal, setStartVal] = useState("");
  const [endVal, setEndVal] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  // Attendees are scoped to the SELECTED company/companies (like the task
  // composer's Responsible people) so the picker stays short. Before a company is
  // chosen, or if none of the chosen companies have linked people, show the full
  // (already permission-scoped) list rather than an empty picker.
  const peopleForPicker = useMemo(() => {
    if (companyIds.length === 0) return people;
    const scoped = people.filter((p) => personCompanyIds(p).some((cid) => companyIds.includes(cid)));
    return scoped.length ? scoped : people;
  }, [people, companyIds]);

  // Drop any picked attendee who no longer belongs to a chosen company.
  useEffect(() => {
    const allowed = new Set(peopleForPicker.map((p) => p.id));
    setAttendees((cur) => {
      const kept = cur.filter((id) => allowed.has(id));
      return kept.length === cur.length ? cur : kept;
    });
  }, [peopleForPicker]);

  function reset() {
    setAttendees([]);
    setCompanyIds([]);
    setStartVal("");
    setEndVal("");
    setRecurrence("none");
    setRecurrenceUntil("");
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const picked = people.filter((p) => attendees.includes(p.id)).map((p) => ({ personId: p.id, name: p.name }));
    fd.set("attendees", JSON.stringify(picked));
    if (remind1d) fd.set("reminders", JSON.stringify([1440]));
    fd.set("allDay", allDay ? "1" : "0");
    fd.set("requestMeet", addMeet ? "1" : "0");
    // Multi-company → one task per company (server reads companyIds JSON; companyId
    // is the lead company for the event row).
    fd.set("companyId", companyIds[0] != null ? String(companyIds[0]) : "");
    fd.set("companyIds", JSON.stringify(companyIds));
    fd.set("recurrence", recurrence);
    fd.set("recurrenceUntil", recurrence !== "none" ? recurrenceUntil : "");
    fd.set("trackAsTask", trackTask && companyIds.length > 0 ? "on" : "off");
    setBusy(true);
    startTransition(async () => {
      const res = await action(fd);
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      const msg = res.meetLink
        ? `Meeting scheduled — Google Meet link added${res.sentCount ? ` · ${res.sentCount} invite${res.sentCount === 1 ? "" : "s"} sent` : ""}.`
        : res.sendNote
          ? res.sendNote
          : res.sentCount
            ? `Meeting scheduled — ${res.sentCount} invite${res.sentCount === 1 ? "" : "s"} sent.`
            : "Event scheduled.";
      toast(msg, { tone: "success" });
      setOpen(false);
      reset();
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
          <CalendarPlus size={15} /> {triggerLabel}
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
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}{" "}
            {companyIds.length > 1 && trackTask ? `Schedule · ${companyIds.length} tasks` : "Schedule"}
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
              <label className={fieldLabel}>{allDay ? "Date" : "Start"}</label>
              <DateTimeField name="startAt" allDay={allDay} value={startVal} onChange={setStartVal} defaultTime="09:00" />
            </div>
            {!allDay && (
              <div>
                <label className={fieldLabel}>End (optional)</label>
                <DateTimeField name="endAt" allDay={allDay} value={endVal} onChange={setEndVal} defaultTime="10:00" />
              </div>
            )}
          </div>

          <div>
            <label className={fieldLabel}>{companyIds.length > 1 ? `Companies · ${companyIds.length}` : "Company (optional)"}</label>
            <CompanyMultiSelect companies={companies} value={companyIds} onChange={setCompanyIds} buttonClassName={selectBtn} />
            {companyIds.length > 1 && (
              <p className="mt-1.5 text-[11px] text-accent">One task is created per company; the first is the event&apos;s lead company.</p>
            )}
          </div>

          <div>
            <label className={fieldLabel}>Location (optional)</label>
            <input name="location" placeholder={addMeet ? "Office address (a Meet link is added)" : "Office address or paste a link"} className={inputCls} />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Repeats</label>
              <FluidSelect value={recurrence} options={RECURRENCE_OPTS} onSelect={setRecurrence} buttonClassName={selectBtn} />
            </div>
            {recurrence !== "none" && (
              <div>
                <label className={fieldLabel}>Repeat until (optional)</label>
                <DatePopover block triggerClassName={FIELD_TRIGGER} value={recurrenceUntil ? dateOf(recurrenceUntil) : null} onChange={setRecurrenceUntil} />
              </div>
            )}
          </div>

          <SwitchRow
            label="Add Google Meet link"
            hint={addMeet ? "A Google Meet link is generated when you schedule" : "No video link will be added"}
            on={addMeet}
            onChange={setAddMeet}
          />

          <div>
            <label className={fieldLabel}>Attendees</label>
            <PeoplePicker people={peopleForPicker} value={attendees} onChange={setAttendees} emptyLabel="Add attendees" />
          </div>

          <SwitchRow label="Remind attendees" hint="One day before the event" on={remind1d} onChange={setRemind1d} />

          <SwitchRow
            label={companyIds.length > 1 ? `Track as ${companyIds.length} tasks` : "Track this meeting as a task"}
            hint={companyIds.length > 0 ? "Adds it to the task system to prep + follow through" : "Pick a company to track this meeting as a task"}
            on={trackTask && companyIds.length > 0}
            onChange={setTrackTask}
          />

          <div>
            <label className={fieldLabel}>Notes / agenda (optional)</label>
            <textarea name="description" rows={3} placeholder="What's it about?" className={inputCls} />
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
