"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarPlus, Video, MapPin, Users, Bell, Building2, Download, Copy, Check,
  Pencil, Trash2, MessageCircle, CalendarDays, Mail, ChevronLeft, ChevronRight, Search,
  CheckSquare, Plane, Flag, RefreshCw, Cake, Award, UserCheck, Repeat, ExternalLink, Reply, MoreHorizontal, FileWarning, ClipboardList, X, type LucideIcon,
} from "lucide-react";
import { Button, Card, EmptyState, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { AttendeePicker } from "@/components/attendee-picker";
import { DatePopover } from "@/components/date-popover";
import { FluidSelect } from "@/components/fluid-select";
import { CompanyMultiSelect } from "@/components/company-multi-select";
import { Combobox } from "@/components/combobox";
import { ReferenceAdmin } from "@/components/reference-admin";
import { useToast } from "@/components/toast";
import { useContextActions } from "@/components/context-actions";
import { cn } from "@/lib/cn";
import type { CalendarEvent, CalendarAttendee } from "@/lib/calendar";
import { expandRecurrence } from "@/lib/ics";
import { type OverlayItem, type OverlayKind, OVERLAY_KINDS, OVERLAY_LABELS } from "@/lib/calendar-overlays-shared";
import { createEventAction, updateEventAction, deleteEventAction, sendEventInviteAction, ensureEventMeetLink, draftEventRemindersAction, draftEventFollowupAction, previewEventInviteAction, createEventCategory, renameEventCategory, mergeEventCategories, deleteEventCategory, skipEventOccurrence, restoreEventOccurrence } from "./actions";

// Persisted calendar view + filter preferences (localStorage). `disabledLayers`
// stores the OFF layers (so a newly-added layer defaults ON).
const PREFS_KEY = "cos.calendar.prefs.v1";
type CalendarPrefs = {
  view: ViewMode;
  search: string;
  companyFilter: string;
  sourceFilter: string;
  categoryFilter: string;
  disabledLayers: OverlayKind[];
  meetingsOnly: boolean;
  collapseRecurring: boolean;
};

const OVERLAY_META: Record<OverlayKind, { icon: LucideIcon; tone: string; dot: string }> = {
  task: { icon: CheckSquare, tone: "text-info", dot: "hsl(var(--info))" },
  leave: { icon: Plane, tone: "text-warn", dot: "hsl(var(--warn))" },
  holiday: { icon: Flag, tone: "text-success", dot: "hsl(var(--success))" },
  renewal: { icon: RefreshCw, tone: "text-danger", dot: "hsl(var(--danger))" },
  birthday: { icon: Cake, tone: "text-accent", dot: "hsl(var(--accent))" },
  anniversary: { icon: Award, tone: "text-accent", dot: "hsl(var(--accent))" },
  probation: { icon: UserCheck, tone: "text-warn", dot: "hsl(var(--warn))" },
  commitment: { icon: FileWarning, tone: "text-danger", dot: "hsl(var(--danger))" },
  pipeline: { icon: ClipboardList, tone: "text-info", dot: "hsl(var(--info))" },
};

export type CalendarEventView = CalendarEvent & {
  companyLabel: string | null;
  companyAccent: string | null;
  categoryName: string | null;
  googleUrl: string;
  icsPath: string;
};

type Person = { id: number; name: string; email: string | null };
type Company = { id: number; name: string; accent?: string | null };
type EventCategory = { id: number; name: string };
type ViewMode = "month" | "week" | "day" | "agenda";

// Distinct hues for category tags/dots, picked deterministically by id so a
// category keeps its colour without needing a stored colour column.
const CATEGORY_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16"];
function categoryColor(id: number): string {
  return CATEGORY_COLORS[Math.abs(id) % CATEGORY_COLORS.length];
}

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
/** Expand recurring events into concrete occurrences in a generous window.
 *  Occurrence dates come from the shared `expandRecurrence` helper so the grid
 *  and the exported .ics never disagree (ACTMEET-01/-02, COMPBIG-01/-02). */
function expandRecurring(events: CalendarEventView[]): CalendarEventView[] {
  const out: CalendarEventView[] = [];
  const winStart = Date.now() - 60 * 864e5;
  const winEnd = Date.now() + 400 * 864e5;
  for (const e of events) {
    if (!e.recurrence || e.recurrence === "none") { out.push(e); continue; }
    const dur = e.endAt ? new Date(e.endAt).getTime() - new Date(e.startAt).getTime() : 0;
    const occurrences = expandRecurrence({
      start: new Date(e.startAt),
      recurrence: e.recurrence,
      until: e.recurrenceUntil ? new Date(e.recurrenceUntil) : null,
      windowStart: winStart,
      windowEnd: winEnd,
      excluded: e.excludedDates,
    });
    for (const occ of occurrences) {
      out.push({
        ...e,
        startAt: occ.toISOString(),
        endAt: dur ? new Date(occ.getTime() + dur).toISOString() : e.endAt,
      });
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
  categories,
}: {
  events: CalendarEventView[];
  overlays?: OverlayItem[];
  people: Person[];
  companies: Company[];
  categories: EventCategory[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [manageCatsOpen, setManageCatsOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  useContextActions("calendar", [{ id: "new-event", label: "New event", icon: <CalendarPlus size={16} />, onClick: openNew, primary: true, tone: "accent" }], []);
  const [editing, setEditing] = useState<CalendarEventView | null>(null);
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; });
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [enabledLayers, setEnabledLayers] = useState<Set<OverlayKind>>(() => new Set(OVERLAY_KINDS));
  // "Meetings only" hides every overlay layer at once; "Hide repeats" collapses a
  // recurring series to one chip per period (with a ↻ badge) so it stops filling
  // the grid. Both persist across visits, like the other filters.
  const [meetingsOnly, setMeetingsOnly] = useState(false);
  const [collapseRecurring, setCollapseRecurring] = useState(false);
  const hydrated = useRef(false);

  // Restore the operator's last calendar view + filters (once, on mount). Reading
  // localStorage in a mount effect (not a useState initialiser) avoids an SSR
  // hydration mismatch. When nothing is saved, default to the Agenda view on a
  // phone (the 7-column month grid is cramped there).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<CalendarPrefs>;
        if (p.view && (["month", "week", "day", "agenda"] as const).includes(p.view)) setView(p.view);
        else if (window.innerWidth < 640) setView("agenda");
        if (typeof p.search === "string") setSearch(p.search);
        if (typeof p.companyFilter === "string") setCompanyFilter(p.companyFilter);
        if (typeof p.sourceFilter === "string") setSourceFilter(p.sourceFilter);
        if (typeof p.categoryFilter === "string") setCategoryFilter(p.categoryFilter);
        if (Array.isArray(p.disabledLayers)) {
          setEnabledLayers(new Set(OVERLAY_KINDS.filter((k) => !p.disabledLayers!.includes(k))));
        }
        if (typeof p.meetingsOnly === "boolean") setMeetingsOnly(p.meetingsOnly);
        if (typeof p.collapseRecurring === "boolean") setCollapseRecurring(p.collapseRecurring);
      } else if (window.innerWidth < 640) {
        setView("agenda");
      }
    } catch { /* corrupt/absent prefs → defaults */ }
    hydrated.current = true;
  }, []);

  // Persist filters whenever they change (skip the first render so we never write
  // defaults over a freshly-restored set).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const prefs: CalendarPrefs = {
        view, search, companyFilter, sourceFilter, categoryFilter,
        disabledLayers: OVERLAY_KINDS.filter((k) => !enabledLayers.has(k)),
        meetingsOnly, collapseRecurring,
      };
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* storage full / disabled → ignore */ }
  }, [view, search, companyFilter, sourceFilter, categoryFilter, enabledLayers, meetingsOnly, collapseRecurring]);

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
      if (categoryFilter !== "all") {
        if (categoryFilter === "none" ? e.categoryId != null : String(e.categoryId ?? "") !== categoryFilter) return false;
      }
      if (q) {
        const hay = [e.title, e.description, e.location, e.companyLabel, e.categoryName, ...e.attendees.map((a) => a.name)]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, companyFilter, sourceFilter, categoryFilter]);

  // Expand recurring events into individual occurrences across a wide window so
  // every view can page without refetching. Occurrences keep the base id (edit/
  // delete act on the whole series) but carry their own start/end.
  const expanded = useMemo(() => expandRecurring(filtered), [filtered]);

  // "Hide repeats": collapse a recurring series to ONE occurrence per view period
  // (month → once that month, week → once that week, day → as-is, agenda → the
  // next one only) so a weekly meeting stops drawing on every single date. The
  // ↻ badge on the chip signals it repeats. One-off events pass straight through.
  const collapsed = useMemo(() => {
    if (!collapseRecurring) return expanded;
    const ordered = [...expanded].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const seen = new Set<string>();
    const out: CalendarEventView[] = [];
    for (const e of ordered) {
      if (!e.recurrence || e.recurrence === "none") { out.push(e); continue; }
      const d = new Date(e.startAt);
      const bucket =
        view === "month" ? `${d.getUTCFullYear()}-${d.getUTCMonth()}`
        : view === "week" ? keyOfIso(startOfWeekMon(d).toISOString())
        : view === "day" ? keyOfIso(e.startAt)
        : "series"; // agenda → one entry per series (the earliest upcoming)
      const key = `${e.id}|${bucket}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }, [expanded, collapseRecurring, view]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventView[]>();
    for (const e of collapsed) {
      const k = keyOfIso(e.startAt);
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    for (const arr of map.values()) arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return map;
  }, [collapsed]);

  const overlayByDay = useMemo(() => {
    const map = new Map<string, OverlayItem[]>();
    if (meetingsOnly) return map; // hide every overlay layer at once
    for (const o of overlays) {
      if (!enabledLayers.has(o.kind)) continue;
      if (companyFilter !== "all" && o.companyId != null && String(o.companyId) !== companyFilter) continue;
      (map.get(o.dayKey) ?? map.set(o.dayKey, []).get(o.dayKey)!).push(o);
    }
    return map;
  }, [overlays, enabledLayers, companyFilter, meetingsOnly]);

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
          {/* The bottom nav-pill carries a page-action "+" on phones, so this
              toolbar button (which also wraps awkwardly on a narrow screen) is
              desktop-only — no duplicate create affordance on mobile. */}
          <Button onClick={openNew} className="gap-1.5 ml-auto hidden sm:inline-flex"><CalendarPlus size={16} /> New event</Button>
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
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-9 text-sm shrink-0">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {categories.length > 0 && <option value="none">Uncategorised</option>}
            </Select>
            <button type="button" onClick={() => setManageCatsOpen(true)}
              title="Add, rename or remove event categories"
              className="h-9 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-bg-muted ring-1 ring-border shrink-0">
              <Pencil size={13} /> Categories
            </button>
          </div>
        </div>

        {/* Noise controls — one-tap ways to calm a busy multi-company calendar. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setMeetingsOnly((v) => !v)}
            aria-pressed={meetingsOnly}
            title="Hide task deadlines, renewals, birthdays and other overlays — show only real events"
            className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition-colors",
              meetingsOnly ? "ring-accent/40 bg-accent/15 text-accent" : "ring-border bg-bg-subtle text-fg-muted hover:text-fg")}>
            <CalendarDays size={11} /> Meetings only
          </button>
          <button type="button" onClick={() => setCollapseRecurring((v) => !v)}
            aria-pressed={collapseRecurring}
            title="Collapse a recurring series to one entry per period (it still repeats — the ↻ badge shows it)"
            className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition-colors",
              collapseRecurring ? "ring-accent/40 bg-accent/15 text-accent" : "ring-border bg-bg-subtle text-fg-muted hover:text-fg")}>
            <Repeat size={11} /> Hide repeats
          </button>
        </div>

        {/* Overlay layer toggles (also act as a legend). Hidden while "Meetings
            only" is on — the layers do nothing then. */}
        {!meetingsOnly && availableLayers.length > 0 && (
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

      {/* Remounted on each open so its state seeds cleanly from `editing`. */}
      {formOpen && (
        <EventForm people={people} companies={companies} categories={categories} editing={editing} allEvents={events} onClose={() => setFormOpen(false)} />
      )}

      {manageCatsOpen && (
        <HrmsDialog open onClose={() => setManageCatsOpen(false)} width="sm"
          title={<span className="inline-flex items-center gap-2"><Pencil size={15} className="text-accent" /> Event categories</span>}
          sub="Name your meeting types (e.g. Board, Site visit, Review). Used to colour + filter the calendar.">
          <ReferenceAdmin
            items={categories.map((c) => ({ id: c.id, name: c.name }))}
            noun="category"
            addPlaceholder="Add a category — e.g. Board meeting"
            onCreate={createEventCategory}
            onRename={renameEventCategory}
            onMerge={mergeEventCategories}
            onDelete={deleteEventCategory}
            mergeNote="Its events move to the target category."
            deleteNote="Its events become uncategorised."
          />
        </HrmsDialog>
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
        <AgendaView events={collapsed.filter((e) => new Date(e.startAt).getTime() >= Date.now() - 12 * 3600_000)} onEdit={openEdit} />
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
      {event.categoryId != null && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(event.categoryId) }} title={event.categoryName ?? undefined} />
      )}
      {!event.allDay && <span className="tabular text-fg-muted shrink-0">{fmtTime(event.startAt)}</span>}
      {event.recurrence && event.recurrence !== "none" && <Repeat size={9} className="shrink-0 text-fg-subtle" />}
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

  // On phones the full chip grid is unreadable, so we show a condensed dots-per-
  // day grid and reveal the tapped day's events in a list below. Default to today
  // (or the 1st of the shown month if today is elsewhere) so the list is never
  // empty on open.
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const inThisMonth = cells.find((c) => keyOfDate(c) === todayKeyGlobal && c.getMonth() === cursor.getMonth());
    return inThisMonth ? todayKeyGlobal : keyOfDate(monthStart);
  });
  // When the month changes, re-anchor the mobile selection to today-or-1st.
  useEffect(() => {
    const todayInMonth = cells.some((c) => keyOfDate(c) === todayKeyGlobal && c.getMonth() === cursor.getMonth());
    setSelectedKey(todayInMonth ? todayKeyGlobal : keyOfDate(monthStart));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const selectedDate = cells.find((c) => keyOfDate(c) === selectedKey) ?? monthStart;
  const selEvs = byDay.get(selectedKey) ?? [];
  const selOvs = overlayByDay.get(selectedKey) ?? [];

  return (
    <>
      {/* Desktop / tablet — the full chip grid (unchanged). */}
      <div className="hidden sm:block bg-bg-elev ring-1 ring-border elevated rounded-2xl overflow-hidden">
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
                className={cn("min-h-[96px] text-left border-b border-r border-border/50 p-1.5 align-top transition-colors hover:bg-bg-subtle/40 focus:outline-none focus:ring-1 focus:ring-accent/50",
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

      {/* Phones — condensed dots-per-day grid; tap a day to list its events below. */}
      <div className="sm:hidden space-y-3">
        <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border/60 bg-bg-subtle/40">
            {dows.map((d) => (
              <div key={d} className="py-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle text-center">{d.charAt(0)}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const k = keyOfDate(cell);
              const evs = byDay.get(k) ?? [];
              const ovs = overlayByDay.get(k) ?? [];
              const inMonth = cell.getMonth() === cursor.getMonth();
              const isToday = k === todayKeyGlobal;
              const isSelected = k === selectedKey;
              // One dot per item (company colour for events, kind colour for
              // overlays), capped at 4 then "+N" so a busy day never overflows.
              const dots: string[] = [
                ...evs.map((e) => accentOf(e)),
                ...ovs.map((o) => OVERLAY_META[o.kind].dot),
              ];
              const total = dots.length;
              return (
                <button key={i} type="button" onClick={() => setSelectedKey(k)}
                  aria-pressed={isSelected}
                  className={cn("min-h-[44px] flex flex-col items-center justify-start gap-0.5 py-1 border-b border-r border-border/50 transition-colors focus:outline-none",
                    i % 7 === 6 && "border-r-0", !inMonth && "bg-bg-subtle/20", isSelected && "bg-accent-soft/40")}>
                  <span className={cn("text-[11px] inline-flex h-5 w-5 items-center justify-center rounded-full",
                    isToday ? "bg-accent text-white font-semibold" : isSelected ? "text-accent font-semibold" : inMonth ? "text-fg" : "text-fg-subtle")}>
                    {cell.getDate()}
                  </span>
                  <span className="flex items-center justify-center gap-[2px] h-2 leading-none">
                    {dots.slice(0, 4).map((c, di) => (
                      <span key={di} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                    {total > 4 && <span className="text-[8px] text-fg-subtle leading-none">+{total - 4}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tapped day's events */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-0.5">
            <span className="text-xs font-semibold">
              {selectedDate.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button type="button" onClick={() => onPickDay(selectedDate)}
              className="ml-auto text-[11px] text-accent hover:underline">Open day →</button>
          </div>
          {selEvs.length === 0 && selOvs.length === 0 ? (
            <p className="text-[13px] text-fg-subtle px-0.5 py-2">Nothing scheduled.</p>
          ) : (
            <div className="bg-bg-elev ring-1 ring-border elevated rounded-xl p-2 space-y-1">
              {selEvs.map((e) => <EventChip key={occKey(e)} event={e} onEdit={() => onEdit(e)} />)}
              {selOvs.map((o) => <OverlayChip key={o.id} item={o} />)}
            </div>
          )}
        </div>
      </div>
    </>
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
  const [preview, setPreview] = useState<{ subject: string; html: string; recipients: string[] } | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/e/${event.publicToken}`;

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
      else if (r.googleCancelled) toast("Event deleted — guests notified of the cancellation.", { tone: "success", duration: 6000 });
      else toast("Event deleted.", { tone: "success" });
    });
  }

  const emailCount = event.attendees.filter((a) => a.email).length;
  const isPast = new Date(event.endAt ?? event.startAt).getTime() < Date.now();

  function openPreview() {
    start(async () => {
      const r = await previewEventInviteAction(event.id, isPast ? "followup" : "invite");
      if (r.ok) setPreview({ subject: r.subject, html: r.html, recipients: r.recipients });
      else toast(r.error, { tone: "danger" });
    });
  }

  function draftReminders() {
    start(async () => {
      const r = await draftEventRemindersAction(event.id);
      if (r.ok) toast(`Drafted ${r.count} reminder${r.count === 1 ? "" : "s"} in the Outbox to review.`, { tone: "success", duration: 6000 });
      else toast(r.error, { tone: "danger" });
    });
  }
  function draftFollowup() {
    start(async () => {
      const r = await draftEventFollowupAction(event.id);
      if (r.ok) toast(`Drafted ${r.count} follow-up${r.count === 1 ? "" : "s"} in the Outbox to review.`, { tone: "success", duration: 6000 });
      else toast(r.error, { tone: "danger" });
    });
  }

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
              <a href={`/workbook?tab=meetings&open=${event.meetingId}`} className="inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink size={12} />Meeting</a>
            )}
            {event.taskId && (
              <a href="/?tab=tasks" className="inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink size={12} />Task</a>
            )}
          </div>

          {/* Desktop / tablet — the full action row (unchanged). */}
          <div className="hidden sm:flex flex-wrap items-center gap-1.5 mt-2.5">
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
                onClick={openPreview}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-muted/70 transition-colors disabled:opacity-50"
                title="See exactly what guests will receive before sending"
              >
                <Mail size={13} /> Preview
              </button>
            )}
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
            {emailCount > 0 && !isPast && (
              <button
                onClick={draftReminders}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-muted/70 transition-colors disabled:opacity-50"
                title="Draft reminder messages to attendees in the Outbox"
              >
                <Bell size={13} /> Remind
              </button>
            )}
            {emailCount > 0 && isPast && (
              <button
                onClick={draftFollowup}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-muted/70 transition-colors disabled:opacity-50"
                title="Draft a post-meeting follow-up to attendees in the Outbox"
              >
                <Reply size={13} /> Follow-up
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

          {/* Phones — primary actions stay at a 44px tap target; everything
              secondary folds into a kebab so nothing is crushed under-thumb. */}
          <div className="flex sm:hidden items-center gap-1.5 mt-2.5">
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-bg-muted hover:bg-bg-muted/70 text-sm font-medium transition-colors" title="Edit">
              <Pencil size={16} /> Edit
            </button>
            <a
              href={event.icsPath}
              className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-bg-muted hover:bg-bg-muted/70 transition-colors"
              title="Download .ics — saves to any calendar"
              aria-label="Download .ics"
            >
              <Download size={18} />
            </a>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-bg-muted hover:bg-bg-muted/70 transition-colors"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  sideOffset={6}
                  align="end"
                  className="z-[60] min-w-[180px] glass-menu rounded-xl p-1 shadow-pill ring-1 ring-border/70 text-sm"
                >
                  <DropdownMenu.Item asChild>
                    <a href={event.googleUrl} target="_blank" rel="noreferrer"
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted">
                      <CalendarDays size={15} /> Add to Google
                    </a>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={(e) => { e.preventDefault(); copyLink(); }}
                    className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted"
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />} Copy link
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={(e) => { e.preventDefault(); shareWhatsApp(); }}
                    className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted"
                  >
                    <MessageCircle size={15} /> Share
                  </DropdownMenu.Item>
                  {emailCount > 0 && (
                    <DropdownMenu.Item
                      disabled={pending}
                      onSelect={(e) => { e.preventDefault(); openPreview(); }}
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-50"
                    >
                      <Mail size={15} /> Preview email
                    </DropdownMenu.Item>
                  )}
                  {emailCount > 0 && (
                    <DropdownMenu.Item
                      disabled={pending}
                      onSelect={(e) => { e.preventDefault(); sendInvite(); }}
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none text-accent data-[highlighted]:bg-accent/10 data-[disabled]:opacity-50"
                    >
                      <Mail size={15} /> Send invite
                    </DropdownMenu.Item>
                  )}
                  {emailCount > 0 && !isPast && (
                    <DropdownMenu.Item
                      disabled={pending}
                      onSelect={(e) => { e.preventDefault(); draftReminders(); }}
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-50"
                    >
                      <Bell size={15} /> Remind attendees
                    </DropdownMenu.Item>
                  )}
                  {emailCount > 0 && isPast && (
                    <DropdownMenu.Item
                      disabled={pending}
                      onSelect={(e) => { e.preventDefault(); draftFollowup(); }}
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-50"
                    >
                      <Reply size={15} /> Follow-up
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="h-px bg-border my-1" />
                  <DropdownMenu.Item
                    disabled={pending}
                    onSelect={(e) => { e.preventDefault(); remove(); }}
                    className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none text-danger data-[highlighted]:bg-danger-soft data-[disabled]:opacity-50"
                  >
                    <Trash2 size={15} /> Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>

      {preview && (
        <HrmsDialog
          open
          onClose={() => setPreview(null)}
          width="lg"
          title={
            <span className="inline-flex items-center gap-2">
              <Mail size={16} className="text-accent" /> Email preview
            </span>
          }
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setPreview(null)}>Close</Button>
              {preview.recipients.length > 0 && !isPast && (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => { setPreview(null); sendInvite(); }}
                >
                  <Mail size={15} /> Send to {preview.recipients.length} {preview.recipients.length === 1 ? "guest" : "guests"}
                </Button>
              )}
            </>
          }
        >
          <div className="space-y-2">
            <div className="text-xs text-fg-muted">
              <span className="font-medium text-fg">Subject:</span> {preview.subject}
            </div>
            <div className="text-xs text-fg-muted">
              <span className="font-medium text-fg">To:</span>{" "}
              {preview.recipients.length ? preview.recipients.join(", ") : "No attendees with an email yet — add one to send."}
            </div>
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              className="w-full h-[420px] rounded-xl border border-border bg-white"
            />
          </div>
        </HrmsDialog>
      )}
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

