"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useUrlFilters } from "@/lib/use-url-filters";
import {
  CalendarPlus, Video, MapPin, Users, Bell, Building2, Download, Copy, Check,
  Pencil, Trash2, MessageCircle, CalendarDays, Mail, ChevronLeft, ChevronRight, 
  CheckSquare, Plane, Flag, RefreshCw, Cake, Award, UserCheck, Repeat, ExternalLink, Reply, MoreHorizontal, FileWarning, ClipboardList, X,
  Plus, Paperclip, Send, Link2, Globe, Eye, Undo2, Clock, FolderClosed, Loader2, type LucideIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, Card, EmptyState } from "@/components/ui";
import { useCreateParam } from "@/lib/use-create-param";
import type { Announcement, ReceiptStats } from "@/lib/announcements-shared";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { AttendeePicker } from "@/components/attendee-picker";
import { DatePopover } from "@/components/date-popover";
import { FluidSelect } from "@/components/fluid-select";
import { isoToLocalInput as sharedIsoToLocalInput, TimeField } from "@/components/date-time-field";
import { CompanyMultiSelect } from "@/components/company-multi-select";
import { Combobox } from "@/components/combobox";
import { ReferenceAdmin } from "@/components/reference-admin";
import { EventAttachments, StudioReadCard, type AttachedDoc, type EventPrefill } from "@/components/event-attachments";
import { listEventDocumentsAction } from "./attachment-actions";
import { useToast } from "@/components/toast";
import { useContextActions } from "@/components/context-actions";
import { cn } from "@/lib/cn";
import { StudioScope, StudioHeader, StudioCard, CardHead, BigNumber, stBtn } from "@/components/studio/kit";
import { StudioMenu } from "@/components/studio/tasks/controls";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { ReturnLink } from "@/components/back-link";
import { hasElapsed, isHappeningNow } from "@/lib/event-time-shared";
import type { CalendarEvent, CalendarAttendee } from "@/lib/calendar";
import { expandRecurrence } from "@/lib/ics";
import { type OverlayItem, type OverlayKind, OVERLAY_KINDS, OVERLAY_LABELS } from "@/lib/calendar-overlays-shared";
import { createEventAction, updateEventAction, deleteEventAction, sendEventInviteAction, ensureEventMeetLink, draftEventRemindersAction, draftEventFollowupAction, previewEventInviteAction, createEventCategory, renameEventCategory, mergeEventCategories, deleteEventCategory, skipEventOccurrence, restoreEventOccurrence } from "./actions";

