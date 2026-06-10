"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarPlus, Video, MapPin, Users, Bell, Building2, Download, Copy, Check,
  Pencil, Trash2, MessageCircle, X, CalendarDays, Mail,
} from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import type { CalendarEvent, CalendarAttendee } from "@/lib/calendar";
import { createEventAction, updateEventAction, deleteEventAction, sendEventInviteAction } from "./actions";

export type CalendarEventView = CalendarEvent & {
  companyLabel: string | null;
  googleUrl: string;
  icsPath: string;
};

type Person = { id: number; name: string; email: string | null };
type Company = { id: number; name: string };

const EAT = "Africa/Dar_es_Salaam";

function fmtDayKey(iso: string): string {
  // Group by Dar es Salaam calendar day.
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: EAT, year: "numeric", month: "2-digit", day: "2-digit" });
}
function fmtDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "long" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: EAT, hour: "2-digit", minute: "2-digit" });
}

// ISO → value for <input type="datetime-local"> in Dar es Salaam wall-clock.
function isoToLocalInput(iso: string | null, allDay: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Shift to +03:00 then format.
  const shifted = new Date(d.getTime() + 3 * 3600_000);
  const s = shifted.toISOString();
  return allDay ? s.slice(0, 10) : s.slice(0, 16);
}

function reminderLabel(min: number | null): string | null {
  if (min == null) return null;
  if (min === 0) return "At start";
  if (min % 1440 === 0) return `${min / 1440}d before`;
  if (min % 60 === 0) return `${min / 60}h before`;
  return `${min}m before`;
}

