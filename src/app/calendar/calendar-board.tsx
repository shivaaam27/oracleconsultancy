"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarPlus, Video, MapPin, Users, Bell, Building2, Download, Copy, Check,
  Pencil, Trash2, MessageCircle, X, CalendarDays, Mail, ChevronLeft, ChevronRight, Search,
  CheckSquare, Plane, Flag, RefreshCw, Cake, Award, UserCheck, Repeat, ExternalLink, type LucideIcon,
} from "lucide-react";
import { Button, Card, EmptyState, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { AttendeePicker } from "@/components/attendee-picker";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import type { CalendarEvent, CalendarAttendee } from "@/lib/calendar";
import { type OverlayItem, type OverlayKind, OVERLAY_KINDS, OVERLAY_LABELS } from "@/lib/calendar-overlays-shared";
import { createEventAction, updateEventAction, deleteEventAction, sendEventInviteAction } from "./actions";

const OVERLAY_META: Record<OverlayKind, { icon: LucideIcon; tone: string; dot: string }> = {
  task: { icon: CheckSquare, tone: "text-info", dot: "hsl(var(--info))" },
  leave: { icon: Plane, tone: "text-warn", dot: "hsl(var(--warn))" },
  holiday: { icon: Flag, tone: "text-success", dot: "hsl(var(--success))" },
  renewal: { icon: RefreshCw, tone: "text-danger", dot: "hsl(var(--danger))" },
  birthday: { icon: Cake, tone: "text-accent", dot: "hsl(var(--accent))" },
  anniversary: { icon: Award, tone: "text-accent", dot: "hsl(var(--accent))" },
  probation: { icon: UserCheck, tone: "text-warn", dot: "hsl(var(--warn))" },
};

export type CalendarEventView = CalendarEvent & {
  companyLabel: string | null;
  companyAccent: string | null;
  googleUrl: string;
  icsPath: string;
};

type Person = { id: number; name: string; email: string | null };
type Company = { id: number; name: string; accent?: string | null };
type ViewMode = "month" | "week" | "day" | "agenda";

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

/* ---- date helpers (Dar es Salaam has no DST; noon anchors avoid edges) ---- */
function keyOfDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: EAT });
}
function keyOfIso(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: EAT });
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n, 1);
  return x;
}
function startOfWeekMon(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setHours(12, 0, 0, 0);
  return addDays(x, -dow);
}
function accentOf(ev: CalendarEventView): string {
  return ev.companyAccent || "hsl(var(--accent))";
}
function occKey(e: CalendarEventView): string {
  return `${e.id}-${e.startAt}`;
}
/** Expand recurring events into concrete occurrences in a generous window. */
function expandRecurring(events: CalendarEventView[]): CalendarEventView[] {
  const out: CalendarEventView[] = [];
  const winStart = Date.now() - 60 * 864e5;
  const winEnd = Date.now() + 400 * 864e5;
  for (const e of events) {
    if (!e.recurrence || e.recurrence === "none") { out.push(e); continue; }
    const dur = e.endAt ? new Date(e.endAt).getTime() - new Date(e.startAt).getTime() : 0;
    const until = e.recurrenceUntil ? new Date(e.recurrenceUntil).getTime() : winEnd;
    const cap = Math.min(until, winEnd);
    let cur = new Date(e.startAt);
    let guard = 0;
    while (cur.getTime() <= cap && guard < 500) {
      if (cur.getTime() >= winStart) {
        out.push({ ...e, startAt: cur.toISOString(), endAt: dur ? new Date(cur.getTime() + dur).toISOString() : e.endAt });
      }
      const n = new Date(cur);
      if (e.recurrence === "daily") n.setDate(n.getDate() + 1);
      else if (e.recurrence === "weekly") n.setDate(n.getDate() + 7);
      else n.setMonth(n.getMonth() + 1);
      cur = n; guard++;
    }
  }
  return out;
}
const todayKeyGlobal = keyOfDate(new Date());