// Persisted calendar view + filter preferences (localStorage). `disabledLayers`
// stores the OFF layers (so a newly-added layer defaults ON).
const PREFS_KEY = "cos.calendar.prefs.v1";
type CalendarPrefs = {
  view: ViewMode;
  /** Older saves carried the filters too; they now live in the URL. */
  search?: string;
  companyFilter?: string;
  sourceFilter?: string;
  categoryFilter?: string;
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

const EAT = "Africa/Dar_es_Salaam";

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
}: {
  events: CalendarEventView[];
  overlays?: OverlayItem[];
  people: Person[];
  companies: Company[];
  categories: EventCategory[];
  announcements?: BriefAnnouncement[];
  counts?: BriefCounts;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [manageCatsOpen, setManageCatsOpen] = useState(false);
  useContextActions("calendar", [{ id: "new-event", label: "New event", icon: <CalendarPlus size={16} />, onClick: () => openNew(), primary: true, tone: "accent" }], []);
  // /calendar?new=1 — the global New menu's "Event".
  useCreateParam("1", () => openNew());
  const [editing, setEditing] = useState<CalendarEventView | null>(null);
  // The view and the filters are the URL (the rule every list follows now), so
  // "Month, DSC only" can be bookmarked and sent. ⚠️ `co`, never `company` —
  // that name is watched globally by CompanyDrawer. Layers and the two noise
  // switches stay device preferences: they are taste, not a view.
  const url = useUrlFilters({ view: "month", co: "all", type: "all", src: "all", q: "", day: "" }, { debounceKeys: ["q"] });
  // Studio's picked day lives in the address, so opening a task from the day's
  // list and pressing Back lands on the same day, not on today.
  const dayParam = /^\d{4}-\d{2}-\d{2}$/.test(url.values.day) ? url.values.day : "";
  const view: ViewMode = (["month", "week", "day", "agenda"] as const).includes(url.values.view as ViewMode) ? (url.values.view as ViewMode) : "month";
  const setView = (v: ViewMode) => url.set({ view: v });
  const companyFilter = url.values.co;
  const categoryFilter = url.values.type;
  const sourceFilter = url.values.src;
  const setSourceFilter = (v: string) => url.set({ src: v });
  const search = url.values.q;
  const setSearch = (v: string) => url.set({ q: v });
  const [needInvitesOnly, setNeedInvitesOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = dayParam ? new Date(`${dayParam}T12:00:00+03:00`) : new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [enabledLayers, setEnabledLayers] = useState<Set<OverlayKind>>(() => new Set(OVERLAY_KINDS));
  // "Meetings only" hides every overlay layer at once; "Hide repeats" collapses a
  // recurring series to one chip per period (with a ↻ badge) so it stops filling
  // the grid. Both persist across visits, like the other filters.
  const [meetingsOnly, setMeetingsOnly] = useState(false);
  const [collapseRecurring, setCollapseRecurring] = useState(false);
  // Studio: the day picked in the month grid (the left card shows it — mockup
  // board Calendar), the Events layer switch, and the lower grid sized to fit.
  const pickedKey = dayParam || todayKeyGlobal;
  // Written with history.replaceState, not url.set: a router navigation re-read
  // the whole (dynamic) calendar from the server on every click of a day.
  // Next keeps useSearchParams in step with replaceState, so dayParam follows.
  const setPickedKey = (k: string) => {
    const q = new URLSearchParams(window.location.search);
    if (k === todayKeyGlobal) q.delete("day"); else q.set("day", k);
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };
  const [hideEvents, setHideEvents] = useState(false);
  const studioGrid = useRef<HTMLDivElement>(null);
  useFitFrame(studioGrid, { enabled: true, minimum: 460 });
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
        // The last VIEW is remembered, but an address that names one wins —
        // a link to "Month" must open Month whatever was used last.
        if (!url.dirty && p.view && (["month", "week", "day", "agenda"] as string[]).includes(p.view)) {
          url.set({ view: p.view });
        }
        if (Array.isArray(p.disabledLayers)) {
          setEnabledLayers(new Set(OVERLAY_KINDS.filter((k) => !p.disabledLayers!.includes(k))));
        }
        if (typeof p.meetingsOnly === "boolean") setMeetingsOnly(p.meetingsOnly);
        if (typeof p.collapseRecurring === "boolean") setCollapseRecurring(p.collapseRecurring);
      }
    } catch { /* corrupt/absent prefs → defaults */ }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filters whenever they change (skip the first render so we never write
  // defaults over a freshly-restored set).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const prefs: CalendarPrefs = {
        view,
        disabledLayers: OVERLAY_KINDS.filter((k) => !enabledLayers.has(k)),
        meetingsOnly, collapseRecurring,
      };
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* storage full / disabled → ignore */ }
  }, [view, enabledLayers, meetingsOnly, collapseRecurring]);

  function toggleLayer(k: OverlayKind) {
    setEnabledLayers((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  // Which overlay kinds actually have items, so we only show relevant toggles.

  // A slot clicked on the Week/Day grid starts the new event at that time.
  const [seed, setSeed] = useState<{ date: string; time: string } | null>(null);
  function openNew(at?: { date: string; time: string }) { setEditing(null); setSeed(at ?? null); setFormOpen(true); }
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

  // The figures under the title follow the FILTERS — they used to come from
  // the server, before any filter, so picking a company changed nothing.
  // "Next 7 days" is what it always counted; it was labelled "this week".
  const figures = useMemo(() => {
    const now = Date.now();
    const in7 = now + 7 * 24 * 3600_000;
    let next7 = 0, today = 0, needInvites = 0;
    for (const e of filtered) {
      const t = new Date(e.startAt).getTime();
      if (t >= now && t < in7) next7++;
      if (keyOfIso(e.startAt) === todayKeyGlobal) today++;
      if (t >= now && !e.googleEventId && e.attendees.some((a) => a.email)) needInvites++;
    }
    return { next7, today, needInvites };
  }, [filtered]);

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


  // ---- Studio (mockup board Calendar, design/studio-mockup/gen/p_calendar.py) ----
  // Every size and colour below is the board's own; read that file before
  // changing one. The Events layer hides events the way the others hide theirs.
  const evByDay = hideEvents ? new Map<string, CalendarEventView[]>() : byDay;
  const pickedDate = new Date(`${pickedKey}T12:00:00+03:00`);
  const pickEvs = evByDay.get(pickedKey) ?? [];
  const pickOvs = overlayByDay.get(pickedKey) ?? [];
  const pickItems = pickEvs.length + pickOvs.length;
  const dayName = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "short", day: "numeric", month: "short" });
  const base = new Date(); base.setHours(12, 0, 0, 0);
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(base, i); const k = keyOfDate(d);
    return { d, k, ev: evByDay.get(k)?.length ?? 0, other: overlayByDay.get(k)?.length ?? 0 };
  });
  const next7Total = next7.reduce((a, x) => a + x.ev + x.other, 0);
  // 18px a thing, as drawn — scaled down only when the busiest day would
  // outgrow the 96px the bars have under their labels.
  const perThing = Math.min(18, 96 / Math.max(1, ...next7.map((x) => x.ev + x.other)));
  const live = announcements.filter((a) => a.live);
  const companyLabel = companyFilter === "all" ? "Companies" : companies.find((c) => String(c.id) === companyFilter)?.name ?? "Companies";
  const typeLabel = categoryFilter === "all" ? "Types" : categoryFilter === "none" ? "Uncategorised" : categories.find((c) => String(c.id) === categoryFilter)?.name ?? "Types";
  const periodShort = view === "agenda" ? "Upcoming" : view === "month" ? cursor.toLocaleDateString("en-GB", { timeZone: EAT, month: "long", year: "numeric" }) : periodLabel;
  const pick = (d: Date) => { setPickedKey(keyOfDate(d)); setCursor(d); };
  const menuItem = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--st-page)]";
  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Calendar"
        left={
          <>
            <StudioMenu label={companyLabel} searchable options={[
              { key: "all", label: "All companies", href: url.hrefFor({ co: "all" }), active: companyFilter === "all" },
              ...companies.map((c) => ({ key: String(c.id), label: c.name, href: url.hrefFor({ co: String(c.id) }), active: companyFilter === String(c.id) })),
            ]} />
            <StudioMenu label={typeLabel} options={[
              { key: "all", label: "All types", href: url.hrefFor({ type: "all" }), active: categoryFilter === "all" },
              ...categories.map((c) => ({ key: String(c.id), label: c.name, href: url.hrefFor({ type: String(c.id) }), active: categoryFilter === String(c.id) })),
              ...(categories.length ? [{ key: "none", label: "Uncategorised", href: url.hrefFor({ type: "none" }), active: categoryFilter === "none" }] : []),
            ]} />
            <DropdownMenu.Root open={moreOpen} onOpenChange={setMoreOpen}>
              <DropdownMenu.Trigger asChild>
                <button type="button" className={stBtn.chip}>More <ChevronDownIcon /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="start" sideOffset={6} className="studio z-[140] w-60 rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] p-1.5 text-[13px] shadow-[0_16px_40px_rgba(17,18,20,0.16)]">
                  <div className="px-2.5 pb-1 pt-1.5 text-[11px] text-[var(--st-muted)]">Search</div>
                  <div className="px-1.5 pb-1.5">
                    <input type="text" defaultValue={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Events, people, companies…"
                      style={{ background: "var(--st-page)", border: "1px solid var(--st-line)", color: "var(--st-ink)", boxShadow: "none" }}
                      className="bare-field h-8 w-full rounded-lg px-2.5 text-[13px] outline-none" />
                  </div>
                  <div className="px-2.5 pb-1 pt-1.5 text-[11px] text-[var(--st-muted)]">Source</div>
                  {[{ v: "all", l: "All sources" }, { v: "manual", l: "Manual" }, { v: "meeting", l: "From meeting" }, { v: "task", l: "From task" }].map((x) => (
                    <button key={x.v} type="button" onClick={() => setSourceFilter(x.v)} className={menuItem}>
                      <span className="flex-1">{x.l}</span>{sourceFilter === x.v && <Check size={14} />}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-[var(--st-line)]" />
                  {figures.needInvites > 0 && (
                    <button type="button" onClick={() => setNeedInvitesOnly((v) => !v)} className={menuItem}>
                      <Bell size={14} /><span className="flex-1">Need invites ({figures.needInvites})</span>{needInvitesOnly && <Check size={14} />}
                    </button>
                  )}
                  <button type="button" onClick={() => setMeetingsOnly((v) => !v)} className={menuItem}>
                    <CalendarDays size={14} /><span className="flex-1">Meetings only</span>{meetingsOnly && <Check size={14} />}
                  </button>
                  <button type="button" onClick={() => setCollapseRecurring((v) => !v)} className={menuItem}>
                    <Repeat size={14} /><span className="flex-1">Hide repeats</span>{collapseRecurring && <Check size={14} />}
                  </button>
                  <div className="my-1 h-px bg-[var(--st-line)]" />
                  <button type="button" onClick={() => { setMoreOpen(false); setManageCatsOpen(true); }} className={menuItem}>
                    <Pencil size={14} /><span className="flex-1">Manage categories</span>
                  </button>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {(search || sourceFilter !== "all" || needInvitesOnly || meetingsOnly) && (
              <button type="button" onClick={() => { setSearch(""); setSourceFilter("all"); setNeedInvitesOnly(false); setMeetingsOnly(false); }}
                className="inline-flex h-8 items-center gap-1 rounded-[10px] px-2 text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]"><X size={12} />Clear</button>
            )}
          </>
        }
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label="View">
              {views.map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                  className={cn("flex h-[30px] items-center rounded-lg px-3 text-xs font-medium capitalize transition-colors",
                    view === v ? "bg-[var(--st-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {v}
                </button>
              ))}
            </div>
            {view !== "agenda" && (
              <div className="flex h-9 items-center gap-1 rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-1">
                <button type="button" onClick={() => step(-1)} aria-label="Previous" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronLeft size={13} strokeWidth={2.2} /></button>
                <span className="px-1.5 text-[13px] font-medium">{periodShort}</span>
                <button type="button" onClick={() => step(1)} aria-label="Next" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronRight size={13} strokeWidth={2.2} /></button>
                <button type="button" onClick={() => { goToday(); setPickedKey(todayKeyGlobal); }} className="h-7 rounded-lg bg-[var(--st-page)] px-2.5 text-xs hover:bg-[var(--st-seg)]">Today</button>
              </div>
            )}
            <button type="button" onClick={() => openNew()} className={stBtn.dark}><Plus size={15} />New event</button>
          </>
        }
      />

      {formOpen && (
        <EventForm seed={seed} people={people} companies={companies} categories={categories} editing={editing} allEvents={events} onClose={() => setFormOpen(false)} />
      )}
      {manageCatsOpen && (
        <HrmsDialog open onClose={() => setManageCatsOpen(false)} width="sm"
          title={<span className="inline-flex items-center gap-2"><Pencil size={15} /> Event categories</span>}
          sub="Name your meeting types (e.g. Board, Site visit, Review). Used to colour + filter the calendar.">
          <ReferenceAdmin
            items={categories.map((c) => ({ id: c.id, name: c.name }))}
            noun="category" addPlaceholder="Add a category — e.g. Board meeting"
            onCreate={createEventCategory} onRename={renameEventCategory} onMerge={mergeEventCategories} onDelete={deleteEventCategory}
            mergeNote="Its events move to the target category." deleteNote="Its events become uncategorised."
          />
        </HrmsDialog>
      )}

      <div className="grid shrink-0 grid-cols-1 gap-5 lg:h-[196px] lg:grid-cols-2">
        {/* The picked day — today until you pick another in the grid. */}
        <StudioCard className="h-[260px] lg:h-auto">
          <CardHead
            label={pickedKey === todayKeyGlobal ? `Today · ${dayName(pickedDate)}` : dayName(pickedDate)}
            right={<span className="text-xs text-[var(--st-muted)]">{pickItems} {pickItems === 1 ? "thing" : "things"}{pickItems > 3 && " · scroll for more"}</span>}
          />
          <div className="mt-2 flex min-h-0 flex-1 flex-col">
            <StudioDayList dayKey={pickedKey} evs={pickEvs} ovs={pickOvs} onEdit={openEdit} />
          </div>
        </StudioCard>

        <StudioCard texture="rings" className="min-h-[170px]">
          <CardHead label="Next 7 days" right={<span className="text-xs text-[var(--st-muted)]">{next7[0].d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "short", day: "numeric" })} – {next7[6].d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "short", day: "numeric", month: "short" })}</span>} />
          <div className="grid flex-1 grid-cols-[170px_minmax(0,1fr)] items-end gap-x-6">
            <div>
              <BigNumber value={next7Total} />
              <div className="mt-2.5 text-[13px] text-[#C9CBCF]">{next7Total === 1 ? "thing" : "things"} coming up</div>
              <div className="mt-1.5 flex gap-3 text-xs text-[var(--st-muted)]"><span>{figures.today} today</span><span>{figures.needInvites} need invites</span></div>
            </div>
            <StudioNext7Bars days={next7} perThing={perThing} pickedKey={pickedKey} evByDay={evByDay} overlayByDay={overlayByDay} onPick={pick} />
          </div>
        </StudioCard>
      </div>

      <div ref={studioGrid} className="grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_232px]">
        <div className="flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-[20px] bg-[var(--st-surface)] lg:min-h-0">
          {view === "agenda" ? (
            <StudioAgenda evByDay={evByDay} overlayByDay={overlayByDay} onEdit={openEdit} />
          ) : view === "month" ? (
            <MonthView cursor={cursor} byDay={evByDay} overlayByDay={overlayByDay} pickedKey={pickedKey} onPick={pick}
              onPickDay={(d) => { pick(d); setView("day"); }} onEdit={openEdit} />
          ) : view === "week" ? (
            <StudioTimeGrid mode="week" days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeekMon(cursor), i))} byDay={evByDay} overlayByDay={overlayByDay}
              onEdit={openEdit} onPickDay={(d) => { pick(d); setView("day"); }} onNewAt={(k, t) => openNew({ date: k, time: t })} />
          ) : (
            <StudioTimeGrid mode="day" days={[cursor]} byDay={evByDay} overlayByDay={overlayByDay}
              onEdit={openEdit} onPickDay={pick} onNewAt={(k, t) => openNew({ date: k, time: t })} />
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-3.5">
          <div className="rounded-[20px] bg-[var(--st-surface)] px-4 pb-3 pt-4">
            <div className="flex min-h-[26px] items-center text-[15px] font-semibold">Layers</div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {([["events", "Events", "var(--st-ink)"] as const, ...STUDIO_LAYER_ORDER.map((k) => [k, k === "commitment" ? "Lease / insurance notice" : OVERLAY_LABELS[k], STUDIO_LAYER[k].c] as const)]).map(([k, label, c]) => {
                const on = k === "events" ? !hideEvents : enabledLayers.has(k as OverlayKind) && !meetingsOnly;
                return (
                  <button key={k} type="button" aria-pressed={on}
                    onClick={() => (k === "events" ? setHideEvents((v) => !v) : toggleLayer(k as OverlayKind))}
                    disabled={k !== "events" && meetingsOnly}
                    className={cn("flex h-6 items-center gap-2.5 rounded-md px-1 text-left text-xs transition-colors", on ? "text-[var(--st-ink)]" : "text-[#A3A6AB]")}>
                    <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] border-[1.5px]" style={{ borderColor: c, background: on ? c : "transparent" }} />
                    {label}
                  </button>
                );
              })}
            </div>
            {meetingsOnly && <div className="mt-1.5 px-1 text-[11px] text-[var(--st-muted)]">Meetings only is on (More) — the layers are hidden.</div>}
          </div>

          <StudioCard texture="dots" className="!p-4">
            <div className="text-xs text-[var(--st-on-card-muted)]">{live.length ? "Live announcement" : "Announcements"}</div>
            {live.length === 0 ? (
              <div className="mt-1.5 text-sm leading-[1.35] text-[var(--st-muted)]">Nothing live right now.</div>
            ) : (
              <>
                <div className="mt-1.5 line-clamp-3 text-sm leading-[1.35]">{live[0].title}</div>
                {live[0].requireAck && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-[3px] bg-[var(--st-card-line)]">
                    <span className="block h-full bg-[var(--st-ok)]" style={{ width: `${live[0].stats.total ? Math.round((live[0].stats.ack / live[0].stats.total) * 1000) / 10 : 0}%` }} />
                  </div>
                )}
              </>
            )}
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--st-muted)]">
              <span>{live[0]?.requireAck ? `${live[0].stats.ack} / ${live[0].stats.total} acknowledged` : live.length > 1 ? `+${live.length - 1} more live` : ""}</span>
              <Link href="/announcements" className="text-[var(--st-on-card)] hover:underline">Manage →</Link>
            </div>
          </StudioCard>
        </aside>
      </div>
    </StudioScope>
  );
}