export function CalendarBoard({
  events,
  people,
  companies,
}: {
  events: CalendarEventView[];
  people: Person[];
  companies: Company[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventView | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEventView[]>();
    for (const e of events) {
      const k = fmtDayKey(e.startAt);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return [...map.entries()].sort((a, b) => {
      // Keys are dd/mm/yyyy; sort by the first event's instant.
      return new Date(a[1][0].startAt).getTime() - new Date(b[1][0].startAt).getTime();
    });
  }, [events]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5">
          <CalendarPlus size={16} /> New event
        </Button>
      </div>

      {formOpen && (
        <EventForm
          people={people}
          companies={companies}
          editing={editing}
          onClose={() => setFormOpen(false)}
        />
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="No events yet"
          hint="Create an event to generate a calendar invite (.ics) and a Google Meet/Calendar link you can share."
        />
      ) : (
        <div className="space-y-5">
          {grouped.map(([key, evs]) => (
            <section key={key} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted px-1">
                {fmtDayLabel(evs[0].startAt)}
              </h3>
              <div className="space-y-2">
                {evs.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    onEdit={() => { setEditing(e); setFormOpen(true); }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event, onEdit }: { event: CalendarEventView; onEdit: () => void }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const icsUrl = origin + event.icsPath;

  function copyLink() {
    navigator.clipboard.writeText(icsUrl).then(() => {
      setCopied(true);
      toast("Calendar link copied", { tone: "success" });
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function shareWhatsApp() {
    const lines = [
      `📅 ${event.title}`,
      `${fmtDayLabel(event.startAt)}${event.allDay ? "" : ` · ${fmtTime(event.startAt)}`}`,
      event.meetLink ? `Join: ${event.meetLink}` : null,
      `Add to your calendar: ${icsUrl}`,
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  function remove() {
    if (!confirm("Delete this event?")) return;
    start(async () => {
      const r = await deleteEventAction(event.id);
      if (!r.ok) toast(r.error, { tone: "danger" });
    });
  }

  const emailCount = event.attendees.filter((a) => a.email).length;

  function sendInvite() {
    start(async () => {
      const r = await sendEventInviteAction(event.id);
      if (r.ok) {
        const who = `${r.count} ${r.count === 1 ? "person" : "people"}`;
        const msg = r.via === "google"
          ? `Added to ${who}'s Google Calendars${r.meetLink ? " · Meet link created" : ""}`
          : `Invite emailed to ${who}`;
        toast(msg, { tone: "success", duration: 5000 });
      } else {
        toast(r.error, { tone: r.reason === "not-configured" ? "warn" : "danger", duration: 6000 });
      }
    });
  }

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-14 text-center">
          <div className="text-sm font-semibold tabular-nums">{event.allDay ? "All day" : fmtTime(event.startAt)}</div>
          {!event.allDay && event.endAt && (
            <div className="text-[11px] text-fg-muted tabular-nums">{fmtTime(event.endAt)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug">{event.title}</div>
          {event.description && (
            <p className="text-sm text-fg-muted mt-0.5 line-clamp-2 whitespace-pre-wrap">{event.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-fg-muted">
            {event.companyLabel && (
              <span className="inline-flex items-center gap-1"><Building2 size={12} />{event.companyLabel}</span>
            )}
            {event.meetLink && (
              <a href={event.meetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                <Video size={12} />Meeting link
              </a>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1"><MapPin size={12} />{event.location}</span>
            )}
            {event.attendees.length > 0 && (
              <span className="inline-flex items-center gap-1"><Users size={12} />{event.attendees.length}</span>
            )}
            {reminderLabel(event.reminderMinutes) && (
              <span className="inline-flex items-center gap-1"><Bell size={12} />{reminderLabel(event.reminderMinutes)}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <a
              href={event.icsPath}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-muted/70 transition-colors"
              title="Download .ics — saves to any calendar"
            >
              <Download size={13} /> .ics
            </a>
            <a
              href={event.googleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-muted/70 transition-colors"
              title="Add to Google Calendar"
            >
              <CalendarDays size={13} /> Google
            </a>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-muted/70 transition-colors"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} Link
            </button>
            <button
              onClick={shareWhatsApp}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-muted/70 transition-colors"
            >
              <MessageCircle size={13} /> Share
            </button>
            {emailCount > 0 && (
              <button
                onClick={sendInvite}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                title={`Email the invite (.ics attached) to ${emailCount} attendee${emailCount === 1 ? "" : "s"}`}
              >
                <Mail size={13} /> Send invite
              </button>
            )}
            <div className="flex-1" />
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-bg-muted transition-colors" title="Edit">
              <Pencil size={14} />
            </button>
            <button onClick={remove} disabled={pending} className="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition-colors" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EventForm({
  people,
  companies,
  editing,
  onClose,
}: {
  people: Person[];
  companies: Company[];
  editing: CalendarEventView | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [picked, setPicked] = useState<CalendarAttendee[]>(editing?.attendees ?? []);

  function togglePerson(p: Person) {
    setPicked((cur) => {
      const exists = cur.find((a) => a.personId === p.id);
      if (exists) return cur.filter((a) => a.personId !== p.id);
      return [...cur, { personId: p.id, name: p.name, email: p.email ?? undefined }];
    });
  }

  function submit(fd: FormData) {
    fd.set("attendees", JSON.stringify(picked));
    if (allDay) fd.set("allDay", "1");
    if (editing) fd.set("id", String(editing.id));
    start(async () => {
      const r = editing ? await updateEventAction(fd) : await createEventAction(fd);
      if (r.ok) {
        toast(editing ? "Event updated" : "Event created", { tone: "success" });
        onClose();
      } else {
        toast(r.error, { tone: "danger" });
      }
    });
  }

  const inputCls = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
  const labelCls = "text-xs font-medium text-fg-muted";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{editing ? "Edit event" : "New event"}</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-muted"><X size={16} /></button>
      </div>
      <form action={submit} className="space-y-3">
        <div className="space-y-1">
          <label className={labelCls}>Title</label>
          <input name="title" required defaultValue={editing?.title ?? ""} className={inputCls} placeholder="e.g. Q3 review with Dar Spices" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All-day
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Start</label>
            <input
              name="startAt"
              required
              type={allDay ? "date" : "datetime-local"}
              defaultValue={isoToLocalInput(editing?.startAt ?? null, allDay)}
              className={inputCls}
            />
          </div>
          {!allDay && (
            <div className="space-y-1">
              <label className={labelCls}>End (optional)</label>
              <input
                name="endAt"
                type="datetime-local"
                defaultValue={isoToLocalInput(editing?.endAt ?? null, false)}
                className={inputCls}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Meeting link (Meet/Zoom/Teams)</label>
            <input name="meetLink" defaultValue={editing?.meetLink ?? ""} className={inputCls} placeholder="https://meet.google.com/..." />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Location (in person)</label>
            <input name="location" defaultValue={editing?.location ?? ""} className={inputCls} placeholder="Office, address…" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Company</label>
            <select name="companyId" defaultValue={editing?.companyId ?? ""} className={inputCls}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Reminder</label>
            <select name="reminderMinutes" defaultValue={editing?.reminderMinutes ?? ""} className={inputCls}>
              <option value="">No reminder</option>
              <option value="0">At start</option>
              <option value="10">10 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Description</label>
          <textarea name="description" defaultValue={editing?.description ?? ""} rows={2} className={inputCls} placeholder="Agenda, notes…" />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Attendees (their email is used in the invite)</label>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => {
              const on = !!picked.find((a) => a.personId === p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => togglePerson(p)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    on ? "bg-accent text-white border-accent" : "border-border hover:bg-bg-muted",
                    !p.email && "opacity-70"
                  )}
                  title={p.email ?? "No email on file — will appear as a guest without an invite"}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>{editing ? "Save" : "Create event"}</Button>
        </div>
      </form>
    </Card>
  );
}