export function CalendarBoard({
  events,
  overlays = [],
  people,
  companies,
}: {
  events: CalendarEventView[];
  overlays?: OverlayItem[];
  people: Person[];
  companies: Company[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventView | null>(null);
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; });
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [enabledLayers, setEnabledLayers] = useState<Set<OverlayKind>>(() => new Set(OVERLAY_KINDS));

  function toggleLayer(k: OverlayKind) {
    setEnabledLayers((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  // Which overlay kinds actually have items, so we only show relevant toggles.
  const availableLayers = useMemo(() => {
    const s = new Set<OverlayKind>();
    for (const o of overlays) s.add(o.kind);
    return OVERLAY_KINDS.filter((k) => s.has(k));
  }, [overlays]);

  function openNew() { setEditing(null); setFormOpen(true); }
  function openEdit(e: CalendarEventView) { setEditing(e); setFormOpen(true); }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (companyFilter !== "all" && String(e.companyId ?? "") !== companyFilter) return false;
      if (sourceFilter !== "all" && (e.source || "manual") !== sourceFilter) return false;
      if (q) {
        const hay = [e.title, e.description, e.location, e.companyLabel, ...e.attendees.map((a) => a.name)]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, companyFilter, sourceFilter]);

  // Expand recurring events into individual occurrences across a wide window so
  // every view can page without refetching. Occurrences keep the base id (edit/
  // delete act on the whole series) but carry their own start/end.
  const expanded = useMemo(() => expandRecurring(filtered), [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventView[]>();
    for (const e of expanded) {
      const k = keyOfIso(e.startAt);
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    for (const arr of map.values()) arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return map;
  }, [expanded]);

  const overlayByDay = useMemo(() => {
    const map = new Map<string, OverlayItem[]>();
    for (const o of overlays) {
      if (!enabledLayers.has(o.kind)) continue;
      if (companyFilter !== "all" && o.companyId != null && String(o.companyId) !== companyFilter) continue;
      (map.get(o.dayKey) ?? map.set(o.dayKey, []).get(o.dayKey)!).push(o);
    }
    return map;
  }, [overlays, enabledLayers, companyFilter]);

  function step(dir: number) {
    if (view === "month") setCursor((c) => addMonths(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, 7 * dir));
    else if (view === "day") setCursor((c) => addDays(c, dir));
  }
  function goToday() { const d = new Date(); d.setHours(12, 0, 0, 0); setCursor(d); }

  const periodLabel = useMemo(() => {
    if (view === "agenda") return "Upcoming";
    if (view === "month") return cursor.toLocaleDateString("en-GB", { timeZone: EAT, month: "long", year: "numeric" });
    if (view === "day") return cursor.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "long" });
    const ws = startOfWeekMon(cursor); const we = addDays(ws, 6);
    return `${ws.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${we.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  }, [view, cursor]);

  const usedCompanies = useMemo(
    () => companies.filter((c) => events.some((e) => e.companyId === c.id)),
    [companies, events]
  );

  const views: ViewMode[] = ["month", "week", "day", "agenda"];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-bg-subtle p-1 ring-1 ring-border/60">
            {views.map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={cn("rounded-lg px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium capitalize transition-colors",
                  view === v ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                {v}
              </button>
            ))}
          </div>
          {view !== "agenda" && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => step(-1)} title="Previous"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted ring-1 ring-border"><ChevronLeft size={16} /></button>
              <button type="button" onClick={goToday}
                className="h-8 px-3 inline-flex items-center rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-bg-muted ring-1 ring-border">Today</button>
              <button type="button" onClick={() => step(1)} title="Next"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted ring-1 ring-border"><ChevronRight size={16} /></button>
            </div>
          )}
          <span className="text-sm font-semibold tracking-tight">{periodLabel}</span>
          <Button onClick={openNew} className="gap-1.5 ml-auto"><CalendarPlus size={16} /> New event</Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, person, place…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
            <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="h-9 text-sm shrink-0">
              <option value="all">All companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-9 text-sm shrink-0">
              <option value="all">All sources</option>
              <option value="manual">Manual</option>
              <option value="meeting">From meeting</option>
              <option value="task">From task</option>
            </Select>
          </div>
        </div>

        {/* Overlay layer toggles (also act as a legend) */}
        {availableLayers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-fg-subtle mr-0.5">Layers</span>
            {availableLayers.map((k) => {
              const m = OVERLAY_META[k]; const Icon = m.icon; const on = enabledLayers.has(k);
              return (
                <button key={k} type="button" onClick={() => toggleLayer(k)}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition-colors",
                    on ? "ring-border bg-bg-subtle text-fg" : "ring-border/60 text-fg-subtle opacity-60 hover:opacity-100")}>
                  <Icon size={11} className={on ? m.tone : ""} /> {OVERLAY_LABELS[k]}
                </button>
              );
            })}
          </div>
        )}

        {/* Company colour legend */}
        {usedCompanies.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
            {usedCompanies.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.accent || "hsl(var(--accent))" }} />
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <EventForm people={people} companies={companies} editing={editing} allEvents={events} onClose={() => setFormOpen(false)} />
      )}

      {filtered.length === 0 && view === "agenda" ? (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="No events"
          hint="Create an event to generate a calendar invite (.ics) and a Google Meet/Calendar link you can share."
        />
      ) : view === "month" ? (
        <MonthView cursor={cursor} byDay={byDay} overlayByDay={overlayByDay} onPickDay={(d) => { setCursor(d); setView("day"); }} onEdit={openEdit} />
      ) : view === "week" ? (
        <WeekView cursor={cursor} byDay={byDay} overlayByDay={overlayByDay} onPickDay={(d) => { setCursor(d); setView("day"); }} onEdit={openEdit} />
      ) : view === "day" ? (
        <DayView cursor={cursor} byDay={byDay} overlayByDay={overlayByDay} onEdit={openEdit} />
      ) : (
        <AgendaView events={expanded.filter((e) => new Date(e.startAt).getTime() >= Date.now() - 12 * 3600_000)} onEdit={openEdit} />
      )}
    </div>
  );
}

/* ----------------------------- Event chip ----------------------------- */
function EventChip({ event, onEdit }: { event: CalendarEventView; onEdit: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }}
      title={event.title}
      className="w-full text-left flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight hover:bg-bg-muted transition-colors"
      style={{ borderLeft: `3px solid ${accentOf(event)}` }}>
      {!event.allDay && <span className="tabular text-fg-muted shrink-0">{fmtTime(event.startAt)}</span>}
      <span className="truncate">{event.title}</span>
    </button>
  );
}

function OverlayChip({ item }: { item: OverlayItem }) {
  const m = OVERLAY_META[item.kind]; const Icon = m.icon;
  const cls = "w-full text-left flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-fg-muted hover:bg-bg-muted transition-colors";
  const inner = <><Icon size={11} className={cn("shrink-0", m.tone)} /><span className="truncate">{item.title}</span></>;
  return item.href
    ? <a href={item.href} onClick={(e) => e.stopPropagation()} className={cls}>{inner}</a>
    : <div className={cls}>{inner}</div>;
}

/* ------------------------------ Month view ---------------------------- */
function MonthView({
  cursor, byDay, overlayByDay, onPickDay, onEdit,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onPickDay: (d: Date) => void;
  onEdit: (e: CalendarEventView) => void;
}) {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const gridStart = startOfWeekMon(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60 bg-bg-subtle/40">
        {dows.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const k = keyOfDate(cell);
          const evs = byDay.get(k) ?? [];
          const ovs = overlayByDay.get(k) ?? [];
          const inMonth = cell.getMonth() === cursor.getMonth();
          const isToday = k === todayKeyGlobal;
          const chips = [
            ...evs.map((e) => <EventChip key={occKey(e)} event={e} onEdit={() => onEdit(e)} />),
            ...ovs.map((o) => <OverlayChip key={o.id} item={o} />),
          ];
          return (
            <button key={i} type="button" onClick={() => onPickDay(cell)}
              className={cn("min-h-[78px] sm:min-h-[96px] text-left border-b border-r border-border/50 p-1 sm:p-1.5 align-top transition-colors hover:bg-bg-subtle/40 focus:outline-none focus:ring-1 focus:ring-accent/50",
                i % 7 === 6 && "border-r-0", !inMonth && "bg-bg-subtle/20")}>
              <div className={cn("text-[11px] mb-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                isToday ? "bg-accent text-white font-semibold" : inMonth ? "text-fg" : "text-fg-subtle")}>
                {cell.getDate()}
              </div>
              <div className="space-y-0.5">
                {chips.slice(0, 3)}
                {chips.length > 3 && <div className="text-[10px] text-fg-subtle px-1.5">+{chips.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Week view ----------------------------- */
function WeekView({
  cursor, byDay, overlayByDay, onPickDay, onEdit,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onPickDay: (d: Date) => void;
  onEdit: (e: CalendarEventView) => void;
}) {
  const ws = startOfWeekMon(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((d, i) => {
        const k = keyOfDate(d);
        const evs = byDay.get(k) ?? [];
        const ovs = overlayByDay.get(k) ?? [];
        const isToday = k === todayKeyGlobal;
        return (
          <div key={i} className="bg-bg-elev ring-1 ring-border elevated rounded-xl overflow-hidden">
            <button type="button" onClick={() => onPickDay(d)}
              className={cn("w-full flex sm:flex-col items-center sm:items-start gap-1.5 px-2.5 py-1.5 border-b border-border/60 hover:bg-bg-subtle/40 transition-colors",
                isToday && "bg-accent-soft/40")}>
              <span className="text-[11px] uppercase tracking-wider text-fg-subtle">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <span className={cn("text-sm font-semibold", isToday && "text-accent")}>{d.getDate()}</span>
            </button>
            <div className="p-1.5 space-y-1 min-h-[44px]">
              {evs.length === 0 && ovs.length === 0
                ? <div className="text-[11px] text-fg-subtle px-1 py-1">—</div>
                : <>
                    {evs.map((e) => <EventChip key={occKey(e)} event={e} onEdit={() => onEdit(e)} />)}
                    {ovs.map((o) => <OverlayChip key={o.id} item={o} />)}
                  </>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- Day view ----------------------------- */
function DayView({
  cursor, byDay, overlayByDay, onEdit,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onEdit: (e: CalendarEventView) => void;
}) {
  const evs = byDay.get(keyOfDate(cursor)) ?? [];
  const ovs = overlayByDay.get(keyOfDate(cursor)) ?? [];
  if (evs.length === 0 && ovs.length === 0) {
    return <EmptyState icon={<CalendarDays size={28} />} title="Nothing scheduled" hint="No events on this day. Use New event to add one." />;
  }
  return (
    <div className="space-y-3">
      {ovs.length > 0 && (
        <Card className="p-2 space-y-0.5">
          {ovs.map((o) => <OverlayChip key={o.id} item={o} />)}
        </Card>
      )}
      <div className="space-y-2">{evs.map((e) => <EventRow key={occKey(e)} event={e} onEdit={() => onEdit(e)} />)}</div>
    </div>
  );
}

/* ------------------------------ Agenda view --------------------------- */
function AgendaView({ events, onEdit }: { events: CalendarEventView[]; onEdit: (e: CalendarEventView) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEventView[]>();
    for (const e of events) (map.get(keyOfIso(e.startAt)) ?? map.set(keyOfIso(e.startAt), []).get(keyOfIso(e.startAt))!).push(e);
    return [...map.entries()].sort((a, b) => new Date(a[1][0].startAt).getTime() - new Date(b[1][0].startAt).getTime());
  }, [events]);

  return (
    <div className="space-y-5">
      {grouped.map(([key, evs]) => (
        <section key={key} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted px-1">{fmtDayLabel(evs[0].startAt)}</h3>
          <div className="space-y-2">
            {evs.map((e) => <EventRow key={occKey(e)} event={e} onEdit={() => onEdit(e)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function EventRow({ event, onEdit }: { event: CalendarEventView; onEdit: () => void }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/e/${event.id}`;

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast("Share link copied", { tone: "success" });
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function shareWhatsApp() {
    const lines = [
      `📅 ${event.title}`,
      `${fmtDayLabel(event.startAt)}${event.allDay ? "" : ` · ${fmtTime(event.startAt)}`}`,
      event.meetLink ? `Join: ${event.meetLink}` : null,
      `Details & add to your calendar: ${shareUrl}`,
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
        const who = `${r.count} ${r.count === 1 ? "guest" : "guests"}`;
        const msg = r.via === "google"
          ? `Invite sent to ${who} via Google Calendar${r.meetLink ? " · Meet link created" : ""}. It's on your own calendar (organisers don't get an email); a copy is in your inbox.`
          : `Invite emailed to ${who}`;
        toast(msg, { tone: "success", duration: 7000 });
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
            {event.reminders.length > 0 && (
              <span className="inline-flex items-center gap-1" title={event.reminders.map((m) => reminderLabel(m)).filter(Boolean).join(", ")}>
                <Bell size={12} />{event.reminders.length === 1 ? reminderLabel(event.reminders[0]) : `${event.reminders.length} reminders`}
              </span>
            )}
            {event.recurrence && event.recurrence !== "none" && (
              <span className="inline-flex items-center gap-1 capitalize"><Repeat size={12} />{event.recurrence}</span>
            )}
            {event.meetingId && (
              <a href="/meeting" className="inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink size={12} />Meeting</a>
            )}
            {event.taskId && (
              <a href="/?tab=tasks" className="inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink size={12} />Task</a>
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

const REMINDER_OPTS: { v: number; label: string }[] = [
  { v: 0, label: "At start" },
  { v: 10, label: "10m" },
  { v: 30, label: "30m" },
  { v: 60, label: "1h" },
  { v: 1440, label: "1 day" },
  { v: 2880, label: "2 days" },
  { v: 10080, label: "1 week" },
];

const TEMPLATES: { label: string; durationMin: number; reminders: number[]; allDay?: boolean }[] = [
  { label: "30-min call", durationMin: 30, reminders: [10] },
  { label: "1-hour meeting", durationMin: 60, reminders: [60, 10] },
  { label: "Site visit", durationMin: 120, reminders: [1440, 60] },
  { label: "All-day", durationMin: 0, reminders: [1440], allDay: true },
];

// datetime-local / date string → instant (ms), interpreting wall-clock as +03:00.
function inputToMs(v: string, allDay: boolean): number | null {
  if (!v) return null;
  const d = allDay ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : new Date(`${v}:00+03:00`);
  const t = d.getTime();
  return isNaN(t) ? null : t;
}

function EventForm({
  people,
  companies,
  editing,
  allEvents,
  onClose,
}: {
  people: Person[];
  companies: Company[];
  editing: CalendarEventView | null;
  allEvents: CalendarEventView[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [picked, setPicked] = useState<CalendarAttendee[]>(editing?.attendees ?? []);
  const [reminders, setReminders] = useState<number[]>(editing?.reminders ?? []);
  const [recurrence, setRecurrence] = useState<string>(editing?.recurrence ?? "none");
  const [recurrenceUntil, setRecurrenceUntil] = useState<string>(editing?.recurrenceUntil ? editing.recurrenceUntil.slice(0, 10) : "");
  const [startVal, setStartVal] = useState<string>(isoToLocalInput(editing?.startAt ?? null, editing?.allDay ?? false));
  const [endVal, setEndVal] = useState<string>(isoToLocalInput(editing?.endAt ?? null, false));

  function toggleReminder(v: number) {
    setReminders((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => b - a));
  }
  function applyTemplate(t: typeof TEMPLATES[number]) {
    setAllDay(!!t.allDay);
    setReminders(t.reminders);
    if (!t.allDay && t.durationMin && startVal) {
      const ms = inputToMs(startVal, false);
      if (ms) setEndVal(isoToLocalInput(new Date(ms + t.durationMin * 60_000).toISOString(), false));
    }
  }

  // Overlap detection against existing timed events (ignores the event itself).
  const conflicts = useMemo(() => {
    if (allDay) return [];
    const s = inputToMs(startVal, false);
    if (s == null) return [];
    const e = inputToMs(endVal, false) ?? s + 60 * 60_000;
    return allEvents.filter((ev) => {
      if (editing && ev.id === editing.id) return false;
      if (ev.allDay) return false;
      const es = new Date(ev.startAt).getTime();
      const ee = ev.endAt ? new Date(ev.endAt).getTime() : es + 60 * 60_000;
      return s < ee && es < e;
    });
  }, [allDay, startVal, endVal, allEvents, editing]);

  function submit(fd: FormData) {
    fd.set("attendees", JSON.stringify(picked));
    fd.set("reminders", JSON.stringify(reminders));
    fd.set("recurrence", recurrence);
    fd.set("recurrenceUntil", recurrence !== "none" ? recurrenceUntil : "");
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

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border bg-bg-muted/40">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarPlus size={16} className="text-accent" />
          {editing ? "Edit event" : "New event"}
        </h3>
        <button onClick={onClose} className="p-1.5 -mr-1 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <form action={submit} className="p-5 space-y-5">
        {/* Title + when */}
        <div className="space-y-4">
          {!editing && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-fg-subtle mr-0.5">Quick</span>
              {TEMPLATES.map((t) => (
                <button key={t.label} type="button" onClick={() => applyTemplate(t)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-border bg-bg-subtle text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div>
            <FieldLabel>Title</FieldLabel>
            <Input name="title" required defaultValue={editing?.title ?? ""} placeholder="e.g. Q3 review with Dar Spices" className="font-medium" />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <FieldLabel>{allDay ? "Date" : "Start"}</FieldLabel>
              <Input
                name="startAt"
                required
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? startVal.slice(0, 10) : startVal}
                onChange={(e) => setStartVal(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="flex-1 min-w-[180px]">
                <FieldLabel>End</FieldLabel>
                <Input name="endAt" type="datetime-local" value={endVal} onChange={(e) => setEndVal(e.target.value)} />
              </div>
            )}
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-bg-elev text-sm cursor-pointer select-none hover:border-border-strong transition-colors">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-3.5 w-3.5 accent-[hsl(var(--accent))]" />
              All-day
            </label>
          </div>

          {conflicts.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-warn-soft/60 ring-1 ring-warn/30 px-3 py-2 text-xs text-warn">
              <Bell size={13} className="mt-0.5 shrink-0" />
              <span>Overlaps {conflicts.length} existing event{conflicts.length === 1 ? "" : "s"}: {conflicts.slice(0, 3).map((c) => c.title).join(", ")}{conflicts.length > 3 ? "…" : ""}</span>
            </div>
          )}
        </div>

        {/* Where */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Meeting link</FieldLabel>
            <Input name="meetLink" defaultValue={editing?.meetLink ?? ""} placeholder="Meet / Zoom / Teams URL" />
            <p className="mt-1 text-[11px] text-fg-subtle">Leave blank and Google creates a Meet link on send.</p>
          </div>
          <div>
            <FieldLabel>Location</FieldLabel>
            <Input name="location" defaultValue={editing?.location ?? ""} placeholder="Office, address…" />
          </div>
        </div>

        {/* Company + recurrence */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Company</FieldLabel>
            <Select name="companyId" defaultValue={editing?.companyId ?? ""}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Repeats</FieldLabel>
            <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </div>
        </div>

        {recurrence !== "none" && (
          <div className="sm:w-1/2">
            <FieldLabel>Repeat until (optional)</FieldLabel>
            <Input type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)} />
          </div>
        )}

        {/* Reminders */}
        <div>
          <FieldLabel>Reminders</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_OPTS.map((o) => {
              const on = reminders.includes(o.v);
              return (
                <button key={o.v} type="button" onClick={() => toggleReminder(o.v)}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                    on ? "bg-accent/15 text-accent ring-accent/40" : "ring-border text-fg-muted hover:text-fg bg-bg-subtle")}>
                  <Bell size={11} /> {o.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-fg-subtle">Pick one or more — each becomes an alarm in the invite.</p>
        </div>

        {/* Description */}
        <div>
          <FieldLabel>Description</FieldLabel>
          <Textarea name="description" defaultValue={editing?.description ?? ""} rows={2} placeholder="Agenda, notes…" />
        </div>

        {/* Attendees */}
        <div>
          <FieldLabel>Attendees</FieldLabel>
          <AttendeePicker people={people} value={picked} onChange={setPicked} />
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-border -mx-5 px-5 -mb-5 py-4 bg-bg-muted/30">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>{editing ? "Save changes" : "Create event"}</Button>
        </div>
      </form>
    </Card>
  );
}