/* ----------------------------- Event chip ----------------------------- */


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
        <span className="block truncate text-base font-medium text-fg">{item.title}</span>
        <span className="block text-xs text-fg-subtle">{OVERLAY_LABELS[item.kind]}</span>
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
        <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
          <div className="border-b border-border/60 bg-bg-subtle/60 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
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
  cursor, byDay, overlayByDay, onPickDay, onEdit, pickedKey, onPick,
}: {
  /** Studio: the picked day (ringed) and what picking one does. */
  pickedKey?: string;
  onPick?: (d: Date) => void;
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
      {(
        /* Studio (mockup board Calendar): six rows that FILL the card, a tile a
           day. Click picks a day (ringed; the card above follows it); double-
           click opens it. Today is the black disc. Only the date of a day
           outside the month greys — its tile stays a tile. */
        <div className="hidden min-h-0 flex-1 flex-col sm:flex">
          <div className="grid grid-cols-7 px-2.5 pt-2.5 text-[11px] uppercase tracking-[0.04em] text-[var(--st-muted)]">
            {dows.map((d) => <span key={d} className="px-2">{d}</span>)}
          </div>
          <div className="grid min-h-[420px] flex-1 grid-cols-7 gap-1 px-2.5 pb-2.5 pt-1.5 lg:min-h-0" style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
            {cells.map((cell, i) => {
              const k = keyOfDate(cell);
              const evs = byDay.get(k) ?? [];
              const ovs = overlayByDay.get(k) ?? [];
              const inMonth = cell.getMonth() === cursor.getMonth();
              const isToday = k === todayKeyGlobal;
              const picked = k === pickedKey;
              const chips = [
                ...evs.map((e) => <StudioEventChip key={occKey(e)} event={e} onEdit={() => onEdit(e)} />),
                ...ovs.map((o) => <StudioOverlayChip key={o.id} item={o} />),
              ];
              return (
                <div key={i} role="button" tabIndex={0} aria-pressed={picked}
                  onClick={() => (onPick ? onPick(cell) : onPickDay(cell))}
                  onDoubleClick={() => onPickDay(cell)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (onPick) onPick(cell); else onPickDay(cell); } }}
                  title="Click to pick · double-click to open the day"
                  aria-label={cell.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "long" })}
                  className="flex min-h-0 min-w-0 cursor-pointer flex-col gap-[3px] overflow-hidden rounded-[10px] border-[1.5px] px-1.5 py-[5px] text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-muted)]"
                  style={{
                    borderColor: picked ? "var(--st-ink)" : "transparent",
                    background: !inMonth ? "var(--st-cal-out)" : chips.length ? "var(--st-cal-busy)" : "var(--st-surface)",
                  }}>
                  <span className="flex shrink-0 items-center justify-between">
                    <span className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs tabular-nums",
                      isToday ? "bg-[var(--st-ink)] font-semibold text-[var(--st-surface)]" : inMonth ? "" : "text-[var(--st-cal-num-out)]")}>
                      {cell.getDate()}
                    </span>
                    {chips.length > 2 && <span className="text-[10px] text-[var(--st-muted)]">+{chips.length - 2}</span>}
                  </span>
                  {chips.slice(0, 2)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Phones — condensed dots-per-day grid; tap a day to list its events below. */}
      <div className="sm:hidden space-y-3">
        <div className="overflow-hidden rounded-lg border border-border bg-bg-elev">
          <div className="grid grid-cols-7 border-b border-border/60 bg-bg-subtle/40">
            {dows.map((d) => (
              <div key={d} className="py-1 text-xs font-medium uppercase tracking-wider text-fg-subtle text-center">{d.charAt(0)}</div>
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
                  <span className={cn("text-xs inline-flex h-5 w-5 items-center justify-center rounded-full",
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
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-accent">
              Open day →
            </button>
          </div>
          <DaySheet evs={selEvs} ovs={selOvs} onEdit={onEdit} />
        </div>
      </div>
    </>
  );
}

/* Studio's layer colours and tints — the mockup's own (gen/p_calendar.py `L`).
   A chip is its tint with a dot in its colour; an event is grey with a black dot.
   Dark mode mixes the colour into the dark surface instead (`.st-cal-chip`). */
const STUDIO_LAYER: Record<OverlayKind, { c: string; tint: string }> = {
  task: { c: "#E0479E", tint: "#FDEBF4" },
  renewal: { c: "#8B5CF6", tint: "#F1ECFE" },
  birthday: { c: "#F5A524", tint: "#FEF3E0" },
  leave: { c: "#2490EF", tint: "#E6F2FD" },
  holiday: { c: "#19C37D", tint: "#E4F7EE" },
  anniversary: { c: "#F0703A", tint: "#FDEEE6" },
  probation: { c: "#5B5E63", tint: "#EEEEEA" },
  commitment: { c: "#B7700A", tint: "#FBF1DF" },
  pipeline: { c: "#0E9F8A", tint: "#E0F4F1" },
};
/** The legend's order, as the mockup lists it. */
const STUDIO_LAYER_ORDER: OverlayKind[] = ["task", "renewal", "birthday", "leave", "holiday", "anniversary", "probation", "commitment", "pipeline"];
const chipVars = (c: string, tint: string) =>
  ({ "--chip-l": tint, "--chip-d": `color-mix(in srgb, ${c} 22%, #17181B)` }) as React.CSSProperties;
const ST_CHIP = "st-cal-chip flex h-[18px] w-full min-w-0 shrink-0 items-center gap-[5px] rounded-[5px] px-[5px] text-left text-[10.5px] leading-none";

function StudioEventChip({ event, onEdit }: { event: CalendarEventView; onEdit: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} title={event.title}
      className={cn(ST_CHIP, "hover:brightness-95")} style={{ "--chip-l": "#F3F3F1", "--chip-d": "#26282C" } as React.CSSProperties}>
      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--st-ink)]" />
      <span className="truncate">{event.allDay ? "" : `${fmtTime(event.startAt)} `}{event.title}</span>
    </button>
  );
}
function StudioOverlayChip({ item }: { item: OverlayItem }) {
  const { c, tint } = STUDIO_LAYER[item.kind];
  const inner = <><span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: c }} /><span className="truncate">{item.title}</span></>;
  return item.href
    ? <ReturnLink href={item.href} onClick={(e) => e.stopPropagation()} title={item.title} className={cn(ST_CHIP, "hover:brightness-95")} style={chipVars(c, tint)}>{inner}</ReturnLink>
    : <span title={item.title} className={ST_CHIP} style={chipVars(c, tint)}>{inner}</span>;
}
function ChevronDownIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>;
}

