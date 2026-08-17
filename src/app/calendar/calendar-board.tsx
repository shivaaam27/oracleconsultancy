"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarPlus, Video, MapPin, Users, Bell, Building2, Download, Copy, Check,
  Pencil, Trash2, MessageCircle, CalendarDays, Mail, ChevronLeft, ChevronRight, Search,
  CheckSquare, Plane, Flag, RefreshCw, Cake, Award, UserCheck, Repeat, ExternalLink, Reply, MoreHorizontal, FileWarning, ClipboardList, X,
  Megaphone, Plus, Paperclip, Layers as LayersIcon, type LucideIcon,
} from "lucide-react";
import { Button, Card, EmptyState, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { useCreateParam } from "@/lib/use-create-param";
import type { Announcement, ReceiptStats } from "@/lib/announcements-shared";
import { ANNOUNCEMENT_TYPES } from "@/lib/announcements-shared";
import { nudgeAnnouncementAction } from "@/app/announcements/actions";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { AttendeePicker } from "@/components/attendee-picker";
import { DatePopover } from "@/components/date-popover";
import { FluidSelect } from "@/components/fluid-select";
import { isoToLocalInput as sharedIsoToLocalInput, TimeField } from "@/components/date-time-field";
import { CompanyMultiSelect } from "@/components/company-multi-select";
import { Combobox } from "@/components/combobox";
import { ReferenceAdmin } from "@/components/reference-admin";
import { EventAttachments, ReadSummary, type AttachedDoc, type EventPrefill } from "@/components/event-attachments";
import { listEventDocumentsAction } from "./attachment-actions";
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
  /** Papers attached to this entry — drives the paperclip on the card. */
  attachmentCount: number;
};

type Person = { id: number; name: string; email: string | null };
type Company = { id: number; name: string; accent?: string | null };
type EventCategory = { id: number; name: string };
type ViewMode = "month" | "week" | "day" | "agenda";
type BriefTab = "events" | "announcements";

/** An announcement enriched with live receipt stats for the Brief's
 *  Announcements tab (seen / acknowledged / audience total). */
export type BriefAnnouncement = Announcement & {
  live: boolean;
  scheduled: boolean;
  stats: ReceiptStats;
};