// Time-of-day options every 15 min, e.g. { value: "14:30", label: "2:30 PM" }.
const TIME_OPTS: { value: string; label: string }[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? "AM" : "PM";
  return { value: `${hh}:${mm}`, label: `${h12}:${mm} ${ap}` };
});
const dateOf = (v: string) => (v || "").slice(0, 10);
const timeOf = (v: string) => (v && v.length >= 16 ? v.slice(11, 16) : "");
const composeDT = (date: string, time: string, allDay: boolean) =>
  !date ? "" : allDay ? date : `${date}T${time || "09:00"}`;

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
  categories,
  editing,
  allEvents,
  onClose,
}: {
  people: Person[];
  companies: Company[];
  categories: EventCategory[];
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
  // New events default to auto-adding a Google Meet link (existing events keep theirs).
  const [addMeet, setAddMeet] = useState(!editing);
  // New events: also track the meeting as a task (creates one task per company).
  const [companyIds, setCompanyIds] = useState<number[]>(editing?.companyId ? [editing.companyId] : []);
  const [trackTask, setTrackTask] = useState(!editing);

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

  // Per-occurrence skip: `editing` is the clicked OCCURRENCE (base id + this date).
  const isRecurring = !!editing && !!editing.recurrence && editing.recurrence !== "none";
  const occDateKey = editing ? new Date(editing.startAt).toISOString().slice(0, 10) : "";
  const alreadySkipped = editing?.excludedDates.includes(occDateKey) ?? false;
  function doSkip() {
    if (!editing) return;
    start(async () => {
      const r = await skipEventOccurrence(editing.id, occDateKey);
      if (r.ok) { toast("This date is cancelled — the rest of the series stays.", { tone: "success" }); onClose(); }
      else toast(r.error, { tone: "danger" });
    });
  }
  function doRestore(dateKey: string) {
    if (!editing) return;
    start(async () => {
      const r = await restoreEventOccurrence(editing.id, dateKey);
      if (r.ok) { toast("Date restored on your calendar.", { tone: "success" }); onClose(); }
      else toast(r.error, { tone: "danger" });
    });
  }

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
        // New event + Meet requested + no link pasted → mint one now (Google),
        // so the link exists on creation rather than only after sending invites.
        const taskNote = r.taskCodes?.length
          ? ` · task ${r.taskCodes.length === 1 ? r.taskCodes[0] : `${r.taskCodes.length} created`}`
          : "";
        const inviteNote = r.invited
          ? ` · invite emailed to ${r.invited} guest${r.invited === 1 ? "" : "s"}`
          : r.inviteNotConfigured
            ? " · email not switched on — share the invite manually"
            : "";
        if (!editing && addMeet && r.id && !String(fd.get("meetLink") ?? "").trim()) {
          const m = await ensureEventMeetLink(r.id);
          toast((m.meetLink ? "Event created — Google Meet link added." : "Event created.") + taskNote + inviteNote, { tone: r.inviteNotConfigured ? "warn" : "success" });
        } else if (editing && r.googleSynced) {
          toast("Event updated — guests notified of the change.", { tone: "success", duration: 6000 });
        } else {
          toast((editing ? "Event updated" : "Event created") + taskNote + inviteNote, { tone: r.inviteNotConfigured ? "warn" : "success" });
        }
        onClose();
      } else {
        toast(r.error, { tone: "danger" });
      }
    });
  }

  return (
    <HrmsDialog
      open
      onClose={onClose}
      width="lg"
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarPlus size={16} className="text-accent" />
          {editing ? "Edit event" : "New event"}
        </span>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          {/* `form` ties this submit button to the form below even though the
              footer renders outside it (HrmsDialog owns the footer slot). */}
          <Button type="submit" form="calendar-event-form" loading={pending}>
            {editing ? "Save changes" : "Create event"}
          </Button>
        </>
      }
    >
      <form id="calendar-event-form" action={submit} className="space-y-5">
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
            <div className="flex-1 min-w-[150px]">
              <FieldLabel>{allDay ? "Date" : "Start date"}</FieldLabel>
              <DatePopover block value={dateOf(startVal) || null} onChange={(d) => setStartVal(composeDT(d, timeOf(startVal), allDay))} />
            </div>
            {!allDay && (
              <div className="w-[128px]">
                <FieldLabel>Time</FieldLabel>
                <FluidSelect value={timeOf(startVal) || "09:00"} options={TIME_OPTS} onSelect={(t) => setStartVal(composeDT(dateOf(startVal), t, false))} />
              </div>
            )}
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-bg-elev text-sm cursor-pointer select-none hover:border-border-strong transition-colors">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-3.5 w-3.5 accent-[hsl(var(--accent))]" />
              All-day
            </label>
          </div>
          {!allDay && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[150px]">
                <FieldLabel>End date</FieldLabel>
                <DatePopover block value={dateOf(endVal) || null} onChange={(d) => setEndVal(composeDT(d, timeOf(endVal), false))} />
              </div>
              <div className="w-[128px]">
                <FieldLabel>Time</FieldLabel>
                <FluidSelect value={timeOf(endVal) || "10:00"} options={TIME_OPTS} onSelect={(t) => setEndVal(composeDT(dateOf(endVal), t, false))} />
              </div>
            </div>
          )}
          {/* Canonical values the server reads (kept in datetime-local / date shape). */}
          <input type="hidden" name="startAt" value={allDay ? dateOf(startVal) : (dateOf(startVal) ? composeDT(dateOf(startVal), timeOf(startVal) || "09:00", false) : "")} />
          {!allDay && <input type="hidden" name="endAt" value={dateOf(endVal) ? composeDT(dateOf(endVal), timeOf(endVal) || "10:00", false) : ""} />}

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
            {!editing && (
              <label className="mt-1.5 flex items-center gap-2 text-[11px] text-fg-muted cursor-pointer">
                <input type="checkbox" checked={addMeet} onChange={(e) => setAddMeet(e.target.checked)} className="accent-[var(--accent)]" />
                {addMeet ? "A Google Meet link is added when you create this event" : "No Meet link will be added"}
              </label>
            )}
          </div>
          <div>
            <FieldLabel>Location</FieldLabel>
            <Input name="location" defaultValue={editing?.location ?? ""} placeholder="Office, address…" />
          </div>
        </div>

        {/* Company — a searchable dropdown (multi-select). One task per selected
            company when tracked; the first is the event's lead company. */}
        <div>
          <FieldLabel>{companyIds.length > 1 ? `Companies · ${companyIds.length}` : "Company"}</FieldLabel>
          <CompanyMultiSelect companies={companies} value={companyIds} onChange={setCompanyIds} />
          {companyIds.length > 1 && (
            <p className="mt-1 text-[11px] text-fg-subtle">A task is created for each company; the first is the event&apos;s lead company.</p>
          )}
        </div>
        <input type="hidden" name="companyId" value={companyIds[0] ?? ""} />
        <input type="hidden" name="companyIds" value={JSON.stringify(companyIds)} />

        {/* Category — type a new one to create it on the fly, or pick an existing. */}
        <div className="sm:w-1/2">
          <FieldLabel>Category</FieldLabel>
          <Combobox
            name="category"
            options={categories.map((c) => c.name)}
            defaultValue={editing?.categoryName ?? ""}
            placeholder="e.g. Board meeting — or pick one"
            className="w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="sm:w-1/2">
          <FieldLabel>Repeats</FieldLabel>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>

        {recurrence !== "none" && (
          <div className="sm:w-1/2">
            <FieldLabel>Repeat until (optional)</FieldLabel>
            <Input type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)} />
          </div>
        )}

        {/* Per-occurrence skip — cancel JUST this date of a repeating event. Only
            shown when editing an existing recurring occurrence. */}
        {isRecurring && (
          <div className="rounded-xl bg-bg-subtle/60 ring-1 ring-border/70 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-fg-muted">This is one date of a repeating event — you can cancel just this one.</span>
              {alreadySkipped ? (
                <span className="text-[11px] font-medium text-danger shrink-0">This date is cancelled</span>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={doSkip} disabled={pending} className="shrink-0">
                  Skip {new Date(editing!.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </Button>
              )}
            </div>
            {editing!.excludedDates.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
                <span className="text-[11px] text-fg-subtle">Cancelled dates (tap to restore):</span>
                {editing!.excludedDates.map((d) => (
                  <button key={d} type="button" onClick={() => doRestore(d)} disabled={pending}
                    className="inline-flex items-center gap-1 rounded-full bg-danger-soft/40 px-2 py-0.5 text-[11px] text-danger ring-1 ring-danger/20 hover:bg-danger-soft/70 transition-colors">
                    {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} <X size={10} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Meeting-as-task: create a task to prep/follow the meeting (one per company). */}
        {!editing && (
          <label className="flex items-start gap-2.5 rounded-xl bg-bg-subtle ring-1 ring-border/70 px-3 py-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={trackTask}
              onChange={(e) => setTrackTask(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--accent))]"
            />
            <span className="text-sm">
              <span className="font-medium">
                {companyIds.length > 1 ? `Track as ${companyIds.length} tasks (one per company)` : "Track this meeting as a task"}
              </span>
              <span className="block text-[12px] text-fg-muted">
                {companyIds.length > 0
                  ? "Creates a task (no deadline) so you can prep and follow it through; it moves to In Progress when the meeting starts."
                  : "Pick a company above to create a follow-through task."}
              </span>
            </span>
          </label>
        )}
        <input type="hidden" name="trackAsTask" value={trackTask && companyIds.length > 0 ? "on" : "off"} />

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
      </form>
    </HrmsDialog>
  );
}