/** Studio's Agenda (mockup board Calendar, view "Agenda"): every coming day that
 *  has anything, as a heading and rows — time, dot, title, kind, Open. */
function StudioAgenda({ evByDay, overlayByDay, onEdit }: {
  evByDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onEdit: (e: CalendarEventView) => void;
}) {
  const [nowMs] = useState(() => Date.now());
  const days = useMemo(() => {
    const out: { d: Date; k: string; evs: CalendarEventView[]; ovs: OverlayItem[] }[] = [];
    const base = new Date(); base.setHours(12, 0, 0, 0);
    for (let i = 0; i < 62 && out.length < 30; i++) {
      const d = addDays(base, i); const k = keyOfDate(d);
      const evs = evByDay.get(k) ?? []; const ovs = overlayByDay.get(k) ?? [];
      if (evs.length + ovs.length) out.push({ d, k, evs, ovs });
    }
    return out;
  }, [evByDay, overlayByDay]);
  if (days.length === 0) return <div className="m-auto p-8 text-sm text-[var(--st-muted)]">Nothing in the next two months. Press “New event” to plan something.</div>;
  const ROW = "grid grid-cols-[64px_10px_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-[12px] border border-[var(--st-line-soft)] px-3.5 py-2.5";
  const OPEN = "flex h-7 items-center rounded-lg border border-[var(--st-line)] px-2.5 text-xs hover:bg-[var(--st-page)]";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
      {days.map(({ d, k, evs, ovs }) => {
        const n = evs.length + ovs.length;
        const today = k === todayKeyGlobal;
        return (
          <div key={k}>
            <div className="mb-2 flex items-baseline gap-2.5">
              <span className="text-[15px] font-semibold">{d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "short", day: "numeric", month: "short" })}</span>
              <span className={cn("text-xs", today ? "text-[var(--st-ok-text)]" : "text-[var(--st-muted)]")}>{today ? "Today · " : ""}{n} {n === 1 ? "thing" : "things"}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {evs.map((e) => {
                const done = hasElapsed(e, nowMs);
                return (
                  <div key={occKey(e)} className={cn(ROW, done && "opacity-60")}>
                    <span className="st-mono text-xs text-[var(--st-sub)]">{e.allDay ? "All day" : fmtTime(e.startAt)}</span>
                    <span className="h-2 w-2 rounded-full bg-[var(--st-ink)]" />
                    <span className="truncate text-[13px]">{e.title}</span>
                    <span className="text-[11px] text-[var(--st-muted)]">{isHappeningNow(e, nowMs) ? "On now" : done ? "Finished" : "Event"}</span>
                    <button type="button" onClick={() => onEdit(e)} className={OPEN}>Open</button>
                  </div>
                );
              })}
              {ovs.map((o) => (
                <div key={o.id} className={ROW}>
                  <span className="st-mono text-xs text-[var(--st-sub)]">{o.kind === "task" ? "Due" : "All day"}</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: STUDIO_LAYER[o.kind].c }} />
                  <span className="truncate text-[13px]">{o.title}</span>
                  <span className="text-[11px] text-[var(--st-muted)]">{OVERLAY_LABELS[o.kind].replace(/s$/, "")}</span>
                  {o.href ? <ReturnLink href={o.href} className={OPEN}>Open</ReturnLink> : <span />}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Studio's two cards: the picked day, and the next 7 days ------------ */

/** Everything on the picked day, in a list that scrolls inside the card (owner,
 *  24 Sept 2026: the 23rd had 12 things and the card showed 3). Events first, by
 *  time; then the layers in the legend's order. Each row goes where it belongs:
 *  an event opens its screen, a deadline its task, a renewal its document, a
 *  birthday its person — carrying the way back to this calendar. */
function StudioDayList({ dayKey, evs, ovs, onEdit }: {
  dayKey: string;
  evs: CalendarEventView[];
  ovs: OverlayItem[];
  onEdit: (e: CalendarEventView) => void;
}) {
  const order = (k: OverlayKind) => STUDIO_LAYER_ORDER.indexOf(k);
  const layers = [...ovs].sort((a, b) => order(a.kind) - order(b.kind) || a.title.localeCompare(b.title));
  const ROW = "grid grid-cols-[58px_10px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[12px] border border-[var(--st-card-line)] bg-[var(--st-card-2)] px-3 py-2 text-left";
  if (evs.length + ovs.length === 0) {
    return <div className="mt-auto text-sm text-[var(--st-muted)]">Nothing on this day. Press “New event” to plan something.</div>;
  }
  return (
    // mt-auto sits a short list at the foot of the card, as drawn; max-h-full
    // caps a long one at the card and lets it scroll.
    <div key={dayKey} className="st-scroll-dark mt-auto flex max-h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-1">
      {evs.map((e) => {
        const done = hasElapsed(e, Date.now());
        return (
          <button key={occKey(e)} type="button" onClick={() => onEdit(e)} className={cn(ROW, "shrink-0 transition-colors hover:bg-[var(--st-card-3)]", done && "opacity-60")}>
            <span className="st-mono text-xs text-[var(--st-on-card-muted)]">{e.allDay ? "All day" : fmtTime(e.startAt)}</span>
            <span className="h-2 w-2 rounded-full bg-[var(--st-on-card)]" />
            <span className="truncate text-[13px]">{e.title}</span>
            <span className="whitespace-nowrap text-[11px] text-[var(--st-muted)]">{isHappeningNow(e, Date.now()) ? "On now" : done ? "Finished" : "Event"}</span>
          </button>
        );
      })}
      {layers.map((o) => {
        const row = (
          <>
            <span className="st-mono text-xs text-[var(--st-on-card-muted)]">{o.kind === "task" ? "Due" : "All day"}</span>
            <span className="h-2 w-2 rounded-full" style={{ background: STUDIO_LAYER[o.kind].c }} />
            <span className="truncate text-[13px]" title={o.title}>{o.title}</span>
            <span className="whitespace-nowrap text-[11px] text-[var(--st-muted)]">{OVERLAY_LABELS[o.kind].replace(/s$/, "")}</span>
          </>
        );
        return o.href
          ? <ReturnLink key={o.id} href={o.href} className={cn(ROW, "shrink-0 transition-colors hover:bg-[var(--st-card-3)]")}>{row}</ReturnLink>
          : <div key={o.id} className={cn(ROW, "shrink-0")}>{row}</div>;
      })}
    </div>
  );
}

type Next7Day = { d: Date; k: string; ev: number; other: number };

/** The seven bars. Hover (or focus) one and a card says what that day holds;
 *  click it and the left card lists every one of them. */
function StudioNext7Bars({ days, perThing, pickedKey, evByDay, overlayByDay, onPick }: {
  days: Next7Day[];
  perThing: number;
  pickedKey: string;
  evByDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onPick: (d: Date) => void;
}) {
  const [hover, setHover] = useState<{ k: string; x: number; y: number } | null>(null);
  const show = (k: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setHover({ k, x: r.left + r.width / 2, y: r.top });
  };
  const day = hover ? days.find((d) => d.k === hover.k) : null;
  const evs = day ? evByDay.get(day.k) ?? [] : [];
  const ovs = day ? overlayByDay.get(day.k) ?? [] : [];
  const kinds = new Map<string, number>();
  if (evs.length) kinds.set(evs.length === 1 ? "event" : "events", evs.length);
  for (const o of ovs) {
    const label = OVERLAY_LABELS[o.kind].toLowerCase();
    kinds.set(label, (kinds.get(label) ?? 0) + 1);
  }
  const lines = [
    ...evs.map((e) => ({ key: occKey(e), c: "#F2F2F0", when: e.allDay ? "All day" : fmtTime(e.startAt), title: e.title })),
    ...ovs.map((o) => ({ key: o.id, c: STUDIO_LAYER[o.kind].c, when: o.kind === "task" ? "Due" : "All day", title: o.title })),
  ];
  const TIP_W = 280;
  return (
    <>
      <div className="grid h-[110px] grid-cols-7 items-end gap-2" aria-label="Things each day, the next seven days" onMouseLeave={() => setHover(null)}>
        {days.map((x, i) => {
          const n = x.ev + x.other;
          const dim = hover && hover.k !== x.k;
          const picked = x.k === pickedKey;
          return (
            <button key={x.k} type="button" onClick={() => onPick(x.d)}
              onMouseEnter={(e) => show(x.k, e.currentTarget)} onFocus={(e) => show(x.k, e.currentTarget)} onBlur={() => setHover(null)}
              aria-label={`${n} on ${x.d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "long" })} — show them`}
              className="group flex h-full min-w-0 flex-col items-center justify-end gap-[5px] outline-none">
              {/* Events (white) at the foot, everything else (pink) above. */}
              <span className={cn("flex w-full max-w-[30px] flex-col-reverse gap-0.5 transition-all duration-150 group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5", dim && "opacity-40")}>
                {x.ev > 0 && <span className="st-rise block rounded-[4px] bg-[var(--st-on-card)]" style={{ height: x.ev * perThing }} />}
                {x.other > 0 && <span className="st-rise block rounded-[4px] bg-[var(--st-late)]" style={{ height: x.other * perThing }} />}
                {n === 0 && <span className="block h-1 rounded-[4px] bg-[#2A2C30]" />}
              </span>
              <span className={cn("text-[11px] transition-colors", i === 0 || picked || hover?.k === x.k ? "text-[var(--st-on-card)]" : "text-[var(--st-muted)]", picked && "underline decoration-[var(--st-on-card-muted)] underline-offset-4")}>
                {x.d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "short" })}
              </span>
            </button>
          );
        })}
      </div>
      {hover && day && typeof document !== "undefined" && createPortal(
        /* ⚠️ Not `.studio`: its unlayered ink colour beats text-[…] utilities and
           drew the titles dark on dark. ⚠️ Placed by `bottom`, not a translate —
           st-pop animates `transform`, which wiped the offset and dropped the
           card BELOW the bar. */
        <div role="tooltip" className="st-pop pointer-events-none fixed z-[80] rounded-[14px] border border-[#26282C] bg-[#1A1B1E] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)] [font-family:var(--font-geist),var(--font-sans)]"
          style={{
            width: TIP_W,
            color: "#F2F2F0",
            left: Math.min(Math.max(8, hover.x - TIP_W / 2), window.innerWidth - TIP_W - 8),
            bottom: window.innerHeight - hover.y + 10,
          }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium">{day.d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "short" })}</span>
            <span className="text-[11px] text-[#8E9197]">{lines.length} {lines.length === 1 ? "thing" : "things"}</span>
          </div>
          {kinds.size > 0 && (
            <div className="mt-1 text-[11px] text-[#A3A6AB]">{[...kinds].map(([l, n]) => `${n} ${n === 1 ? l.replace(/s$/, "") : l}`).join(" · ")}</div>
          )}
          {lines.length === 0 ? (
            <div className="mt-2 text-xs text-[#8E9197]">Nothing on this day.</div>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {lines.slice(0, 6).map((l) => (
                <li key={l.key} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="w-[52px] shrink-0 whitespace-nowrap text-[11px] text-[#8E9197] [font-family:var(--font-geist-mono),ui-monospace,monospace]">{l.when}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.c }} />
                  <span className="truncate">{l.title}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 border-t border-[#26282C] pt-2 text-[11px] text-[#8E9197]">
            {lines.length > 6 ? `+${lines.length - 6} more · ` : ""}Click to list {lines.length > 1 ? "them all" : "it"} on the left
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ------------------------- Studio time grid (Week / Day) ------------------------
 * No mockup draws Week or Day, so they follow the Month board's own grammar:
 * the same tiles, chips, tints and today's disc, laid over hours. One grid for
 * both — seven columns or one. All-day entries and the layers (deadlines,
 * renewals…) sit in a strip on top; timed events are blocks at their time, side
 * by side when they overlap. Click an empty hour to start an event there. */
const HOUR_PX = { week: 44, day: 56 } as const;

function minutesOf(iso: string): number {
  const [h, m] = fmtTime(iso).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Lay out one day's timed events: start/end in minutes, and a lane in a cluster. */
function layoutDay(evs: CalendarEventView[]) {
  const items = evs
    .filter((e) => !e.allDay)
    .map((e) => {
      const s = minutesOf(e.startAt);
      const sameDay = e.endAt && keyOfIso(e.endAt) === keyOfIso(e.startAt);
      const end = e.endAt ? (sameDay ? minutesOf(e.endAt) : 24 * 60) : s + 60;
      return { e, s, end: Math.max(end, s + 20), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.s - b.s || b.end - a.end);
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const close = () => { const n = Math.max(1, ...cluster.map((c) => c.lane + 1)); cluster.forEach((c) => (c.lanes = n)); };
  for (const it of items) {
    if (it.s >= clusterEnd && cluster.length) { close(); cluster = []; }
    const used = new Set(cluster.filter((c) => c.end > it.s).map((c) => c.lane));
    let lane = 0; while (used.has(lane)) lane++;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) close();
  return items;
}

function StudioTimeGrid({
  days, byDay, overlayByDay, onEdit, onPickDay, onNewAt, mode,
}: {
  days: Date[];
  byDay: Map<string, CalendarEventView[]>;
  overlayByDay: Map<string, OverlayItem[]>;
  onEdit: (e: CalendarEventView) => void;
  onPickDay: (d: Date) => void;
  onNewAt: (dateKey: string, time: string) => void;
  mode: "week" | "day";
}) {
  const hourPx = HOUR_PX[mode];
  const scroller = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState(() => minutesOf(new Date().toISOString()));
  useEffect(() => { const t = setInterval(() => setNowMin(minutesOf(new Date().toISOString())), 60_000); return () => clearInterval(t); }, []);

  const cols = days.map((d) => {
    const k = keyOfDate(d);
    const evs = byDay.get(k) ?? [];
    return { d, k, timed: layoutDay(evs), allDay: evs.filter((e) => e.allDay), ovs: overlayByDay.get(k) ?? [] };
  });
  // 07:00–20:00, stretched to hold anything earlier or later.
  const firstHour = Math.min(7, ...cols.flatMap((c) => c.timed.map((t) => Math.floor(t.s / 60))));
  const lastHour = Math.max(20, ...cols.flatMap((c) => c.timed.map((t) => Math.ceil(t.end / 60))));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const stripMax = Math.max(0, ...cols.map((c) => c.allDay.length + c.ovs.length));

  // Open on the morning (or the first thing of the day), not at midnight.
  const firstStart = Math.min(...cols.flatMap((c) => c.timed.map((t) => t.s)), 8 * 60);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, ((firstStart - firstHour * 60) / 60) * hourPx - 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.getTime(), mode]);

  const gridCols = `52px repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="flex min-h-[520px] flex-1 flex-col lg:min-h-0">
      {/* Day heads — the date disc as in Month. */}
      <div className="grid px-2.5 pt-2.5" style={{ gridTemplateColumns: gridCols }}>
        <span />
        {cols.map(({ d, k }) => {
          const today = k === todayKeyGlobal;
          return (
            <button key={k} type="button" onClick={() => onPickDay(d)} disabled={mode === "day"}
              className="flex items-center gap-1.5 px-2 pb-1.5 text-left disabled:cursor-default">
              <span className="text-[11px] uppercase tracking-[0.04em] text-[var(--st-muted)]">{d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: mode === "day" ? "long" : "short" })}</span>
              <span className={cn("flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-xs tabular-nums",
                today && "bg-[var(--st-ink)] font-semibold text-[var(--st-surface)]")}>{d.getDate()}</span>
              {mode === "day" && <span className="text-xs text-[var(--st-muted)]">{d.toLocaleDateString("en-GB", { timeZone: EAT, month: "long", year: "numeric" })}</span>}
            </button>
          );
        })}
      </div>

      {/* All day + the layers. */}
      {stripMax > 0 && (
        <div className="grid border-b border-[var(--st-line-soft)] px-2.5 pb-2" style={{ gridTemplateColumns: gridCols }}>
          <span className="pr-2 pt-0.5 text-right text-[10px] text-[var(--st-muted)]">All day</span>
          {cols.map((c) => {
            // As in Month: the first few, then "+N more" — one busy day of
            // deadlines must not push the hours off the card. Day shows more.
            const cap = mode === "day" ? Infinity : 2;
            const chips = [
              ...c.allDay.map((e) => <StudioEventChip key={occKey(e)} event={e} onEdit={() => onEdit(e)} />),
              ...c.ovs.map((o) => <StudioOverlayChip key={o.id} item={o} />),
            ];
            return (
              <div key={c.k} className={cn("flex min-w-0 flex-col gap-[3px] px-1", mode === "day" && "max-h-[128px] overflow-y-auto")}>
                {chips.slice(0, cap)}
                {chips.length > cap && (
                  <button type="button" onClick={() => onPickDay(c.d)} className="px-1 text-left text-[10px] text-[var(--st-muted)] hover:text-[var(--st-ink)]">+{chips.length - cap} more</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* The hours. */}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="relative pr-2 text-right text-[10px] tabular-nums text-[var(--st-muted)]" style={{ height: hourPx }}>
                <span className="relative -top-1.5">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>
          {cols.map((c) => {
            const today = c.k === todayKeyGlobal;
            return (
              <div key={c.k} className={cn("relative min-w-0 border-l border-[var(--st-line-soft)]", today && "bg-[var(--st-cal-busy)]")}>
                {hours.map((h) => (
                  <button key={h} type="button" aria-label={`New event at ${String(h).padStart(2, "0")}:00`}
                    onClick={() => onNewAt(c.k, `${String(h).padStart(2, "0")}:00`)}
                    className="group block w-full border-t border-[var(--st-line-soft)] text-left transition-colors hover:bg-[var(--st-page)]" style={{ height: hourPx }}>
                    <span className="hidden px-1.5 text-[10px] text-[var(--st-muted)] group-hover:inline">+ {String(h).padStart(2, "0")}:00</span>
                  </button>
                ))}
                {c.timed.map(({ e, s, end, lane, lanes }) => {
                  const top = ((s - firstHour * 60) / 60) * hourPx;
                  const height = Math.max(20, ((end - s) / 60) * hourPx - 2);
                  const done = hasElapsed(e, Date.now());
                  return (
                    <button key={occKey(e)} type="button" onClick={() => onEdit(e)} title={`${fmtTime(e.startAt)} ${e.title}`}
                      className={cn("absolute flex flex-col overflow-hidden rounded-[8px] border border-[var(--st-line)] bg-[var(--st-surface)] px-1.5 py-[3px] text-left text-[11px] leading-tight shadow-[0_1px_2px_rgba(17,18,20,0.06)] transition-colors hover:border-[var(--st-ink)]",
                        done && "opacity-60")}
                      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}>
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--st-ink)]" />
                        <span className="shrink-0 tabular-nums text-[var(--st-muted)]">{fmtTime(e.startAt)}</span>
                        {/* A short block has one line: time and title together. */}
                        {height < 34 && <span className="min-w-0 truncate font-medium">{e.title}</span>}
                      </span>
                      {height >= 34 && <span className="line-clamp-2 min-w-0 font-medium">{e.title}</span>}
                      {height > 58 && e.location && <span className="truncate text-[var(--st-muted)]">{e.location}</span>}
                    </button>
                  );
                })}
                {today && nowMin >= firstHour * 60 && nowMin <= lastHour * 60 && (
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowMin - firstHour * 60) / 60) * hourPx }}>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-[var(--st-late)]" />
                    <span className="h-px flex-1 bg-[var(--st-late)]" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Week view ----------------------------- */

/* ------------------------------- Day view ----------------------------- */

/* -------------------------- Housed agenda (Brief) --------------------- */


/* ----------------------------- Mini month (rail) ---------------------- */

/* ------------------------------ Brief rail ---------------------------- */

/** Everything you can DO to a saved event — send the invite, add a Meet room,
 *  share it, preview the email, draft reminders or a follow-up, delete it —
 *  with its two dialogs. ONE copy: the agenda row (Desk) and the Studio event
 *  screen's dark action bar both call it, so the two can never do different
 *  things. `event` is null on a new, unsaved event: every action is a no-op. */
function useEventActions(event: CalendarEventView | null, onDeleted?: () => void) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; recipients: string[] } | null>(null);
  // Delete confirmation (Aurora dialog, replaces the native confirm). For a
  // recurring event the operator chooses this-date-only vs the whole series.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isRecurring = !!event?.recurrence && event.recurrence !== "none";
  // UTC-derived key — MUST match how excluded dates + occurrence meeting_dates are
  // stored elsewhere (edit-form skip + deleteTaskForOccurrence).
  const occDateKey = event ? new Date(event.startAt).toISOString().slice(0, 10) : "";
  const [delScope, setDelScope] = useState<"occurrence" | "series">("occurrence");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = event ? `${origin}/e/${event.publicToken}` : "";

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast("Share link copied", { tone: "success" });
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function shareWhatsApp() {
    if (!event) return;
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
    if (!event) return;
    start(async () => {
      if (isRecurring && delScope === "occurrence") {
        const r = await skipEventOccurrence(event!.id, occDateKey);
        if (!r.ok) { toast(r.error, { tone: "danger" }); return; }
        toast("This event was cancelled — the rest of the series stays. Its task was removed.", { tone: "success", duration: 6000 });
      } else {
        const r = await deleteEventAction(event!.id);
        if (!r.ok) { toast(r.error, { tone: "danger" }); return; }
        const whole = isRecurring; // deleting a series vs a single one-off
        if (r.googleCancelled) toast(whole ? "Whole series deleted — guests notified." : "Event deleted — guests notified of the cancellation.", { tone: "success", duration: 6000 });
        else toast(whole ? "Whole series deleted." : "Event deleted.", { tone: "success" });
      }
      setConfirmOpen(false);
      onDeleted?.();
    });
  }

  const emailCount = event ? event.attendees.filter((a) => a.email).length : 0;
  const isPast = event ? new Date(event.endAt ?? event.startAt).getTime() < Date.now() : false;

  function openPreview() {
    if (!event) return;
    start(async () => {
      const r = await previewEventInviteAction(event!.id, isPast ? "followup" : "invite");
      if (r.ok) setPreview({ subject: r.subject, html: r.html, recipients: r.recipients });
      else toast(r.error, { tone: "danger" });
    });
  }

  function addMeetNow() {
    if (!event) return;
    start(async () => {
      const m = await ensureEventMeetLink(event!.id);
      if (m.meetLink) toast("Google Meet link added. Press Send invite so guests get it.", { tone: "success", duration: 8000 });
      else toast("Google gave no Meet link — is Google connected in Settings?", { tone: "warn", duration: 6000 });
    });
  }

  function draftReminders() {
    if (!event) return;
    start(async () => {
      const r = await draftEventRemindersAction(event!.id);
      if (r.ok) toast(`Drafted ${r.count} reminder${r.count === 1 ? "" : "s"} in the Outbox to review.`, { tone: "success", duration: 6000 });
      else toast(r.error, { tone: "danger" });
    });
  }
  function draftFollowup() {
    if (!event) return;
    start(async () => {
      const r = await draftEventFollowupAction(event!.id);
      if (r.ok) toast(`Drafted ${r.count} follow-up${r.count === 1 ? "" : "s"} in the Outbox to review.`, { tone: "success", duration: 6000 });
      else toast(r.error, { tone: "danger" });
    });
  }

  function sendInvite() {
    if (!event) return;
    start(async () => {
      const r = await sendEventInviteAction(event!.id);
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

  const dialogs = (
    <>
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
              <p className="font-medium leading-snug">{event?.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{event ? fmtDayLabel(event.startAt) : ""}{!event || event.allDay ? "" : ` · ${fmtTime(event.startAt)}`}</span>
                {event?.companyLabel && <span className="inline-flex items-center gap-1"><Building2 size={12} />{event.companyLabel}</span>}
                {event && event.attendees.length > 0 && <span className="inline-flex items-center gap-1"><Users size={12} />{event.attendees.length} {event.attendees.length === 1 ? "attendee" : "attendees"}</span>}
                {isRecurring && <span className="inline-flex items-center gap-1 capitalize"><Repeat size={12} />{event?.recurrence}</span>}
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
                        <span className="block text-base font-medium text-fg">{o.label}</span>
                        <span className="block text-xs text-fg-muted">{o.desc}</span>
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
    </>
  );
  return { pending, copied, emailCount, isPast, sendInvite, addMeetNow, copyLink, shareWhatsApp, openPreview, draftReminders, draftFollowup, remove, dialogs };
}

function EventRow({ event, onEdit, finished = false, onNow = false }: { event: CalendarEventView; onEdit: () => void; finished?: boolean; onNow?: boolean }) {
  const { pending, copied, emailCount, isPast, sendInvite, addMeetNow, copyLink, shareWhatsApp, openPreview, draftReminders, draftFollowup, remove, dialogs } = useEventActions(event);

  return (
    <Card className={cn("p-3", finished && "opacity-55", onNow && "ring-1 ring-accent/40")}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-14 text-center">
          <div className={cn("text-sm font-semibold tabular-nums", finished && "text-fg-muted")}>{event.allDay ? "All day" : fmtTime(event.startAt)}</div>
          {!event.allDay && event.endAt && (
            <div className="text-xs text-fg-muted tabular-nums">{fmtTime(event.endAt)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("font-medium leading-snug", finished && "text-fg-muted line-through decoration-fg-subtle/40")}>
            {event.title}
            {onNow && <span className="ml-2 align-middle rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">On now</span>}
            {finished && <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Finished</span>}
          </div>
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

          {/* ONE action row, every size: what you do most (send the invite,
              edit) as buttons, everything else behind ⋯. Seven small buttons
              on every card made two events fill a screen. */}
          <div className="mt-2.5 flex items-center gap-1.5">
            {emailCount > 0 && !isPast && (
              <button
                onClick={sendInvite}
                disabled={pending}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                title={`Email the invite (.ics attached) to ${emailCount} attendee${emailCount === 1 ? "" : "s"}`}
              >
                <Mail size={13} /> Send invite
              </button>
            )}
            <button onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-3 text-xs font-medium text-fg-muted transition-colors hover:text-fg" title="Edit">
              <Pencil size={13} /> Edit
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg-elev text-fg-muted transition-colors hover:text-fg"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={15} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  sideOffset={6}
                  align="start"
                  className="z-[60] min-w-[200px] rounded-md border border-border bg-bg-elev p-1 text-sm shadow-lg"
                >
                  {!event.meetLink && !isPast && (
                    <DropdownMenu.Item
                      disabled={pending}
                      onSelect={(e) => { e.preventDefault(); addMeetNow(); }}
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-50"
                    >
                      <Video size={15} /> Add a Google Meet link
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item asChild>
                    <a href={event.icsPath}
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted">
                      <Download size={15} /> Download .ics
                    </a>
                  </DropdownMenu.Item>
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
                  {emailCount > 0 && isPast && (
                    <DropdownMenu.Item
                      disabled={pending}
                      onSelect={(e) => { e.preventDefault(); sendInvite(); }}
                      className="px-2.5 py-2 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-50"
                    >
                      <Mail size={15} /> Send invite again
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

      {dialogs}
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

/** The mockup's words for the alarm chips (the Desk form keeps its short ones). */
const STUDIO_REMINDER_WORDS: Record<number, string> = { 0: "At start", 10: "10 min", 30: "30 min", 60: "1 hour", 1440: "1 day", 2880: "2 days", 10080: "1 week" };

/** Studio's tick box: 16px, 5px corners, ink when ticked (mockup board Event). */
function StudioTick({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={(e) => { e.preventDefault(); onClick(); }}
      className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
        on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-dash)]")}>
      {on && <Check size={11} strokeWidth={3} />}
    </button>
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
  seed = null,
}: {
  /** A new event started from a grid slot: its day and hour. */
  seed?: { date: string; time: string } | null;
  people: Person[];
  companies: Company[];
  categories: EventCategory[];
  editing: CalendarEventView | null;
  allEvents: CalendarEventView[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // The saved event's own actions (invite, Meet, share, preview, remind, delete)
  // — the Studio screen's dark bar. A no-op set on a new event.
  const acts = useEventActions(editing, onClose);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && document.querySelectorAll('[role="dialog"]').length <= 1) onClose(); };
    // On WINDOW, not document: menus inside listen on document and claim Escape
    // with preventDefault — document listeners run first, so by the time it
    // reaches here a menu has already said "that one was mine".
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [picked, setPicked] = useState<CalendarAttendee[]>(editing?.attendees ?? []);
  useEffect(() => {
    if (editing || meetTouched.current) return;
    setAddMeet(picked.some((p) => p.email));
  }, [picked, editing]);
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
  const slotEnd = seed ? `${String(Math.min(23, Number(seed.time.slice(0, 2)) + 1)).padStart(2, "0")}:${seed.time.slice(3, 5)}` : null;
  const [startDate, setStartDate] = useState<string>(editing ? dateOf(startSeed) : seed?.date ?? dateOf(startSeed));
  const [startTime, setStartTime] = useState<string>(editing ? timeOf(startSeed) || "09:00" : seed?.time ?? (timeOf(startSeed) || "09:00"));
  const [endDate, setEndDate] = useState<string>(editing ? dateOf(endSeed) : seed?.date ?? dateOf(endSeed));
  const [endTime, setEndTime] = useState<string>(editing ? timeOf(endSeed) || "10:00" : slotEnd ?? (timeOf(endSeed) || "10:00"));

  const startVal = startDate ? (allDay ? startDate : `${startDate}T${startTime}`) : "";
  const endVal = endDate ? `${endDate}T${endTime}` : "";
  // A Meet room FOLLOWS THE GUESTS until you touch the switch: an entry with
  // somebody invited by email is a meeting and gets a room; a flight, a site
  // visit or a lunch with nobody on it does not. The old rule was opt-in for
  // everything, and an interview went out to three guests with no link
  // because the tick under "Meeting link" read as a footnote (2 Sept 2026).
  const [addMeet, setAddMeet] = useState(false);
  const meetTouched = useRef(false);
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
          // The server minted the room BEFORE it sent the invitation; this is
          // only the belt-and-braces retry for a room Google refused first time.
          const m = r.meetMissing ? await ensureEventMeetLink(r.id) : { meetLink: "ok" };
          const roomNote = r.meetMissing
            ? (m.meetLink ? " Google gave the Meet link late — press Send invite so guests get it." : " Google gave NO Meet link — check the Google connection in Settings, then Send invite again.")
            : " Google Meet link added.";
          toast("Event created." + roomNote + taskNote + inviteNote, { tone: r.meetMissing || r.inviteNotConfigured ? "warn" : "success", duration: r.meetMissing ? 10000 : 6000 });
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

  // ---- Studio (mockup board Event, design/studio-mockup/gen/p_event.py) ----
  // The SAME form: every field above feeds the same `submit`, and the dark bar
  // calls the same actions the agenda row does (useEventActions). Only the
  // layout is the mockup's: title · two columns · a footer that says whether
  // it clashes.
  const LBL = "flex items-center justify-between gap-3 text-xs text-[var(--st-label)]";
  const HINT = "text-[11px] text-[#A3A6AB]";
  const BOX = "flex h-[38px] min-w-0 items-center gap-2 rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px]";
  const BARE = "bare-field h-full w-full min-w-0 rounded-none p-0 text-[13px] outline-none ring-0 focus:ring-0 placeholder:text-[var(--st-muted)]";
  const ACT = "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#2E3035] px-2.5 text-xs text-[#E6E6E3] transition-colors hover:bg-[#1F2023] disabled:opacity-40";
  const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(",", "");
  const shortDay = startDate ? new Date(`${startDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : null;
  const hasEmails = picked.some((p) => p.email);
  return createPortal(
    <div className="studio fixed inset-0 z-[90] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={editing ? "Edit event" : "New event"}>
      <div className="st-tex-paper-dots absolute inset-0 bg-[var(--st-scrim)]" onClick={onClose} />
      <form id="calendar-event-form" action={submit}
        className="st-pop relative flex h-[min(760px,calc(100dvh-24px))] w-[min(1120px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px] bg-[var(--st-surface)] shadow-[0_30px_80px_rgba(17,18,20,0.22)]">
        {/* ── The dark bar: back to the calendar, then everything you can DO to it. */}
        <div className="flex shrink-0 items-center gap-2 bg-[#141517] px-[18px] py-3.5 text-[#F2F2F0]">
          <button type="button" onClick={onClose} className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg bg-[#F2F2F0] px-2.5 text-xs font-medium text-[#111214]">
            <ChevronLeft size={13} strokeWidth={2.2} />Calendar
          </button>
          <span className="mx-1.5 h-5 w-px shrink-0 bg-[#2E3035]" />
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {editing ? (
              <>
                {acts.emailCount > 0 && (
                  <button type="button" onClick={acts.sendInvite} disabled={acts.pending} className={ACT} title={`Email the invitation to ${acts.emailCount} guest${acts.emailCount === 1 ? "" : "s"}`}>
                    <Send size={13} />{acts.isPast ? "Send again" : "Send invite"}
                  </button>
                )}
                {editing.meetLink
                  ? <a href={editing.meetLink} target="_blank" rel="noreferrer" className={ACT}><Link2 size={13} />Meet link</a>
                  : !acts.isPast && <button type="button" onClick={acts.addMeetNow} disabled={acts.pending} className={ACT} title="Add a Google Meet room"><Link2 size={13} />Meet link</button>}
                <a href={editing.icsPath} className={ACT}><Download size={13} />.ics</a>
                <a href={editing.googleUrl} target="_blank" rel="noreferrer" className={ACT}><Globe size={13} />Google</a>
                <button type="button" onClick={acts.copyLink} className={ACT}>{acts.copied ? <Check size={13} /> : <Copy size={13} />}Copy link</button>
                <button type="button" onClick={acts.shareWhatsApp} className={ACT}><MessageCircle size={13} />WhatsApp</button>
                {acts.emailCount > 0 && <button type="button" onClick={acts.openPreview} disabled={acts.pending} className={ACT}><Eye size={13} />Preview email</button>}
                {acts.emailCount > 0 && !acts.isPast && <button type="button" onClick={acts.draftReminders} disabled={acts.pending} className={ACT} title="Draft a reminder to each guest in the Outbox"><Bell size={13} />Remind</button>}
                {acts.emailCount > 0 && acts.isPast && <button type="button" onClick={acts.draftFollowup} disabled={acts.pending} className={ACT} title="Draft a follow-up to each guest in the Outbox"><Undo2 size={13} />Follow-up</button>}
              </>
            ) : (
              <span className="self-center truncate px-1 text-xs text-[#8E9197]">New event — the invite, the links and sharing appear here once it is saved.</span>
            )}
          </div>
          {editing && (
            <button type="button" onClick={acts.remove} disabled={acts.pending}
              className="h-[30px] shrink-0 rounded-lg border border-[#4A2A3C] px-2.5 text-xs text-[#F07BBE] transition-colors hover:bg-[#2A1622]">Delete…</button>
          )}
        </div>

        {/* ── Body: what, when, who, where on the left; papers, alarms, repeats on the right. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-8 gap-y-4 overflow-y-auto px-[26px] py-[22px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <label className="block">
              <span className="sr-only">Title</span>
              <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it?" autoFocus={!editing}
                style={{ background: "transparent", border: 0, borderBottom: "1px solid var(--st-line-soft)", borderRadius: 0, boxShadow: "none", color: "var(--st-ink)" }}
                className="w-full pb-2.5 text-[26px] font-medium tracking-[-0.02em] outline-none placeholder:text-[var(--st-muted)]" />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className={LBL}><span>When</span><span className={HINT}>Times are Dar es Salaam (EAT)</span></span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className={BOX}>
                  <DatePopover block value={startDate || null} label={startDate ? longDay(startDate) : "Pick a day"} tone="text-[var(--st-muted)]"
                    triggerClassName="h-full min-w-0 flex-1 bg-transparent text-[13px] [&>svg:last-child]:hidden"
                    onChange={(d) => { setStartDate(d); if (!endDate) setEndDate(d); }} />
                  {!allDay && <><span className="text-[var(--st-muted)]">·</span><TimeField className="w-[58px] shrink-0" inputClassName={cn(BARE, "px-0")} value={startTime} onChange={setStartTime} /></>}
                </div>
                {allDay ? (
                  <div className={cn(BOX, "text-[var(--st-muted)]")}><Clock size={14} />All day — no end time</div>
                ) : (
                  <div className={BOX}>
                    <DatePopover block value={endDate || null} label={endDate ? longDay(endDate) : "Ends — set it"} tone="text-[var(--st-muted)]"
                      triggerClassName={cn("h-full min-w-0 flex-1 bg-transparent text-[13px] [&>svg:last-child]:hidden", !endDate && "[&>span]:!text-[var(--st-muted)]")}
                      onChange={setEndDate} />
                    <span className="text-[var(--st-muted)]">·</span>
                    <TimeField className="w-[58px] shrink-0" inputClassName={cn(BARE, "px-0")} value={endTime} onChange={setEndTime} />
                  </div>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-[var(--st-sub)]">
                <label className="flex cursor-pointer select-none items-center gap-1.5">
                  <StudioTick on={allDay} onClick={() => setAllDay((v) => !v)} />All day
                </label>
                <span className="text-[var(--st-muted)]">
                  Quick:{" "}
                  {TEMPLATES.map((t, i) => (
                    <span key={t.label}>{i > 0 && " · "}<button type="button" onClick={() => applyTemplate(t)} className="hover:text-[var(--st-ink)] hover:underline">{t.label}</button></span>
                  ))}
                </span>
              </div>
              <input type="hidden" name="startAt" value={startDate ? (allDay ? startDate : `${startDate}T${startTime}`) : ""} />
              {!allDay && <input type="hidden" name="endAt" value={endDate ? `${endDate}T${endTime}` : ""} />}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={LBL}><span>Guests</span><span className={HINT}>Green dot = will get the email</span></span>
              <AttendeePicker studio people={people} value={picked} onChange={setPicked} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={LBL}><span>{companyIds.length > 1 ? `Companies · ${companyIds.length}` : "Companies"}</span>{companyIds.length > 1 && <span className={HINT}>first is the lead</span>}</span>
                <CompanyMultiSelect companies={companies} value={companyIds} onChange={setCompanyIds} buttonClassName={cn(BOX, "w-full justify-between")} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={LBL}><span>Type</span></span>
                <div className={BOX}>
                  <FolderClosed size={14} className="shrink-0 text-[var(--st-muted)]" />
                  <Combobox name="category" options={categories.map((c) => c.name)} defaultValue={editing?.categoryName ?? ""} placeholder="Choose a type" className={BARE} />
                </div>
              </div>
            </div>
            <input type="hidden" name="companyId" value={companyIds[0] ?? ""} />
            <input type="hidden" name="companyIds" value={JSON.stringify(companyIds)} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={LBL}><span>Where</span></span>
                <div className={BOX}>
                  <Globe size={14} className="shrink-0 text-[var(--st-muted)]" />
                  <input name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office, address…" className={BARE} />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={LBL}><span>Meeting link</span></span>
                <div className="flex items-center gap-2">
                  <div className={cn(BOX, "flex-1")}>
                    <Link2 size={14} className="shrink-0 text-[var(--st-muted)]" />
                    <input name="meetLink" defaultValue={editing?.meetLink ?? ""} placeholder={addMeet ? "Google Meet — made on save" : "No link"} className={BARE} />
                  </div>
                  {!editing && (
                    <button type="button" role="switch" aria-checked={addMeet} onClick={() => { meetTouched.current = true; setAddMeet((v) => !v); }}
                      title={addMeet ? "A Google Meet room is made with the event and sent in the invitation" : hasEmails ? "Guests will get the invitation with no way to join online" : "Switch on for a video call"}
                      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[var(--st-sub)]">
                      <span className={cn("relative h-[18px] w-[30px] rounded-full transition-colors", addMeet ? "bg-[var(--st-ink)]" : "bg-[var(--st-track-off)]")}>
                        <span className={cn("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all", addMeet ? "left-[14px]" : "left-[2px]")} />
                      </span>
                      Meet
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={LBL}><span>Notes for guests</span></span>
              <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Agenda, what to bring, how to get there…"
                style={{ background: "var(--st-surface)", border: "1px solid var(--st-line)", borderRadius: 10, boxShadow: "none", color: "var(--st-sub)" }}
                className="min-h-16 w-full resize-y px-3 py-2.5 text-[13px] leading-[1.45] outline-none placeholder:text-[var(--st-muted)]" />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3.5">
            {readBanner && <StudioReadCard prefill={readBanner} onDismiss={() => setReadBanner(null)} />}

            <EventAttachments studio eventId={editing?.id ?? null} companyId={companyIds[0] ?? editing?.companyId ?? null}
              value={attachments} onChange={setAttachments} onPrefill={applyPrefill} allowLibrary />

            <div className="flex flex-col gap-1.5">
              <span className={LBL}><span>Remind me</span></span>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_OPTS.map((o) => {
                  const on = reminders.includes(o.v);
                  return (
                    <button key={o.v} type="button" aria-pressed={on} onClick={() => toggleReminder(o.v)}
                      className={cn("flex h-7 items-center rounded-lg border px-2.5 text-xs transition-colors",
                        on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-line)] bg-[var(--st-surface)] hover:bg-[var(--st-page)]")}>
                      {STUDIO_REMINDER_WORDS[o.v] ?? o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={LBL}><span>Repeats</span></span>
                <FluidSelect value={recurrence} onSelect={setRecurrence}
                  options={[{ value: "none", label: "Does not repeat" }, { value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "monthly", label: "Every month" }]}
                  buttonClassName={cn(BOX, "w-full justify-between")} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={LBL}><span>Until</span></span>
                {recurrence === "none" ? (
                  <div className={cn(BOX, "text-[var(--st-muted)]")}>—</div>
                ) : (
                  <div className={BOX}>
                    <DatePopover block value={recurrenceUntil || null} label={recurrenceUntil ? longDay(recurrenceUntil) : "No end"} tone="text-[var(--st-muted)]"
                      triggerClassName="h-full min-w-0 flex-1 bg-transparent text-[13px] [&>svg:last-child]:hidden" onChange={setRecurrenceUntil} />
                  </div>
                )}
              </div>
            </div>

            {isRecurring && (
              <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--st-line-soft)] px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--st-sub)]">One date of a repeating event — you can cancel just this one.</span>
                  {alreadySkipped
                    ? <span className="shrink-0 text-[var(--st-late-text)]">This date is cancelled</span>
                    : <button type="button" onClick={doSkip} disabled={pending} className="h-7 shrink-0 rounded-lg border border-[var(--st-line)] px-2.5 hover:bg-[var(--st-page)]">Skip {new Date(editing!.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</button>}
                </div>
                {editing!.excludedDates.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--st-line-soft)] pt-2">
                    <span className="text-[var(--st-muted)]">Cancelled (tap to restore):</span>
                    {editing!.excludedDates.map((d) => (
                      <button key={d} type="button" onClick={() => doRestore(d)} disabled={pending}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--st-page)] px-2 py-0.5 hover:text-[var(--st-ink)]">
                        {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} <X size={10} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              {editing && hasEmails && (
                <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px]">
                  <StudioTick on={notifyGuests} onClick={() => setNotifyGuests((v) => !v)} />
                  Tell guests about this change
                  <span className="text-[11px] text-[#A3A6AB]">{notifyGuests ? "(they get an email of what changed)" : "(their calendar updates by itself)"}</span>
                </label>
              )}
              {!editing && (
                <label className={cn("flex cursor-pointer select-none items-center gap-2.5 text-[13px]", !trackTask && "text-[var(--st-sub)]")}>
                  <StudioTick on={trackTask} onClick={() => setTrackTask((v) => !v)} />
                  {companyIds.length > 1 ? `Track as ${companyIds.length} tasks` : "Track this meeting as a task"}
                  <span className="text-[11px] text-[#A3A6AB]">{companyIds.length ? "(new events · one per company)" : "(pick a company first)"}</span>
                </label>
              )}
            </div>
            <input type="hidden" name="trackAsTask" value={trackTask && companyIds.length > 0 ? "on" : "off"} />
          </div>
        </div>

        {/* ── Footer: does it clash? then Cancel / Save. */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--st-line-soft)] px-[26px] py-3.5">
          <span className={cn("min-w-0 flex-1 truncate text-xs", conflicts.length ? "text-[var(--st-soon-text)]" : "text-[var(--st-muted)]")}>
            {!startDate
              ? "Pick a day to check for clashes."
              : allDay
                ? `All day on ${shortDay}.`
                : conflicts.length
                  ? `Clashes with ${conflicts.slice(0, 2).map((c) => c.title).join(", ")}${conflicts.length > 2 ? ` and ${conflicts.length - 2} more` : ""} on ${shortDay}.`
                  : `No clash with anything else on ${shortDay}.`}
          </span>
          <button type="button" onClick={onClose} className="flex h-[38px] items-center rounded-[10px] border border-[var(--st-line)] px-4 text-[13px] hover:bg-[var(--st-page)]">Cancel</button>
          <button type="submit" disabled={pending} className="flex h-[38px] items-center gap-1.5 rounded-[10px] bg-[var(--st-ink)] px-[18px] text-[13px] font-semibold text-[var(--st-surface)] transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending && <Loader2 size={14} className="animate-spin" />}{editing ? "Save changes" : "Create event"}
          </button>
        </div>
      </form>
      {acts.dialogs}
    </div>,
    document.body,
  );
}

/* -------------------------- Announcements panel ----------------------- */