export type BriefCounts = {
  thisWeek: number;
  today: number;
  needInvites: number;
  unacknowledged: number;
};

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
// Moved to date-time-field.tsx (beside composeDT/dateOf/timeOf) when the portal
// event sheet needed the same conversion. Re-exported under the local name so
// every call site in this file reads exactly as it did.
const isoToLocalInput = sharedIsoToLocalInput;

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
  announcements = [],
  counts = { thisWeek: 0, today: 0, needInvites: 0, unacknowledged: 0 },
}: {
  events: CalendarEventView[];
  overlays?: OverlayItem[];
  people: Person[];
  companies: Company[];
  categories: EventCategory[];
  announcements?: BriefAnnouncement[];
  counts?: BriefCounts;
}) {
  const [tab, setTab] = useState<BriefTab>("events");
  const [formOpen, setFormOpen] = useState(false);
  const [manageCatsOpen, setManageCatsOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  useContextActions("calendar", [{ id: "new-event", label: "New event", icon: <CalendarPlus size={16} />, onClick: openNew, primary: true, tone: "accent" }], []);
  // /calendar?new=1 — the global New menu's "Event".
  useCreateParam("1", () => openNew());
  const [editing, setEditing] = useState<CalendarEventView | null>(null);
  const [view, setView] = useState<ViewMode>("agenda");
  const [needInvitesOnly, setNeedInvitesOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
    const now = Date.now();
    return events.filter((e) => {
      if (companyFilter !== "all" && String(e.companyId ?? "") !== companyFilter) return false;
      if (sourceFilter !== "all" && (e.source || "manual") !== sourceFilter) return false;
      if (categoryFilter !== "all") {
        if (categoryFilter === "none" ? e.categoryId != null : String(e.categoryId ?? "") !== categoryFilter) return false;
      }
      if (needInvitesOnly && !(new Date(e.startAt).getTime() >= now && !e.googleEventId && e.attendees.some((a) => a.email))) return false;
      if (q) {
        const hay = [e.title, e.description, e.location, e.companyLabel, e.categoryName, ...e.attendees.map((a) => a.name)]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, companyFilter, sourceFilter, categoryFilter, needInvitesOnly]);

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

  const views: ViewMode[] = ["agenda", "month", "week", "day"];
  const chip = "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-all";

  return (
    <div className="space-y-4">
      {/* ---- Hero: BRIEF · Events | Announcements · KPI pill ---- */}
      <section className="relative overflow-hidden rounded-3xl glass elevated p-4 sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.22), transparent 70%)" }} />
        <div className="relative flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="min-w-0 sm:flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">
              Brief
              <span className="relative inline-flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full bg-success opacity-50 motion-safe:animate-ping" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" /></span>
              <span className="normal-case tracking-normal text-success/90">live</span>
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">The week, briefed</h1>
          </div>
          {/* Tabs only — the hero never carries an "add" button (CC rule). */}
          <span className="inline-flex items-center gap-0.5 self-start rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border/60 sm:self-auto">
            <button type="button" onClick={() => setTab("events")} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all", tab === "events" ? "bg-accent font-medium text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
              <CalendarDays size={13} /> Events
            </button>
            <button type="button" onClick={() => setTab("announcements")} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all", tab === "announcements" ? "bg-accent font-medium text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
              <Megaphone size={13} /> Announcements
              {counts.unacknowledged > 0 && <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-bold text-white">{counts.unacknowledged}</span>}
            </button>
          </span>
        </div>
        {/* KPI pill — clean stat units (wrap as whole items, no floating separators). */}
        <div className="relative mt-3 flex flex-wrap gap-x-5 gap-y-1.5 rounded-2xl bg-bg-elev/55 px-3.5 py-2.5 text-sm ring-1 ring-border">
          <span className="inline-flex items-baseline gap-1.5"><b className="font-semibold tabular text-fg">{counts.thisWeek}</b><span className="text-fg-muted">this week</span></span>
          <span className="inline-flex items-baseline gap-1.5"><b className="font-semibold tabular text-fg">{counts.today}</b><span className="text-fg-muted">today</span></span>
          <span className="inline-flex items-baseline gap-1.5"><b className={cn("font-semibold tabular", counts.needInvites > 0 ? "text-warn" : "text-fg")}>{counts.needInvites}</b><span className="text-fg-muted">need invites</span></span>
          <span className="inline-flex items-baseline gap-1.5"><b className={cn("font-semibold tabular", counts.unacknowledged > 0 ? "text-violet-500" : "text-fg")}>{counts.unacknowledged}</b><span className="text-fg-muted">unacknowledged</span></span>
        </div>
      </section>

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
            noun="category" addPlaceholder="Add a category — e.g. Board meeting"
            onCreate={createEventCategory} onRename={renameEventCategory} onMerge={mergeEventCategories} onDelete={deleteEventCategory}
            mergeNote="Its events move to the target category." deleteNote="Its events become uncategorised."
          />
        </HrmsDialog>
      )}

      {tab === "announcements" ? (
        <AnnouncementsPanel announcements={announcements} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-3">
            {/* New button + search. On mobile the New button sits ABOVE the search
                full-width (flex-col-reverse); on desktop it's to the right of it.
                The hero itself never carries an add button (CC rule). */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:flex-1">
                <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, people, companies…"
                  className="w-full rounded-full border border-border/70 bg-bg-elev py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-fg-subtle focus:border-accent/50 focus:ring-2 focus:ring-accent/15" />
              </div>
              {tab === "events" ? (
                <button type="button" onClick={openNew} className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition-all hover:opacity-90 sm:w-auto sm:py-2">
                  <Plus size={15} /> New event
                </button>
              ) : (
                <Link href="/announcements" className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition-all hover:opacity-90 sm:w-auto sm:py-2">
                  <Plus size={15} /> New announcement
                </Link>
              )}
            </div>
            {/* ONE filter row — tasks-page grammar (rounded-lg chips, outline icons). */}
            <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {views.map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={cn(chip, "capitalize", view === v ? "bg-accent text-accent-fg ring-accent font-semibold" : "bg-bg-elev text-fg-muted ring-border/60 hover:text-fg hover:ring-2")}>
                  {v}
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
              {counts.needInvites > 0 && (
                <button type="button" onClick={() => setNeedInvitesOnly((v) => !v)}
                  className={cn(chip, needInvitesOnly ? "bg-warn text-white ring-warn font-semibold" : "bg-warn-soft/50 text-warn ring-warn/25 hover:ring-2")}>
                  <Bell size={13} /> Need invites <b className="font-bold tabular">{counts.needInvites}</b>
                </button>
              )}
              <div className="shrink-0"><FluidSelect value={companyFilter} onSelect={setCompanyFilter}
                options={[{ value: "all", label: "Companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
                buttonClassName="rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium" /></div>
              <div className="shrink-0"><FluidSelect value={categoryFilter} onSelect={setCategoryFilter}
                options={[{ value: "all", label: "Types" }, ...categories.map((c) => ({ value: String(c.id), label: c.name })), ...(categories.length ? [{ value: "none", label: "Uncategorised" }] : [])]}
                buttonClassName="rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium" /></div>
              {/* ⋯ More — source, noise controls, category manager. */}
              <DropdownMenu.Root open={moreOpen} onOpenChange={setMoreOpen}>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={cn(chip, "bg-bg-elev text-fg-muted ring-border/60 hover:text-fg hover:ring-2")}>
                    <MoreHorizontal size={13} /> More
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-[140] w-56 glass glass-menu elevated rounded-2xl p-1.5 shadow-lg text-sm">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Source</div>
                    {[{ v: "all", l: "All sources" }, { v: "manual", l: "Manual" }, { v: "meeting", l: "From meeting" }, { v: "task", l: "From task" }].map((s) => (
                      <button key={s.v} type="button" onClick={() => setSourceFilter(s.v)} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", sourceFilter === s.v ? "bg-accent/12 font-medium text-fg" : "text-fg-muted hover:bg-bg-muted")}>
                        <span className="flex-1">{s.l}</span>{sourceFilter === s.v && <Check size={14} className="text-accent" />}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-border/60" />
                    <button type="button" onClick={() => setMeetingsOnly((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-fg-muted hover:bg-bg-muted">
                      <CalendarDays size={14} /><span className="flex-1">Meetings only</span>{meetingsOnly && <Check size={14} className="text-accent" />}
                    </button>
                    <button type="button" onClick={() => setCollapseRecurring((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-fg-muted hover:bg-bg-muted">
                      <Repeat size={14} /><span className="flex-1">Hide repeats</span>{collapseRecurring && <Check size={14} className="text-accent" />}
                    </button>
                    <div className="my-1 h-px bg-border/60" />
                    <button type="button" onClick={() => { setMoreOpen(false); setManageCatsOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-fg-muted hover:bg-bg-muted">
                      <Pencil size={14} /><span className="flex-1">Manage categories</span>
                    </button>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              {/* Period nav for the grid views. */}
              {view !== "agenda" && (
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => step(-1)} title="Previous" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted ring-1 ring-border/60 hover:text-fg hover:ring-2"><ChevronLeft size={15} /></button>
                  <button type="button" onClick={goToday} className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-fg-muted ring-1 ring-border/60 hover:text-fg hover:ring-2">Today</button>
                  <button type="button" onClick={() => step(1)} title="Next" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted ring-1 ring-border/60 hover:text-fg hover:ring-2"><ChevronRight size={15} /></button>
                </span>
              )}
            </div>
            {view !== "agenda" && <p className="px-0.5 text-sm font-semibold tracking-tight">{periodLabel}</p>}

            {/* Views */}
            {view === "agenda" ? (
              <HousedAgenda
                events={collapsed.filter((e) => new Date(e.startAt).getTime() >= Date.now() - 12 * 3600_000)}
                overlayByDay={overlayByDay} onEdit={openEdit}
              />
            ) : view === "month" ? (
              <MonthView cursor={cursor} byDay={byDay} overlayByDay={overlayByDay} onPickDay={(d) => { setCursor(d); setView("day"); }} onEdit={openEdit} />
            ) : view === "week" ? (
              <WeekView cursor={cursor} byDay={byDay} overlayByDay={overlayByDay} onPickDay={(d) => { setCursor(d); setView("day"); }} onEdit={openEdit} />
            ) : (
              <DayView cursor={cursor} byDay={byDay} overlayByDay={overlayByDay} onEdit={openEdit} />
            )}
          </div>

          {/* ---- The rail (desktop lg+): mini-month · layers · announcements ---- */}
          <BriefRail
            cursor={cursor} byDay={byDay} overlayByDay={overlayByDay}
            onPickDay={(d) => { setCursor(d); setView("day"); }}
            availableLayers={availableLayers} enabledLayers={enabledLayers} toggleLayer={toggleLayer} meetingsOnly={meetingsOnly}
            announcements={announcements}
          />
        </div>
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

/** A full overlay row for the day-sheet — a tinted icon badge, the title, and a
 *  quiet kind label, in the rounded-rectangle grammar (outline icons only). */
function OverlayRow({ item }: { item: OverlayItem }) {
  const m = OVERLAY_META[item.kind]; const Icon = m.icon; const c = m.dot;
  const inner = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)` }}>
        <Icon size={15} style={{ color: c }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg">{item.title}</span>
        <span className="block text-[11px] text-fg-subtle">{OVERLAY_LABELS[item.kind]}</span>
      </span>
      {item.href && <ExternalLink size={13} className="shrink-0 text-fg-subtle" />}
    </>
  );
  const cls = "flex items-center gap-2.5 rounded-xl bg-bg-elev px-3 py-2 ring-1 ring-border/60 transition-all hover:ring-accent/30";
  return item.href
    ? <a href={item.href} className={cls}>{inner}</a>
    : <div className={cls}>{inner}</div>;
}

/** Shared "what's on this day" sheet — events as full rows, then overlays
 *  (deadlines, renewals, birthdays…) as a housed "Also on this day" group.
 *  Used by the Day view and the mobile month panel. */
function DaySheet({
  evs, ovs, onEdit,
}: {
  evs: CalendarEventView[];
  ovs: OverlayItem[];
  onEdit: (e: CalendarEventView) => void;
}) {
  if (evs.length === 0 && ovs.length === 0) {
    return <EmptyState icon={<CalendarDays size={28} />} title="Nothing scheduled" hint="No events on this day. Use New event to add one." />;
  }
  return (
    <div className="space-y-3">
      {evs.length > 0 && <div className="space-y-2">{evs.map((e) => <EventRow key={occKey(e)} event={e} onEdit={() => onEdit(e)} />)}</div>}
      {ovs.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-bg-elev/40 ring-1 ring-border/60">
          <div className="border-b border-border/60 bg-bg-subtle/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            {evs.length > 0 ? "Also on this day" : "On this day"} · {ovs.length}
          </div>
          <div className="space-y-1.5 p-2">{ovs.map((o) => <OverlayRow key={o.id} item={o} />)}</div>
        </section>
      )}
    </div>
  );
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

        {/* Tapped day's events — the day-sheet card grammar. */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-0.5">
            <span className="text-sm font-semibold">
              {selectedDate.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button type="button" onClick={() => onPickDay(selectedDate)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-accent">
              Open day →
            </button>
          </div>
          <DaySheet evs={selEvs} ovs={selOvs} onEdit={onEdit} />
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
  return <DaySheet evs={evs} ovs={ovs} onEdit={onEdit} />;
}

/* -------------------------- Housed agenda (Brief) --------------------- */
/** True when an upcoming event has email attendees but no Google event yet — the
 *  "invite not sent" signal (mirrors the page's needInvites count). */
function eventNeedsInvite(e: CalendarEventView): boolean {
  return new Date(e.startAt).getTime() >= Date.now() && !e.googleEventId && e.attendees.some((a) => a.email);
}

/** The Brief agenda: each day is a housing with a tinted header (today glows with
 *  a live ● ring), the day's events as rows, and an overlay footer (birthdays,
 *  deadlines, leave…). */
function HousedAgenda({
  events, overlayByDay, onEdit,
}: {
  events: CalendarEventView[];
  overlayByDay: Map<string, OverlayItem[]>;
  onEdit: (e: CalendarEventView) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEventView[]>();
    for (const e of events) (map.get(keyOfIso(e.startAt)) ?? map.set(keyOfIso(e.startAt), []).get(keyOfIso(e.startAt))!).push(e);
    return [...map.entries()].sort((a, b) => new Date(a[1][0].startAt).getTime() - new Date(b[1][0].startAt).getTime());
  }, [events]);

  if (grouped.length === 0) {
    return (
      <EmptyState icon={<CalendarDays size={28} />} title="Nothing coming up"
        hint="Create an event to generate a calendar invite (.ics) and a Google Meet link you can share." />
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map(([key, evs]) => {
        const isToday = key === todayKeyGlobal;
        const ovs = overlayByDay.get(key) ?? [];
        return (
          <section key={key} className={cn("overflow-hidden rounded-2xl bg-bg-elev/40 ring-1", isToday ? "ring-accent/30" : "ring-border/60")}>
            <div className={cn("flex items-center gap-2 border-b px-3.5 py-2.5", isToday ? "border-accent/20 bg-accent-soft/40" : "border-border/60 bg-bg-subtle/60")}>
              {isToday && <span className="relative inline-flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full bg-accent opacity-50 motion-safe:animate-ping" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" /></span>}
              <span className={cn("text-[12.5px] font-semibold", isToday && "text-accent")}>{isToday ? "Today · " : ""}{fmtDayLabel(evs[0].startAt)}</span>
              <span className="ml-auto text-[10.5px] text-fg-subtle">{evs.length} event{evs.length === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-2 p-2">
              {evs.map((e) => <EventRow key={occKey(e)} event={e} onEdit={() => onEdit(e)} />)}
            </div>
            {ovs.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border/60 bg-bg-subtle/30 px-3.5 py-2">
                {ovs.map((o) => {
                  const m = OVERLAY_META[o.kind]; const Icon = m.icon;
                  return <span key={o.id} className="inline-flex items-center gap-1 text-[11px] text-fg-muted"><Icon size={12} className={m.tone} /> {o.title}</span>;
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ----------------------------- Mini month (rail) ---------------------- */
function MiniMonth({
  cursor, byDay, overlayByDay, onPickDay,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onPickDay: (d: Date) => void;
}) {
  // The mini-month browses MONTH-by-MONTH on its own (a calendar's chevrons page
  // months), independent of the main view's period nav (< Today >). Re-syncs to
  // the shown month whenever the main cursor jumps (e.g. Today / picking a day).
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12));
  useEffect(() => { setViewMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12)); }, [cursor]);
  const monthStart = viewMonth;
  const gridStart = startOfWeekMon(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthLabel = viewMonth.toLocaleDateString("en-GB", { timeZone: EAT, month: "long", year: "numeric" });
  return (
    <div className="rounded-2xl bg-bg-elev/50 p-3 ring-1 ring-border/60">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{monthLabel}</span>
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => setViewMonth((m) => addMonths(m, -1))} title="Previous month" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-fg"><ChevronLeft size={13} /></button>
          <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} title="Next month" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-fg"><ChevronRight size={13} /></button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="pb-1 text-[8px] font-medium uppercase text-fg-subtle">{d}</span>)}
        {cells.map((cell, i) => {
          const k = keyOfDate(cell);
          const evs = byDay.get(k) ?? [];
          const ovs = overlayByDay.get(k) ?? [];
          const inMonth = cell.getMonth() === viewMonth.getMonth();
          const isToday = k === todayKeyGlobal;
          const dots = [...evs.map((e) => accentOf(e)), ...ovs.map((o) => OVERLAY_META[o.kind].dot)].slice(0, 3);
          return (
            <button key={i} type="button" onClick={() => onPickDay(cell)}
              className={cn("relative flex h-8 flex-col items-center justify-center rounded-md text-[10px] transition-colors hover:bg-bg-muted",
                isToday ? "bg-accent font-semibold text-white" : inMonth ? "text-fg" : "text-fg-subtle/60")}>
              {cell.getDate()}
              {dots.length > 0 && (
                <span className="absolute bottom-0.5 flex gap-[1.5px]">
                  {dots.map((c, di) => <span key={di} className="h-[3px] w-[3px] rounded-full" style={{ backgroundColor: isToday ? "#fff" : c }} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Brief rail ---------------------------- */
function BriefRail({
  cursor, byDay, overlayByDay, onPickDay,
  availableLayers, enabledLayers, toggleLayer, meetingsOnly, announcements,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onPickDay: (d: Date) => void;
  availableLayers: OverlayKind[];
  enabledLayers: Set<OverlayKind>;
  toggleLayer: (k: OverlayKind) => void;
  meetingsOnly: boolean;
  announcements: BriefAnnouncement[];
}) {
  const live = announcements.filter((a) => a.live);
  return (
    <aside className="hidden space-y-3 lg:block">
      <MiniMonth cursor={cursor} byDay={byDay} overlayByDay={overlayByDay} onPickDay={onPickDay} />

      {!meetingsOnly && availableLayers.length > 0 && (
        <div className="rounded-2xl bg-bg-elev/50 p-3 ring-1 ring-border/60">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"><LayersIcon size={12} /> Layers</p>
          <div className="flex flex-wrap gap-1.5">
            {availableLayers.map((k) => {
              const m = OVERLAY_META[k]; const Icon = m.icon; const on = enabledLayers.has(k);
              return (
                <button key={k} type="button" onClick={() => toggleLayer(k)}
                  className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium ring-1 transition-colors",
                    on ? "bg-bg-subtle text-fg ring-border" : "text-fg-subtle opacity-55 ring-border/60 hover:opacity-100")}>
                  <Icon size={11} className={on ? m.tone : ""} /> {OVERLAY_LABELS[k]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-bg-elev/50 p-3 ring-1 ring-border/60">
        <div className="mb-1.5 flex items-center gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-500"><Megaphone size={12} /> Announcements</p>
          <Link href="/announcements" className="ml-auto text-[10.5px] font-medium text-accent hover:underline">Manage →</Link>
        </div>
        {live.length === 0 ? (
          <p className="text-[11px] text-fg-subtle">Nothing live right now.</p>
        ) : (
          <div className="space-y-2">
            {live.slice(0, 2).map((a) => {
              const pct = a.stats.total ? Math.round((a.stats.ack / a.stats.total) * 100) : 0;
              return (
                <div key={a.id} className="rounded-xl border-l-2 border-violet-400 bg-bg-elev px-2.5 py-1.5 ring-1 ring-border/50">
                  <p className="truncate text-[11px] font-medium text-fg">{a.title}</p>
                  {a.requireAck && (
                    <>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-violet-100"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} /></div>
                      <p className="mt-0.5 text-[9.5px] text-fg-subtle">{a.stats.ack}/{a.stats.total} acknowledged</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function EventRow({ event, onEdit }: { event: CalendarEventView; onEdit: () => void }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; recipients: string[] } | null>(null);
  // Delete confirmation (Aurora dialog, replaces the native confirm). For a
  // recurring event the operator chooses this-date-only vs the whole series.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isRecurring = !!event.recurrence && event.recurrence !== "none";
  // UTC-derived key — MUST match how excluded dates + occurrence meeting_dates are
  // stored elsewhere (edit-form skip + deleteTaskForOccurrence).
  const occDateKey = new Date(event.startAt).toISOString().slice(0, 10);
  const [delScope, setDelScope] = useState<"occurrence" | "series">("occurrence");

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
    // Open the Aurora confirmation instead of a native confirm(). Recurring events
    // default to "this event only" (the safe choice); one-offs just delete.
    setDelScope(isRecurring ? "occurrence" : "series");
    setConfirmOpen(true);
  }

  function doDelete() {
    start(async () => {
      if (isRecurring && delScope === "occurrence") {
        const r = await skipEventOccurrence(event.id, occDateKey);
        if (!r.ok) { toast(r.error, { tone: "danger" }); return; }
        toast("This event was cancelled — the rest of the series stays. Its task was removed.", { tone: "success", duration: 6000 });
      } else {
        const r = await deleteEventAction(event.id);
        if (!r.ok) { toast(r.error, { tone: "danger" }); return; }
        const whole = isRecurring; // deleting a series vs a single one-off
        if (r.googleCancelled) toast(whole ? "Whole series deleted — guests notified." : "Event deleted — guests notified of the cancellation.", { tone: "success", duration: 6000 });
        else toast(whole ? "Whole series deleted." : "Event deleted.", { tone: "success" });
      }
      setConfirmOpen(false);
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
        const base = r.via === "google"
          ? `Invite sent to ${who} via Google Calendar${r.meetLink ? " · Meet link created" : ""}. It's on your own calendar (organisers don't get an email); a copy is in your inbox.`
          : `Invite emailed to ${who}`;
        // Say what happened to the papers. A file that had to go as a link is
        // stated outright — believing a ticket was attached when it wasn't is
        // exactly the failure this feature exists to prevent.
        const files = r.attached ? ` · ${r.attached} file${r.attached === 1 ? "" : "s"} attached` : "";
        const oversize = r.tooLargeToAttach?.length
          ? ` · ${r.tooLargeToAttach.join(", ")} was too large to attach and went as a link instead`
          : "";
        toast(base + files + oversize, {
          tone: r.tooLargeToAttach?.length ? "warn" : "success",
          duration: r.tooLargeToAttach?.length ? 9000 : 7000,
        });
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
            {event.attachmentCount > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={`${event.attachmentCount} file${event.attachmentCount === 1 ? "" : "s"} attached to this event`}
              >
                <Paperclip size={12} />
                {event.attachmentCount}
              </span>
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

      {confirmOpen && (
        <HrmsDialog
          open
          onClose={() => setConfirmOpen(false)}
          width="sm"
          title={<span className="inline-flex items-center gap-2 text-danger"><Trash2 size={16} /> Delete event</span>}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button type="button" variant="danger" disabled={pending} onClick={doDelete}>
                <Trash2 size={15} /> {!isRecurring ? "Delete" : delScope === "occurrence" ? "Delete this event" : "Delete series"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {/* Preview of what's being deleted */}
            <div className="rounded-xl bg-bg-muted/40 p-3 ring-1 ring-border">
              <p className="font-medium leading-snug">{event.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{fmtDayLabel(event.startAt)}{event.allDay ? "" : ` · ${fmtTime(event.startAt)}`}</span>
                {event.companyLabel && <span className="inline-flex items-center gap-1"><Building2 size={12} />{event.companyLabel}</span>}
                {event.attendees.length > 0 && <span className="inline-flex items-center gap-1"><Users size={12} />{event.attendees.length} {event.attendees.length === 1 ? "attendee" : "attendees"}</span>}
                {isRecurring && <span className="inline-flex items-center gap-1 capitalize"><Repeat size={12} />{event.recurrence}</span>}
              </div>
            </div>

            {isRecurring ? (
              <div className="space-y-1.5">
                <p className="text-xs text-fg-muted">This is a repeating event — what would you like to delete?</p>
                {([
                  { v: "occurrence", label: "This event only", desc: "Cancels just this date; the rest of the series stays. Its task is removed." },
                  { v: "series", label: "All events in the series", desc: "Deletes every occurrence and all their tasks. Guests are notified." },
                ] as const).map((o) => {
                  const active = delScope === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setDelScope(o.v)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors",
                        active ? "bg-accent-soft ring-accent" : "bg-bg-elev ring-border hover:bg-bg-muted",
                      )}
                    >
                      <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1", active ? "bg-accent text-accent-fg ring-accent" : "ring-border")}>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-fg">{o.label}</span>
                        <span className="block text-[11px] text-fg-muted">{o.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-fg-muted">This permanently deletes the event. Its linked task (if any) is removed too, and any invited guests are notified.</p>
            )}
          </div>
        </HrmsDialog>
      )}
    </Card>
  );
}

/* ---- ONE size for everything in the event form ----------------------- *
 * Measured on the live form before this: single-line controls came in FOUR
 * different heights — 34px (date, time), 36px (title, link, location, repeats),
 * 42px (category) and 44px (company) — plus two chip sizes, 24px and 25px. That
 * raggedness is what made the form feel unfinished. These three constants are
 * now the only sizes used, so a new field cannot quietly introduce a fifth.
 *
 * FIELD       — height only, for controls that bring their own shell (Input, Select).
 * FIELD_SHELL — the full box, for controls we style ourselves (date, time, company, category).
 * CHIP        — every small toggle: reminders and the quick templates.
 */
const FIELD = "h-10 rounded-xl";
const FIELD_SHELL =
  "h-10 rounded-xl bg-bg-subtle px-3.5 text-sm text-fg ring-1 ring-border transition-colors hover:ring-accent/40";
const CHIP =
  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium ring-1 transition-colors";

const REMINDER_OPTS: { v: number; label: string }[] = [
  { v: 0, label: "At start" },
  { v: 10, label: "10m" },
  { v: 30, label: "30m" },
  { v: 60, label: "1h" },
  { v: 1440, label: "1 day" },
  { v: 2880, label: "2 days" },
  { v: 10080, label: "1 week" },
];

// (The 96-option TIME_OPTS list that used to live here is gone — the form now
// uses TimeField, where you type the time. See lib/time-input.ts.)
const dateOf = (v: string) => (v || "").slice(0, 10);
const timeOf = (v: string) => (v && v.length >= 16 ? v.slice(11, 16) : "");
// (composeDT was removed with the combined date+time state — returning "" for an
//  empty date is exactly what silently discarded a time typed before a date.)

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
  // Date and time are held SEPARATELY, and the combined value is derived below.
  //
  // They used to be one datetime-local string, and `composeDT` returns "" when
  // the date is empty — so choosing a time before choosing a date silently threw
  // the time away and snapped back to 09:00. Found while testing the new time
  // field; it was there before it too. Keeping them apart means each is
  // remembered on its own, in whichever order you fill them in.
  const startSeed = isoToLocalInput(editing?.startAt ?? null, editing?.allDay ?? false);
  const endSeed = isoToLocalInput(editing?.endAt ?? null, false);
  const [startDate, setStartDate] = useState<string>(dateOf(startSeed));
  const [startTime, setStartTime] = useState<string>(timeOf(startSeed) || "09:00");
  const [endDate, setEndDate] = useState<string>(dateOf(endSeed));
  const [endTime, setEndTime] = useState<string>(timeOf(endSeed) || "10:00");

  const startVal = startDate ? (allDay ? startDate : `${startDate}T${startTime}`) : "";
  const endVal = endDate ? `${endDate}T${endTime}` : "";
  // Meet links are OPT-IN. Most entries in a diary are not video calls — a site
  // visit, a flight, a lunch — and a link nobody asked for is worse than a
  // missing one. Tick it when you actually want a room.
  const [addMeet, setAddMeet] = useState(false);
  // New events: also track the meeting as a task (creates one task per company).
  const [companyIds, setCompanyIds] = useState<number[]>(editing?.companyId ? [editing.companyId] : []);
  // OFF by default (owner's call, Aug 2026). Most diary entries — a flight, a
  // site visit, a lunch — are not something to follow through as a task, and
  // having it pre-ticked created one every time unless you noticed.
  const [trackTask, setTrackTask] = useState(false);

  // Title / location / description are CONTROLLED so an attached ticket can fill
  // them in. They were uncontrolled defaults; a read would have had no way to
  // reach them without reaching into the DOM.
  const [title, setTitle] = useState(editing?.title ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");

  // Papers travelling with the event, and what the last read found.
  const [attachments, setAttachments] = useState<AttachedDoc[]>([]);
  const [readBanner, setReadBanner] = useState<EventPrefill | null>(null);
  // Editing NEVER emails unless this is ticked. The calendar updates either way
  // — Google is patched silently — so correcting a typo no longer posts a
  // message to every guest.
  const [notifyGuests, setNotifyGuests] = useState(false);

  // An existing event already has its papers — load them so the list shows what
  // is attached rather than looking empty until something new is dropped.
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (!editingId) return;
    let live = true;
    void listEventDocumentsAction(editingId).then((docs) => {
      if (!live) return;
      setAttachments(docs.map((d) => ({ id: d.id, title: d.title, fileName: d.fileName, share: d.sendWithInvite })));
    });
    return () => { live = false; };
  }, [editingId]);

  /**
   * Apply what a document said. Deliberately additive: it fills BLANKS and
   * replaces the description, but never overwrites a title, place or time the
   * owner has already typed — his correction always outranks the read.
   */
  function applyPrefill(p: EventPrefill) {
    setReadBanner(p);
    if (p.title && !title.trim()) setTitle(p.title);
    if (p.location && !location.trim()) setLocation(p.location);
    if (p.description) {
      setDescription((prev) => (prev.trim() ? `${prev.trim()}\n\n${p.description}` : p.description));
    }
    if (p.allDay) setAllDay(true);
    if (p.startAt && !startDate) {
      const local = isoToLocalInput(p.startAt, p.allDay);
      setStartDate(dateOf(local));
      if (!p.allDay) setStartTime(timeOf(local) || "09:00");
    }
    if (p.endAt && !endDate && !p.allDay) {
      const local = isoToLocalInput(p.endAt, false);
      setEndDate(dateOf(local));
      setEndTime(timeOf(local) || "10:00");
    }
    if (p.reminders.length && !reminders.length) setReminders(p.reminders);
  }

  function toggleReminder(v: number) {
    setReminders((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => b - a));
  }
  function applyTemplate(t: typeof TEMPLATES[number]) {
    setAllDay(!!t.allDay);
    setReminders(t.reminders);
    if (!t.allDay && t.durationMin && startVal) {
      const ms = inputToMs(startVal, false);
      if (ms) {
        const local = isoToLocalInput(new Date(ms + t.durationMin * 60_000).toISOString(), false);
        setEndDate(dateOf(local));
        setEndTime(timeOf(local) || "10:00");
      }
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
    // Files are already filed in the library by the time we get here; this tells
    // the server which of them belong to THIS event — and carries the per-file
    // "send to guests" tick, which would otherwise default to on and email a
    // document the owner had deliberately marked reference-only.
    fd.set("documentIds", JSON.stringify(attachments.map((d) => ({ id: d.id, send: d.share }))));
    fd.set("recurrence", recurrence);
    fd.set("recurrenceUntil", recurrence !== "none" ? recurrenceUntil : "");
    if (allDay) fd.set("allDay", "1");
    // Tell the server whether a Meet room was actually wanted. Without this the
    // invitation path minted one regardless, so "No Meet link will be added" was
    // silently ignored on any event with an email guest.
    if (!editing) fd.set("requestMeet", addMeet ? "1" : "0");
    if (editing) {
      fd.set("id", String(editing.id));
      fd.set("notifyGuests", notifyGuests ? "1" : "0");
    }
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
        } else if (editing) {
          // Say exactly what happened. The old toast claimed "guests notified"
          // whenever Google synced, which was true of the calendar but read as
          // though an email had gone out.
          const msg = r.unchanged
            ? "Nothing changed — nothing was sent."
            : r.guestsEmailed
              ? "Saved. Their calendar is updated and guests have been emailed what changed."
              : "Saved. Their calendar updates automatically — no email sent.";
          toast(msg, { tone: "success", duration: 6000 });
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
      // 820px, not the "lg" preset: two columns need roughly 380px each to hold
      // a Meet link or a long company name without wrapping.
      width={820}
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
      {/* ONE grid, two columns. Every short field is half-width, so the 311px of
          dead space that sat beside Category and Repeats is gone and the form is
          roughly half as tall — it now fits without scrolling. Fields holding
          long text (title, description, attachments, attendees) span both.
          Order follows how an event is actually decided: what · when · who ·
          where · detail · optional extras last. */}
      <form id="calendar-event-form" action={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
        {/* ── What ─────────────────────────────────────────────────────── */}
        <div className="sm:col-span-2">
          <FieldLabel>Title</FieldLabel>
          <Input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 review with DSC Ltd" className={cn(FIELD, "font-medium")} />
        </div>

        {/* ── When: start, end and all-day on ONE row ──────────────────── */}
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">When</span>
            {/* Quick templates sit WITH the times they change, rather than
                floating above the title as the first thing you met. */}
            {!editing && (
              <div className="flex flex-wrap items-center gap-1.5">
                {TEMPLATES.map((t) => (
                  <button key={t.label} type="button" onClick={() => applyTemplate(t)}
                    className={cn(CHIP, "bg-bg-subtle text-fg-muted ring-border hover:text-fg")}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[132px] flex-1">
              <DatePopover
                block
                triggerClassName={FIELD_SHELL}
                value={startDate || null}
                // Mirror the end date when it is still blank. Almost every event
                // starts and ends on the same day, and the row already shows an
                // end TIME — leaving "No date" beside it meant that time was
                // quietly ignored on save.
                onChange={(d) => { setStartDate(d); if (!endDate) setEndDate(d); }}
              />
            </div>
            {!allDay && (
              <>
                <TimeField className="w-[104px] shrink-0" inputClassName={FIELD_SHELL} value={startTime} onChange={setStartTime} />
                <span className="text-xs text-fg-subtle">to</span>
                <div className="min-w-[132px] flex-1">
                  <DatePopover block triggerClassName={FIELD_SHELL} value={endDate || null} onChange={setEndDate} />
                </div>
                <TimeField className="w-[104px] shrink-0" inputClassName={FIELD_SHELL} value={endTime} onChange={setEndTime} />
              </>
            )}
            <label className={cn(FIELD_SHELL, "inline-flex shrink-0 cursor-pointer select-none items-center gap-2")}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-3.5 w-3.5 accent-[hsl(var(--accent))]" />
              All-day
            </label>
          </div>
          {/* Canonical values the server reads (datetime-local / date shape). */}
          <input type="hidden" name="startAt" value={startDate ? (allDay ? startDate : `${startDate}T${startTime}`) : ""} />
          {!allDay && <input type="hidden" name="endAt" value={endDate ? `${endDate}T${endTime}` : ""} />}
          {conflicts.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-warn-soft/60 px-3 py-2 text-xs text-warn ring-1 ring-warn/30">
              <Bell size={13} className="mt-0.5 shrink-0" />
              <span>Overlaps {conflicts.length} existing event{conflicts.length === 1 ? "" : "s"}: {conflicts.slice(0, 3).map((c) => c.title).join(", ")}{conflicts.length > 3 ? "…" : ""}</span>
            </div>
          )}
        </div>

        {/* ── Who — moved up: you settle who it is with early, not last. ── */}
        <div className="sm:col-span-2">
          <FieldLabel>Attendees</FieldLabel>
          <AttendeePicker people={people} value={picked} onChange={setPicked} />
        </div>

        {/* ── Filing: company + category, paired ───────────────────────── */}
        <div>
          <FieldLabel>{companyIds.length > 1 ? `Companies · ${companyIds.length}` : "Company"}</FieldLabel>
          <CompanyMultiSelect companies={companies} value={companyIds} onChange={setCompanyIds} buttonClassName={cn(FIELD_SHELL, "flex w-full items-center justify-between")} />
          {companyIds.length > 1 && (
            <p className="mt-1 text-[11px] text-fg-subtle">One task per company; the first is the lead.</p>
          )}
        </div>
        <input type="hidden" name="companyId" value={companyIds[0] ?? ""} />
        <input type="hidden" name="companyIds" value={JSON.stringify(companyIds)} />

        <div>
          <FieldLabel>Category</FieldLabel>
          <Combobox
            name="category"
            options={categories.map((c) => c.name)}
            defaultValue={editing?.categoryName ?? ""}
            placeholder="Board meeting…"
            className={cn(FIELD_SHELL, "w-full placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40")}
          />
        </div>

        {/* ── Where: place + link, paired ──────────────────────────────── */}
        <div>
          <FieldLabel>Location</FieldLabel>
          <Input name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office, address…" className={FIELD} />
        </div>
        <div>
          <FieldLabel>Meeting link</FieldLabel>
          <Input name="meetLink" defaultValue={editing?.meetLink ?? ""} placeholder="Meet / Zoom / Teams URL" className={FIELD} />
          {!editing && (
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[11px] text-fg-muted">
              <input type="checkbox" checked={addMeet} onChange={(e) => setAddMeet(e.target.checked)} className="accent-[var(--accent)]" />
              {addMeet ? "A Google Meet link is added on create" : "No Meet link will be added"}
            </label>
          )}
        </div>

        {/* ── Detail — full width and roomy. An AI-read ticket runs to ten
               lines and used to arrive in a two-line box. ──────────────── */}
        <div className="sm:col-span-2">
          <FieldLabel>Description</FieldLabel>
          <Textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Agenda, notes…"
            className="min-h-[7.5rem] resize-y leading-relaxed"
          />
        </div>

        {/* Papers that travel with the entry — ticket, booking, agenda. */}
        <div className="sm:col-span-2">
          <EventAttachments
            eventId={editing?.id ?? null}
            companyId={companyIds[0] ?? editing?.companyId ?? null}
            value={attachments}
            onChange={setAttachments}
            onPrefill={applyPrefill}
            allowLibrary
          />
          {readBanner && <ReadSummary prefill={readBanner} onDismiss={() => setReadBanner(null)} />}
        </div>

        {/* ── Reminders + repeats, paired ──────────────────────────────── */}
        <div>
          <FieldLabel>Reminders</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_OPTS.map((o) => {
              const on = reminders.includes(o.v);
              return (
                <button key={o.v} type="button" onClick={() => toggleReminder(o.v)}
                  className={cn(CHIP, on ? "bg-accent/15 text-accent ring-accent/40" : "bg-bg-subtle text-fg-muted ring-border hover:text-fg")}>
                  <Bell size={11} /> {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel>Repeats</FieldLabel>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={FIELD}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
          {recurrence !== "none" && (
            <Input type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)} className={cn(FIELD, "mt-2")} aria-label="Repeat until" />
          )}
        </div>

        {/* Per-occurrence skip — cancel JUST this date of a repeating event. */}
        {isRecurring && (
          <div className="space-y-2 rounded-xl bg-bg-subtle/60 p-3 ring-1 ring-border/70 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-fg-muted">This is one date of a repeating event — you can cancel just this one.</span>
              {alreadySkipped ? (
                <span className="shrink-0 text-[11px] font-medium text-danger">This date is cancelled</span>
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
                    className="inline-flex items-center gap-1 rounded-full bg-danger-soft/40 px-2 py-0.5 text-[11px] text-danger ring-1 ring-danger/20 transition-colors hover:bg-danger-soft/70">
                    {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} <X size={10} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Telling guests is a DELIBERATE act, never a side effect of saving.
            Only shown when there is somebody with an email to tell. */}
        {editing && picked.some((p) => p.email) && (
          <label className="flex cursor-pointer select-none items-start gap-2.5 rounded-xl bg-bg-subtle px-3 py-2.5 ring-1 ring-border/70 sm:col-span-2">
            <input
              type="checkbox"
              checked={notifyGuests}
              onChange={(e) => setNotifyGuests(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--accent))]"
            />
            <span className="text-sm">
              Tell guests about this change
              <span className="block text-[12px] text-fg-muted">
                {notifyGuests
                  ? "They will get an email saying exactly what changed."
                  : "Their calendar updates by itself — tick this only if they need to be told."}
              </span>
            </span>
          </label>
        )}

        {/* Meeting-as-task — OFF by default (owner's call): most diary entries
            are not something to follow through as a task. */}
        {!editing && (
          <label className="flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl bg-bg-subtle px-3 ring-1 ring-border/70 sm:col-span-2">
            <input
              type="checkbox"
              checked={trackTask}
              onChange={(e) => setTrackTask(e.target.checked)}
              className="h-3.5 w-3.5 accent-[hsl(var(--accent))]"
            />
            <span className="truncate text-sm">
              {companyIds.length > 1 ? `Track as ${companyIds.length} tasks (one per company)` : "Track this meeting as a task"}
              <span className="text-fg-muted"> — {companyIds.length > 0 ? "prep and follow it through" : "pick a company first"}</span>
            </span>
          </label>
        )}
        <input type="hidden" name="trackAsTask" value={trackTask && companyIds.length > 0 ? "on" : "off"} />
      </form>
    </HrmsDialog>
  );
}

/* -------------------------- Announcements panel ----------------------- */
function toneClasses(tone: string): { pill: string; border: string } {
  switch (tone) {
    case "danger": return { pill: "bg-danger-soft text-danger ring-danger/25", border: "border-danger" };
    case "warn": return { pill: "bg-warn-soft text-warn ring-warn/25", border: "border-warn" };
    case "success": return { pill: "bg-success-soft text-success ring-success/25", border: "border-success" };
    case "info": return { pill: "bg-info-soft text-info ring-info/25", border: "border-info" };
    default: return { pill: "bg-violet-100 text-violet-600 ring-violet-300/40", border: "border-violet-400" };
  }
}

function AnnouncementsPanel({ announcements }: { announcements: BriefAnnouncement[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);

  const live = announcements.filter((a) => a.live);
  const scheduled = announcements.filter((a) => a.scheduled);
  const drafts = announcements.filter((a) => a.status === "draft");

  function nudge(id: number) {
    setBusy(id);
    start(async () => {
      const res = await nudgeAnnouncementAction(id);
      setBusy(null);
      if (!res.ok) return toast(res.error ?? "Could not nudge.", { tone: "warn" });
      toast(res.nudged ? `Reminded ${res.nudged} ${res.nudged === 1 ? "person" : "people"}.` : "Everyone's already seen it.", { tone: "success" });
      router.refresh();
    });
  }

  const typeMeta = (t: string) => ANNOUNCEMENT_TYPES.find((x) => x.value === t) ?? ANNOUNCEMENT_TYPES[0];

  function Card_({ a, faded }: { a: BriefAnnouncement; faded?: boolean }) {
    const meta = typeMeta(a.type);
    const tc = toneClasses(meta.tone);
    const pct = a.stats.total ? Math.round((a.stats.ack / a.stats.total) * 100) : 0;
    const outstanding = Math.max(0, a.stats.total - a.stats.ack);
    return (
      <div className={cn("rounded-2xl border-l-[3px] bg-bg-elev p-3.5 ring-1 ring-border/60", tc.border, faded && "opacity-70")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold ring-1", tc.pill)}>{meta.label}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.title}</span>
          {a.scheduled && a.publishAt && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted ring-1 ring-border/60">
              scheduled · {new Date(a.publishAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
          {a.status === "draft" && <span className="rounded-lg bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted ring-1 ring-border/60">draft</span>}
        </div>
        {a.body && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{a.body}</p>}
        {a.live && a.requireAck && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-violet-100">
              <span className="block h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] tabular text-fg-subtle">{a.stats.ack}/{a.stats.total} acknowledged</span>
            {outstanding > 0 && (
              <button type="button" onClick={() => nudge(a.id)} disabled={busy === a.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium text-warn transition-colors hover:border-warn/40 disabled:opacity-50">
                <Bell size={13} /> Nudge {outstanding}
              </button>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          {a.live && !a.requireAck && <span className="text-[11px] text-fg-subtle">Seen by {a.stats.seen}/{a.stats.total}</span>}
          <Link href="/announcements" className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-accent">
            <Pencil size={12} /> Edit
          </Link>
        </div>
      </div>
    );
  }

  if (announcements.length === 0) {
    return <EmptyState icon={<Megaphone size={28} />} title="No announcements yet" hint="Post one to broadcast it to staff — with read + acknowledge tracking." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {live.length > 0 && (
          <section className="space-y-2">
            <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Live</p>
            {live.map((a) => <Card_ key={a.id} a={a} />)}
          </section>
        )}
        {scheduled.length > 0 && (
          <section className="space-y-2">
            <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Scheduled</p>
            {scheduled.map((a) => <Card_ key={a.id} a={a} faded />)}
          </section>
        )}
        {drafts.length > 0 && (
          <section className="space-y-2">
            <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Drafts</p>
            {drafts.map((a) => <Card_ key={a.id} a={a} faded />)}
          </section>
        )}
      </div>
      <aside className="hidden lg:block">
        <div className="rounded-2xl bg-bg-elev/50 p-3.5 ring-1 ring-border/60">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">This board</p>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            Announcements publish to staff&apos;s portal + phone, mirror into their Announcements chat, and (when you tick <b className="text-fg">require acknowledge</b>) track who&apos;s read them. Scheduled ones also appear on the Events agenda until they go live.
          </p>
          <Link href="/announcements" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent/40">
            <Plus size={13} /> New announcement
          </Link>
        </div>
      </aside>
    </div>
  );
}
