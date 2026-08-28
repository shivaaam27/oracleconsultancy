"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, MessageCircle, ListTodo, Clock, Copy, UserPlus, UserMinus, UserCheck, CheckSquare, X, Pencil, ShieldCheck, ShieldOff, Users, PhoneOff, MoonStar, Flame, Hourglass, UserX, ChevronDown, Check, Target, SkipForward, Wrench, SlidersHorizontal, Building2, Rows3, MapPin, Layers } from "lucide-react";
import { PersonCard } from "./person-card";
import { PeopleRecordList, PeopleListHeader } from "./people-record-list";
import { CompanyAvatar } from "./company-avatar";
import { Combobox } from "./combobox";
import { PeekPreview, type PeekAction } from "./peek-preview";
import { FluidSelect } from "./fluid-select";
import { Button, Select } from "./ui";
import { FilterChips } from "./filter-chips";
import { BottomSheet } from "./bottom-sheet";
import { triggerHaptic } from "@/lib/use-long-press";
import { cn } from "@/lib/cn";
import { displayNote } from "@/lib/notes-display";
import { getInitials } from "@/lib/names";
import { useToast } from "./toast";
import { snoozePerson, togglePersonActive, setPeopleActive, bulkSetPeopleField, bulkAddSecondaryManager, bulkSetPortalRole } from "@/app/people/actions";
import type { PersonRow } from "@/lib/people-queries";
import { PERSON_TYPES, PERSON_TYPE_LABELS, type PersonType } from "@/lib/person-types";
import { PORTAL_ROLES, ROLE_LABEL, asPortalRole as asRole, type PortalRoleKey } from "@/lib/portal-permissions";

/* ------------------------------------------------------- phone filters --- */

type SheetChoice = { value: string; label: string };

/**
 * Every picker on the directory, on a phone.
 *
 * The page opened with FIVE bands of chrome — search, then Company/Type/Location,
 * then Comfortable|Compact + Group + Select, then two wrapped rows of chips — and
 * the first person did not appear until 530px down an 812px screen. The pickers
 * come in here behind one button, the same shape the Tasks screen uses: a row per
 * group showing what is picked, opening its own list, one at a time.
 *
 * Plain buttons, deliberately — a `FluidSelect` opens its own portalled popover,
 * and a popover on top of a sheet is a stack of two floating layers on a 375px
 * screen.
 */
function PeopleFilterSheet({
  open, onClose, groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    value: string;
    options: SheetChoice[];
    onPick: (value: string) => void;
    /** Dimmed when this group is at its default (i.e. filtering nothing). */
    isDefault: boolean;
  }>;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <BottomSheet open={open} onClose={onClose} title="Filters" icon={<SlidersHorizontal size={16} />}>
      <div className="divide-y divide-border/70">
        {groups.map((g) => {
          const isOpen = openKey === g.key;
          const current = g.options.find((o) => o.value === g.value);
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => setOpenKey((k) => (k === g.key ? null : g.key))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2.5 py-3 text-left"
              >
                <span className={cn("shrink-0", g.isDefault ? "text-fg-subtle" : "text-accent")}>{g.icon}</span>
                <span className="shrink-0 text-base font-medium text-fg">{g.label}</span>
                <span className={cn("ml-auto min-w-0 truncate text-sm", g.isDefault ? "text-fg-muted" : "font-medium text-accent")}>
                  {current?.label ?? g.value}
                </span>
                <ChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="max-h-64 overflow-y-auto pb-2">
                  {g.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => { g.onPick(o.value); onClose(); }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        o.value === g.value ? "bg-accent/12 font-medium text-fg" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.value === g.value && <Check size={14} className="shrink-0 text-accent" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

/** A short WhatsApp reminder built from the person's most urgent tasks. */
function quickReminderText(p: PersonRow): string {
  const lines = [`Hi ${p.name}, a quick reminder:`, ""];
  p.topTasks.forEach((t) => lines.push(`• ${t.actionItem} (${t.code})`));
  lines.push("", "Please update the tracker when you can. Thanks.");
  return lines.join("\n");
}

type FilterKind = "all" | "noContact" | "snoozed" | "inactive" | "overloaded" | "probationEnding" | "portal" | "noPortal";
type Mode = "browse" | "attention";
type Density = "comfortable" | "compact";
type GroupBy = "company" | "manager" | "department" | "site" | "none";

const GROUP_LABELS: Record<GroupBy, string> = {
  company: "Company",
  manager: "Manager",
  department: "Department",
  site: "Location",
  none: "No grouping",
};

function whatsappHref(num: string) {
  return `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
}

/** True if the person's probation ends within the next 30 days (and not past). */
function probationEndingSoon(p: PersonRow, now: Date): boolean {
  if (!p.probationEndDate) return false;
  const days = (p.probationEndDate.getTime() - now.getTime()) / 86400000;
  return days >= 0 && days <= 30;
}
function daysUntilProbation(p: PersonRow, now: Date): number {
  if (!p.probationEndDate) return 0;
  return Math.ceil((p.probationEndDate.getTime() - now.getTime()) / 86400000);
}

type AttnReason = { text: string; tone: "red" | "amb" };

/**
 * Worst-first score for the Attention ritual — the same deterministic-score
 * idea the Tasks Focus queue uses, pointed at people-hygiene. Higher = needier.
 */
function attentionScore(p: PersonRow, now: Date): { score: number; reasons: AttnReason[] } {
  const reasons: AttnReason[] = [];
  let score = 0;
  if (!p.hasContact) { score += 3; reasons.push({ text: "No contact info", tone: "red" }); }
  if (probationEndingSoon(p, now)) {
    const d = daysUntilProbation(p, now);
    score += 2; reasons.push({ text: `Probation ends in ${d}d`, tone: "amb" });
  }
  if (p.workload.overdue > 0) { score += 2; reasons.push({ text: `${p.workload.overdue} overdue task${p.workload.overdue === 1 ? "" : "s"}`, tone: "red" }); }
  else if (p.workload.open >= 5) { score += 1; reasons.push({ text: `Overloaded · ${p.workload.open} open`, tone: "amb" }); }
  return { score, reasons };
}

export function PeopleTable({ people, companies, directoryHints, createSlot, totalCompanies, totalSites }: {
  people: PersonRow[];
  companies: Array<{ id: number; name: string; accentColor?: string | null; logoUrl?: string | null }>;
  directoryHints?: Record<number, { onLeave: boolean; present: number; absent: number }>;
  /** Create actions (New person / blank form) — rendered above the search, per CC rules. */
  createSlot?: React.ReactNode;
  totalCompanies?: number;
  totalSites?: number;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [companyFilter, setCompanyFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | PersonType>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [mode, setMode] = useState<Mode>("browse");
  const [density, setDensity] = useState<Density>("comfortable");
  const [groupBy, setGroupBy] = useState<GroupBy>("company");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  // Density is a per-browser preference, like the Tasks page.
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem("cos-people-density") : null;
    if (v === "compact" || v === "comfortable") setDensity(v);
  }, []);
  function changeDensity(d: Density) {
    setDensity(d);
    try { window.localStorage.setItem("cos-people-density", d); } catch { /* ignore */ }
  }

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [, startSnooze] = useTransition();
  const [, startBulk] = useTransition();
  const [peek, setPeek] = useState<PersonRow | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const moved = useRef(false);
  const lastPointerType = useRef<string>("mouse");

  /** A person is a PAGE now (/people/<id>), the same as a task — see
   *  src/app/people/[id]/page.tsx. The `?person=` drawer still works for old
   *  links, but nothing in the app opens one on purpose any more. */
  function openPerson(id: number) {
    router.push(`/people/${id}`);
  }
  function doSnooze(p: PersonRow) {
    startSnooze(async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const res = await snoozePerson(p.id, tomorrow);
      toast(res.ok ? `Snoozed ${p.name} for today` : (res.error || "Couldn't snooze"), { tone: res.ok ? "success" : "warn", duration: 4000 });
    });
  }
  function doToggleActive(p: PersonRow) {
    startBulk(async () => {
      const res = await togglePersonActive(p.id);
      toast(res.ok ? (res.active ? `${p.name} restored` : `${p.name} deactivated`) : (res.error || "Couldn't update"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) router.refresh();
    });
  }
  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); setBulkEditing(false); }
  function doBulk(active: boolean) {
    const ids = [...selected];
    if (!ids.length) return;
    startBulk(async () => {
      const res = await setPeopleActive(ids, active);
      toast(res.ok ? `${ids.length} ${ids.length === 1 ? "person" : "people"} ${active ? "restored" : "deactivated"}` : (res.error || "Couldn't update"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) { exitSelect(); router.refresh(); }
    });
  }
  // Field setters take an explicit id list so both the bulk bar and the inline
  // Compact-row cells share one path (one person = [id]).
  function applyFieldTo(ids: number[], field: "company" | "department" | "manager", value: number | string | null, closeBulk = true) {
    if (!ids.length) return;
    startBulk(async () => {
      const res = await bulkSetPeopleField(ids, field, value);
      toast(res.ok ? `Updated ${ids.length} ${ids.length === 1 ? "person" : "people"}` : (res.error || "Couldn't update"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) { if (closeBulk) setBulkEditing(false); router.refresh(); }
    });
  }
  function applySecondaryTo(ids: number[], value: number | null) {
    if (!ids.length) return;
    startBulk(async () => {
      const res = await bulkAddSecondaryManager(ids, value);
      toast(res.ok ? (value == null ? `Cleared extra managers on ${ids.length}` : `Updated ${ids.length} ${ids.length === 1 ? "person" : "people"}`) : (res.error || "Couldn't update"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) { setBulkEditing(false); router.refresh(); }
    });
  }
  function applyRoleTo(ids: number[], role: PortalRoleKey, closeBulk = true) {
    if (!ids.length) return;
    startBulk(async () => {
      const res = await bulkSetPortalRole(ids, role);
      if (res.ok) {
        const parts = [`${res.updated ?? 0} set to ${ROLE_LABEL[role]}`];
        if (res.skipped) parts.push(`${res.skipped} skipped (no portal access)`);
        toast(parts.join(" · "), { tone: "success" });
        if (closeBulk) setBulkEditing(false); router.refresh();
      } else {
        toast(res.error || "Couldn't update", { tone: "warn" });
      }
    });
  }
  const applyBulkField = (field: "company" | "department" | "manager", value: number | string | null) => applyFieldTo([...selected], field, value);
  const applyBulkSecondary = (value: number | null) => applySecondaryTo([...selected], value);
  const applyBulkRole = (role: PortalRoleKey) => applyRoleTo([...selected], role);

  async function copyContact(p: PersonRow) {
    const value = p.whatsapp || p.phone || p.email || "";
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast(`Copied ${value}`, { tone: "success", duration: 3000 }); } catch { /* ignore */ }
  }
  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onRowPointerDown(p: PersonRow, e: React.PointerEvent) {
    longPressed.current = false;
    moved.current = false;
    lastPointerType.current = e.pointerType || "mouse";
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(p); }, 400);
  }
  function onRowPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) { moved.current = true; clearPress(); }
  }
  function onRowPointerUp(p: PersonRow, e: React.PointerEvent) {
    clearPress();
    if (e.pointerType === "touch" && !longPressed.current && !moved.current) openPerson(p.id);
  }
  // Fast actions in the peek — primary one adapts: message if reachable, else add contact.
  const peekActions = (p: PersonRow): PeekAction[] => {
    const a: PeekAction[] = [];
    if (p.whatsapp) {
      a.push({ label: "Message", icon: <MessageCircle size={16} />, tone: "accent", onClick: () => window.open(`${whatsappHref(p.whatsapp!)}?text=${encodeURIComponent(quickReminderText(p))}`, "_blank") });
    } else {
      a.push({ label: "Add contact", icon: <UserPlus size={16} />, tone: "accent", onClick: () => openPerson(p.id) });
    }
    a.push({ label: "Snooze", icon: <Clock size={16} />, onClick: () => doSnooze(p) });
    if (p.whatsapp || p.phone || p.email) a.push({ label: "Copy", icon: <Copy size={16} />, onClick: () => copyContact(p) });
    a.push({ label: "Tasks", icon: <ListTodo size={16} />, onClick: () => router.push(`/?tab=tasks&all=1&q=${encodeURIComponent(p.name)}`) });
    a.push(p.active
      ? { label: "Deactivate", icon: <UserMinus size={16} />, tone: "danger", onClick: () => doToggleActive(p) }
      : { label: "Restore", icon: <UserCheck size={16} />, onClick: () => doToggleActive(p) });
    return a;
  };

  // Rows scoped by search + company/type/site + active (but NOT the chip filter) —
  // shared base for the Attention queue and (with the chip) the Browse list.
  const scoped = useMemo(() => {
    const now = new Date();
    let rows = people.slice();
    if (!showInactive && filter !== "inactive") rows = rows.filter((p) => p.active);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.role?.toLowerCase().includes(q) ?? false) ||
        (p.companyName?.toLowerCase().includes(q) ?? false)
      );
    }
    if (companyFilter !== "all") rows = rows.filter((p) => p.companyId === companyFilter || p.associations.some((a) => a.companyId === companyFilter));
    if (typeFilter !== "all") rows = rows.filter((p) => p.personType === typeFilter);
    if (siteFilter !== "all") rows = rows.filter((p) => p.workSiteName === siteFilter || p.residenceName === siteFilter);
    void now;
    return rows;
  }, [people, search, companyFilter, typeFilter, siteFilter, showInactive, filter]);

  const filtered = useMemo(() => {
    const now = new Date();
    let rows = scoped;
    if (filter === "noContact") rows = rows.filter((p) => !p.hasContact);
    else if (filter === "snoozed") rows = rows.filter((p) => p.snoozedUntil && p.snoozedUntil > now);
    else if (filter === "inactive") rows = rows.filter((p) => !p.active);
    else if (filter === "overloaded") rows = rows.filter((p) => p.workload.open >= 5);
    else if (filter === "probationEnding") rows = rows.filter((p) => probationEndingSoon(p, now));
    else if (filter === "portal") rows = rows.filter((p) => p.portalEnabled);
    else if (filter === "noPortal") rows = rows.filter((p) => !p.portalEnabled);
    // Worst-first within a group reads best (overdue → open → name).
    return rows.slice().sort((a, b) => {
      const c = b.workload.overdue - a.workload.overdue || b.workload.open - a.workload.open;
      return c !== 0 ? c : a.name.localeCompare(b.name);
    });
  }, [scoped, filter]);

  // Attention queue — scored worst-first, minus the ones you've skipped this session.
  const attention = useMemo(() => {
    const now = new Date();
    return scoped
      .filter((p) => p.active && !skipped.has(p.id))
      .map((p) => ({ p, ...attentionScore(p, now) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  }, [scoped, skipped]);

  const siteOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of people) { if (p.workSiteName) s.add(p.workSiteName); if (p.residenceName) s.add(p.residenceName); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [people]);

  const companyById = useMemo(() => {
    const m = new Map<number, { name: string; accentColor?: string | null; logoUrl?: string | null }>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);
  const accentById = useMemo(() => {
    const m: Record<number, string | null> = {};
    for (const c of companies) m[c.id] = c.accentColor ?? null;
    return m;
  }, [companies]);

  const reportsCountById = useMemo(() => {
    const m: Record<number, number> = {};
    for (const p of people) if (p.active && p.managerId != null) m[p.managerId] = (m[p.managerId] ?? 0) + 1;
    return m;
  }, [people]);

  const counts = useMemo(() => {
    const now = new Date();
    return {
      all: people.filter((p) => p.active).length,
      noContact: people.filter((p) => p.active && !p.hasContact).length,
      snoozed: people.filter((p) => p.active && p.snoozedUntil && p.snoozedUntil > now).length,
      inactive: people.filter((p) => !p.active).length,
      overloaded: people.filter((p) => p.active && p.workload.open >= 5).length,
      probationEnding: people.filter((p) => p.active && probationEndingSoon(p, now)).length,
      portal: people.filter((p) => p.active && p.portalEnabled).length,
      noPortal: people.filter((p) => p.active && !p.portalEnabled).length,
    };
  }, [people]);

  const selStats = useMemo(() => {
    let withPortal = 0;
    for (const p of people) if (selected.has(p.id) && p.portalEnabled) withPortal++;
    return { withPortal, without: selected.size - withPortal };
  }, [people, selected]);

  const stats = useMemo(() => {
    const active = people.filter((p) => p.active);
    return { active: active.length, portal: counts.portal };
  }, [people, counts.portal]);

  // Group the filtered rows into housings (Browse mode).
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", items: filtered, companyId: null as number | null }];
    const map = new Map<string, { key: string; label: string; items: PersonRow[]; companyId: number | null; sort: string }>();
    for (const p of filtered) {
      let key: string, label: string, companyId: number | null = null, sort: string;
      if (groupBy === "company") {
        if (p.companyId != null) { key = `c${p.companyId}`; label = p.companyName ?? `#${p.companyId}`; companyId = p.companyId; sort = `0${label}`; }
        else { key = "none"; label = "Outsiders & candidates"; sort = "zzz"; }
      } else if (groupBy === "manager") {
        if (p.managerId != null) { key = `m${p.managerId}`; label = p.managerName ?? `#${p.managerId}`; sort = `0${label}`; }
        else { key = "none"; label = "No manager set"; sort = "zzz"; }
      } else if (groupBy === "department") {
        if (p.departmentName) { key = `d${p.departmentName}`; label = p.departmentName; sort = `0${label}`; }
        else { key = "none"; label = "No department"; sort = "zzz"; }
      } else {
        if (p.workSiteName) { key = `s${p.workSiteName}`; label = p.workSiteName; sort = `0${label}`; }
        else { key = "none"; label = "No location set"; sort = "zzz"; }
      }
      const g = map.get(key) ?? { key, label, items: [], companyId, sort };
      g.items.push(p);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [filtered, groupBy]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  function toggleSelectAll() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      }
      return new Set([...prev, ...filtered.map((p) => p.id)]);
    });
  }

  // Shared pointer handlers for a person card/row.
  const cardHandlers = (p: PersonRow) => ({
    onOpen: () => {
      if (selectMode) { toggleSelect(p.id); return; }
      if (longPressed.current) { longPressed.current = false; return; }
      if (lastPointerType.current === "touch") return;
      openPerson(p.id);
    },
    onPointerDown: selectMode ? undefined : (e: React.PointerEvent) => onRowPointerDown(p, e),
    onPointerMove: selectMode ? undefined : onRowPointerMove,
    onPointerUp: selectMode ? undefined : (e: React.PointerEvent) => onRowPointerUp(p, e),
    onPointerLeave: selectMode ? undefined : clearPress,
    onPointerCancel: selectMode ? undefined : clearPress,
  });

  // Active people, disambiguated for the manager pickers (name collisions → id).
  const managerPicker = useMemo(() => {
    const active = people.filter((p) => p.active);
    const dup = new Map<string, number>();
    for (const p of active) dup.set(p.name, (dup.get(p.name) ?? 0) + 1);
    const labelOf = (p: PersonRow) => (dup.get(p.name)! > 1 ? `${p.name} · ${p.departmentName ?? "#" + p.id}` : p.name);
    const labelToId = new Map(active.map((p) => [labelOf(p), p.id] as const));
    return { labels: active.map(labelOf), labelToId, labelById: new Map(active.map((p) => [p.id, labelOf(p)] as const)) };
  }, [people]);

  const totalPeople = people.length;

  /* Select / Select-all / Cancel. Defined once and rendered in two places: on a
     desk it sits at the right of the density row, and on a phone that row is
     hidden entirely (density and grouping live in the Filters sheet), which
     left this stranded on a line of its own — so there it rides along at the
     end of the chip row instead. */
  function selectClusterFor(compact: boolean) {
    /* On the chip row a bare 13px glyph reads as a stray tick and is a 13px
       target; it gets the same bordered button shape as Filters beside it, and
       `tap-target` gives it the 40px hit area phones need. */
    const btn = compact
      ? "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-bg-elev text-fg-muted ring-1 ring-border/60 tap-target"
      : "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg";
    return !selectMode ? (
      <>
        {!compact && (
          <label className="hidden sm:inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-accent" />
            Show inactive
          </label>
        )}
        <button type="button" onClick={() => setSelectMode(true)} aria-label="Select people" title="Select people" className={btn}>
          <CheckSquare size={compact ? 14 : 13} /> {!compact && "Select"}
        </button>
      </>
    ) : (
      <>
        <button type="button" onClick={toggleSelectAll}
          className={compact
            ? "inline-flex h-[30px] shrink-0 items-center rounded-lg bg-accent-soft px-2 text-xs font-medium text-accent ring-1 ring-accent/30"
            : "shrink-0 text-xs font-medium text-accent hover:underline"}>
          {allFilteredSelected ? "Clear" : "All"}
        </button>
        <button type="button" onClick={exitSelect} aria-label="Cancel selection" title="Cancel selection" className={btn}>
          <X size={compact ? 14 : 13} /> {!compact && "Cancel"}
        </button>
      </>
    );
  }

  /* How many pickers are away from their default — the number on the phone's
     Filters button, so a narrowed list never looks like the whole directory. */
  const pickerCount =
    (companyFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (siteFilter !== "all" ? 1 : 0) +
    (groupBy !== "company" ? 1 : 0) +
    (showInactive ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* ⚠️ NO `data-page-header` here, on purpose.
           That attribute is Desk's "a page opens with a title and a rule, not a
           card" contract, and it forces `background: transparent` and
           `padding: 0 0 10px`. This header is one of only two in the app that
           carries `.glass elevated rounded-3xl p-4` — it is MEANT to be a card,
           and the owner wants it that way.
           The bug he first reported ("text too tight to the borders") was that
           contract's zero side padding fighting the card surface, which in dark
           mode `.dark .glass` painted anyway. Without the attribute the card's
           own `p-4 sm:p-5` applies and the two stop arguing. */}
      <section className="relative overflow-hidden rounded-3xl glass elevated p-4 sm:p-5">
        <div aria-hidden data-decor className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.25), transparent 70%)" }} />
        </div>
        {/* The mark, the title and the mode switch. This stacked into three full
            rows on a phone because it was `flex-col` until `sm` — a 44px tile on
            a line of its own above the heading. Wrapping instead puts the tile
            beside the title where it belongs and drops the switch underneath. */}
        <div className="relative flex flex-wrap items-center gap-2.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-base font-semibold text-white" style={{ background: "linear-gradient(135deg, hsl(var(--accent)), #a78bfa)" }}>
            <Users size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-fg-subtle">
              Directory
              <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-success opacity-50 motion-safe:animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              <span className="normal-case tracking-normal text-success/90">live</span>
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">People</h1>
            <p className="text-xs text-fg-muted mt-0.5">
              {totalPeople} {totalPeople === 1 ? "person" : "people"}
              {totalCompanies != null && <> · {totalCompanies} {totalCompanies === 1 ? "company" : "companies"}</>}
              {totalSites != null && totalSites > 0 && <> · {totalSites} {totalSites === 1 ? "site" : "sites"}</>}
            </p>
          </div>
          {/* Browse | Attention mode — top-right on a desk, and on a phone a
              full-width segmented control on its own line under the title. It
              was squeezing onto the title's line and pushing "44 people · 13
              companies" into a wrap. `basis-full` is what claims the line — the
              text beside it is `flex-1`, so it will otherwise always shrink to
              make room rather than send this down. */}
          <div className="flex items-center gap-2 max-sm:basis-full sm:contents">
            <span className="inline-flex w-full items-center gap-0.5 rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border/60 sm:w-auto">
              <button type="button" onClick={() => setMode("browse")}
                className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all max-sm:py-2.5 sm:flex-none", mode === "browse" ? "bg-accent font-medium text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                <Users size={12} /> Browse
              </button>
              <button type="button" onClick={() => setMode("attention")}
                className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all max-sm:py-2.5 sm:flex-none", mode === "attention" ? "bg-accent font-medium text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                <Target size={12} /> Attention{attention.length > 0 && <b className="tabular font-bold">{attention.length}</b>}
              </button>
            </span>
          </div>
        </div>
        {/* KPI pill */}
        <div className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-bg-elev/55 px-3.5 py-2 text-sm text-fg-muted ring-1 ring-border">
          <span><b className="font-semibold text-fg tabular">{stats.active}</b> active</span>
          <span aria-hidden className="text-border">·</span>
          <span className="text-info"><b className="font-semibold tabular">{stats.portal}</b> portal</span>
        </div>
      </section>

      {/* Create actions above the search (full-width on mobile, right of search on desktop). */}
      {createSlot && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto [&_button]:w-full sm:[&_button]:w-auto">
          {createSlot}
        </div>
      )}

      {/* Search + scope filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-auto sm:min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, role, company…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        {/* The pickers. On a phone they are in the Filters sheet on the chip row
            instead — see PeopleFilterSheet. */}
        <span className="hidden sm:contents">
          <FluidSelect
            value={companyFilter === "all" ? "all" : String(companyFilter)}
            onSelect={(v) => setCompanyFilter(v === "all" ? "all" : parseInt(v, 10))}
            options={[{ value: "all", label: "All Companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
          <FluidSelect
            value={typeFilter}
            onSelect={(v) => setTypeFilter(v as typeof typeFilter)}
            options={[{ value: "all", label: "All Types" }, ...PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE_LABELS[t] }))]}
          />
          {siteOptions.length > 0 && (
            <FluidSelect
              value={siteFilter}
              onSelect={(v) => setSiteFilter(v)}
              options={[{ value: "all", label: "All Locations" }, ...siteOptions.map((s) => ({ value: s, label: s }))]}
            />
          )}
        </span>

        {/* Phone only: every picker, behind one button. It sits on the SEARCH row
            rather than with the chips because the chips are Browse-only — down
            there, Attention mode had no way to reach Company or Type at all. */}
        <button
          type="button"
          onClick={() => setFilterSheet(true)}
          aria-label="Filters"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ring-1 transition-colors sm:hidden",
            pickerCount > 0 ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-elev text-fg-muted ring-border/60",
          )}
        >
          <SlidersHorizontal size={14} />
          Filters
          {pickerCount > 0 && <b className="tabular font-bold">{pickerCount}</b>}
        </button>
      </div>

      {/* Density + grouping — the CC control language (rounded-lg, outline icons).
          Both go in the phone's Filters sheet; only the select cluster on the
          right survives at that width, because it is an action, not a filter. */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {mode === "browse" && (
          <>
            <div className="inline-flex rounded-lg bg-bg-subtle/60 p-0.5 text-xs font-medium ring-1 ring-border">
              <button type="button" onClick={() => changeDensity("comfortable")}
                className={cn("rounded-md px-3 py-1.5 transition-colors", density === "comfortable" ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg")}>
                Comfortable
              </button>
              <button type="button" onClick={() => changeDensity("compact")}
                className={cn("rounded-md px-3 py-1.5 transition-colors", density === "compact" ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg")}>
                Compact
              </button>
            </div>
            <span className="hidden sm:contents">
              <FluidSelect
                value={groupBy}
                onSelect={(v) => setGroupBy(v as GroupBy)}
                buttonClassName="rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium"
                options={(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => ({ value: g, label: `Group: ${GROUP_LABELS[g]}` }))}
              />
            </span>
          </>
        )}

        <div className="ml-auto hidden items-center gap-3 sm:flex">{selectClusterFor(false)}</div>
      </div>

      {/* Counting filter chips — Browse only (they narrow the browse list). On a
          phone the chips scroll and the Filters button at the end of them holds
          every picker, so this is the ONE row of filter chrome at that width. */}
      {mode === "browse" && (
        <div className="flex items-center gap-2 sm:block">
          <FilterChips
            className="min-w-0 flex-1"
            value={filter}
            onChange={(k) => setFilter(k)}
            items={[
              { key: "all", label: "All", icon: Users, count: counts.all, tone: "default" },
              { key: "noContact", label: "No contact info", icon: PhoneOff, count: counts.noContact, tone: "danger" },
              { key: "snoozed", label: "Snoozed", icon: MoonStar, count: counts.snoozed, tone: "warn" },
              { key: "overloaded", label: "Overloaded (5+)", icon: Flame, count: counts.overloaded, tone: "warn" },
              { key: "probationEnding", label: "Probation ending", icon: Hourglass, count: counts.probationEnding, tone: "warn" },
              { key: "portal", label: "Has portal", icon: ShieldCheck, count: counts.portal, tone: "default" },
              { key: "noPortal", label: "No portal", icon: ShieldOff, count: counts.noPortal, tone: "default" },
              { key: "inactive", label: "Inactive", icon: UserX, count: counts.inactive, tone: "default" },
            ]}
          />
          <span className="flex shrink-0 items-center gap-1.5 sm:hidden">{selectClusterFor(true)}</span>
        </div>
      )}

      <PeopleFilterSheet
        open={filterSheet}
        onClose={() => setFilterSheet(false)}
        groups={[
          {
            key: "company", label: "Company", icon: <Building2 size={15} />,
            value: companyFilter === "all" ? "all" : String(companyFilter),
            options: [{ value: "all", label: "All companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))],
            onPick: (v) => setCompanyFilter(v === "all" ? "all" : parseInt(v, 10)),
            isDefault: companyFilter === "all",
          },
          {
            key: "type", label: "Type", icon: <Users size={15} />,
            value: typeFilter,
            options: [{ value: "all", label: "All types" }, ...PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE_LABELS[t] }))],
            onPick: (v) => setTypeFilter(v as typeof typeFilter),
            isDefault: typeFilter === "all",
          },
          ...(siteOptions.length > 0 ? [{
            key: "site", label: "Location", icon: <MapPin size={15} />,
            value: siteFilter,
            options: [{ value: "all", label: "All locations" }, ...siteOptions.map((x) => ({ value: x, label: x }))],
            onPick: (v: string) => setSiteFilter(v),
            isDefault: siteFilter === "all",
          }] : []),
          {
            key: "group", label: "Group by", icon: <Layers size={15} />,
            value: groupBy,
            options: (Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => ({ value: g, label: GROUP_LABELS[g] })),
            onPick: (v) => setGroupBy(v as GroupBy),
            isDefault: groupBy === "company",
          },
          {
            key: "density", label: "Density", icon: <Rows3 size={15} />,
            value: density,
            options: [{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }],
            onPick: (v) => changeDensity(v as Density),
            isDefault: density === "comfortable",
          },
          {
            key: "inactive", label: "Inactive people", icon: <UserX size={15} />,
            value: showInactive ? "show" : "hide",
            options: [{ value: "hide", label: "Hidden" }, { value: "show", label: "Shown" }],
            onPick: (v) => setShowInactive(v === "show"),
            isDefault: !showInactive,
          },
        ]}
      />

      {/* ---- ATTENTION MODE ---- */}
      {mode === "attention" && (
        attention.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-xs text-fg-subtle px-1">
              Worst-first by hygiene — no contact, probation ending, overdue load. Clear or skip each one.
              {skipped.size > 0 && <button type="button" onClick={() => setSkipped(new Set())} className="ml-2 text-accent hover:underline">Reset {skipped.size} skipped</button>}
            </p>
            {attention.map(({ p, reasons }) => (
              <AttentionCard
                key={p.id}
                p={p}
                reasons={reasons}
                onOpen={() => openPerson(p.id)}
                onMessage={p.whatsapp ? () => window.open(`${whatsappHref(p.whatsapp!)}?text=${encodeURIComponent(quickReminderText(p))}`, "_blank") : undefined}
                onSnooze={() => doSnooze(p)}
                onSkip={() => setSkipped((s) => new Set(s).add(p.id))}
              />
            ))}
          </div>
        ) : (
          <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated text-center py-12 text-fg-muted text-sm">
            <Check size={22} className="mx-auto mb-2 text-success" />
            Nothing needs attention — every active person has contact details and no overdue load.
          </div>
        )
      )}

      {/* ---- BROWSE MODE ---- */}
      {mode === "browse" && filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* One column header for the whole list, above the company housings —
              the names would otherwise repeat at every group (Stage 4). */}
          {density === "compact" && <PeopleListHeader selectMode={selectMode} />}
          {groups.map((g) => {
            const meta = g.companyId != null ? companyById.get(g.companyId) : undefined;
            const overdue = g.items.filter((p) => p.workload.overdue > 0).length;
            const noContact = g.items.filter((p) => !p.hasContact).length;
            const isCollapsed = collapsed.has(g.key);
            const body = (
              <div className={cn(g.items.length > 6 && "scroll-fade-y overflow-y-auto overscroll-contain slim-scroll", g.items.length > 6 && (density === "compact" ? "max-h-[24rem]" : "max-h-[32rem]"))}>
                {/* Compact = THE list screen (Stage 4). The columns come from
                    ENTITY_VIEWS.person and the shell is the same RecordList
                    that Tasks uses — drawn headerless and frameless, because
                    this company housing already provides both. */}
                {density === "compact" ? (
                  <PeopleRecordList
                    items={g.items}
                    selectMode={selectMode}
                    selected={selected}
                    directoryHints={directoryHints}
                    managerPicker={managerPicker}
                    onOpen={(x) => cardHandlers(x).onOpen()}
                    onSetManager={(id, m) => applyFieldTo([id], "manager", m, false)}
                  />
                ) : (
                <div className="flex flex-col gap-1.5 p-2">
                  {g.items.map((p) => (
                    <PersonCard
                      key={p.id}
                      person={p}
                      accentColor={p.companyId != null ? accentById[p.companyId] ?? null : null}
                      directReports={reportsCountById[p.id] ?? 0}
                      hideCompany={groupBy === "company"}
                      hint={directoryHints?.[p.id] ?? null}
                      selectMode={selectMode}
                      selected={selected.has(p.id)}
                      {...cardHandlers(p)}
                    />
                  ))}
                </div>
                )}
              </div>
            );
            if (groupBy === "none") return <div key={g.key}>{body}</div>;
            return (
              <section key={g.key} className="overflow-hidden rounded-2xl bg-bg-elev/40 ring-1 ring-border/60">
                <div className={cn("flex w-full items-center gap-2.5 bg-bg-subtle/60 px-3.5 py-2.5", !isCollapsed && "border-b border-border/60")}>
                  <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                    aria-expanded={!isCollapsed} className="tap-target flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <ChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", isCollapsed && "-rotate-90")} />
                    {groupBy === "company" && g.companyId != null ? (
                      <CompanyAvatar name={g.label} accent={meta?.accentColor} logoUrl={meta?.logoUrl ?? null} size={24} rounded="rounded-lg" iconSize={12} />
                    ) : (groupBy === "manager" || groupBy === "department") && g.key !== "none" ? (
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[9px] font-semibold text-accent ring-1 ring-accent/25">
                        {getInitials(g.label)}
                      </span>
                    ) : null}
                    <span className="truncate text-sm font-semibold text-fg">{g.label}</span>
                  </button>
                  <span className="flex shrink-0 items-center gap-2.5 text-xs text-fg-muted">
                    {overdue > 0 ? (
                      <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-danger" /><b className="font-bold text-danger tabular">{overdue}</b> overdue</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-success"><Check size={11} strokeWidth={3} /> on track</span>
                    )}
                    {noContact > 0 && (
                      <span className="hidden items-center gap-1 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-warn" /><b className="font-bold text-warn tabular">{noContact}</b> no contact</span>
                    )}
                    <span className="text-fg-subtle">{g.items.length} {g.items.length === 1 ? "person" : "people"}</span>
                  </span>
                </div>
                {!isCollapsed && body}
              </section>
            );
          })}
        </div>
      )}

      {mode === "browse" && filtered.length === 0 && (
        <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated text-center py-12 text-fg-muted text-sm">
          No people match these filters.
        </div>
      )}

      {/* Bulk action bar — floats above the nav pill while selecting */}
      {selectMode && selected.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[5.5rem] md:bottom-24 z-40 flex flex-col items-center gap-2 max-sm:left-3 max-sm:right-3 max-sm:translate-x-0">
          {bulkEditing && (
            <div className="w-[min(90vw,26rem)] rounded-2xl bg-bg-elev ring-1 ring-border shadow-pill p-2 grid grid-cols-2 gap-1.5">
              {(() => {
                const selCls = "h-8 min-w-0 w-full rounded-lg bg-bg-subtle text-xs text-fg ring-1 ring-border px-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40";
                const { labels: mgrLabels, labelToId } = managerPicker;
                return (
                  <>
                    <Select defaultValue="" onChange={(e) => { if (e.target.value !== "") applyBulkField("company", e.target.value === "none" ? null : Number(e.target.value)); e.currentTarget.selectedIndex = 0; }} size="sm" wrapperClassName="min-w-0">
                      <option value="" disabled>Set company…</option>
                      <option value="none">— Clear —</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <Combobox options={["— Clear —", ...mgrLabels]} placeholder="Set manager…" className={selCls} clearOnCommit onCommit={(v) => { const t = v.trim(); if (!t) return; if (t === "— Clear —") { applyBulkField("manager", null); return; } const id = labelToId.get(t); if (id != null) applyBulkField("manager", id); }} />
                    <Combobox options={["— Clear extra —", ...mgrLabels]} placeholder="Also reports to…" className={selCls} clearOnCommit onCommit={(v) => { const t = v.trim(); if (!t) return; if (t === "— Clear extra —") { applyBulkSecondary(null); return; } const id = labelToId.get(t); if (id != null) applyBulkSecondary(id); }} />
                    <Combobox options={[...new Set(people.map((p) => p.departmentName).filter(Boolean) as string[])].sort()} placeholder="Set department…" className={selCls} clearOnCommit onCommit={(v) => { const t = v.trim(); if (t) applyBulkField("department", t); }} />
                    <Select defaultValue="" onChange={(e) => { const v = e.target.value; if (v) applyBulkRole(v as PortalRoleKey); e.currentTarget.selectedIndex = 0; }} size="sm" wrapperClassName="min-w-0 col-span-2">
                      <option value="" disabled>Set portal level… (already-enabled only)</option>
                      {PORTAL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </Select>
                  </>
                );
              })()}
            </div>
          )}
          {/* A pill on a desk; a full-width bar on a phone. The count and three
              buttons come to ~445px, so inside a 375px pill the label was
              crushed into a 43px column four lines tall — "2 / selected / · 2
              with / portal". Below `sm` the count takes a line of its own and
              the buttons share the next one. */}
          <div className="glass elevated rounded-full shadow-pill flex items-center gap-1.5 pl-4 pr-1.5 py-1.5 max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-2 max-sm:rounded-2xl max-sm:px-3 max-sm:py-2.5">
            <span className="text-xs font-medium text-fg-muted max-sm:text-center">
              {selected.size} selected
              {selStats.withPortal > 0 && <span className="text-fg-subtle"> · {selStats.withPortal} with portal</span>}
              {selStats.without > 0 && <span className="text-fg-subtle"> · {selStats.without} without</span>}
            </span>
            <span className="flex items-center gap-1.5 max-sm:w-full max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center">
              <Button size="sm" variant={bulkEditing ? "primary" : "secondary"} onClick={() => setBulkEditing((v) => !v)}><Pencil size={14} /> Set fields</Button>
              <Button size="sm" variant="secondary" onClick={() => doBulk(true)}><UserCheck size={14} /> Restore</Button>
              <Button size="sm" variant="danger-soft" onClick={() => doBulk(false)}><UserMinus size={14} /> Deactivate</Button>
            </span>
          </div>
        </div>
      )}

      {/* Long-press peek — limited details */}
      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openPerson(peek.id) : undefined}
        title={peek?.name}
        subtitle={peek ? [peek.companyName, peek.role].filter(Boolean).join(" · ") || undefined : undefined}
        pills={peek ? (
          <>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-info-soft/60 ring-1 ring-info/25 text-info tabular">{peek.workload.open} open</span>
            {peek.workload.overdue > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger tabular">{peek.workload.overdue} overdue</span>}
            {peek.workload.dueSoon > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warn-soft/60 ring-1 ring-warn/25 text-warn tabular">{peek.workload.dueSoon} due soon</span>}
            {!peek.hasContact && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger">No contact</span>}
          </>
        ) : undefined}
        body={peek && (displayNote(peek.notes) || peek.topTasks.length > 0) ? (
          <div className="space-y-2.5">
            {displayNote(peek.notes) && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayNote(peek.notes)}</p>
            )}
            {peek.topTasks.length > 0 && (
              <div className="-mx-1 rounded-xl border border-border/60 divide-y divide-border/50 overflow-hidden">
                {peek.topTasks.map((t) => (
                  <div key={t.code} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", t.flag === "overdue" || t.flag === "escalate-now" ? "bg-danger" : t.flag === "due-soon" ? "bg-warn" : "bg-fg-subtle/40")} />
                    <span className="min-w-0 flex-1 truncate text-base">{t.actionItem}</span>
                    <span className="font-mono text-xs text-fg-subtle shrink-0">{t.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />

      <p className="text-xs text-fg-subtle px-1">
        {mode === "attention"
          ? `${attention.length} ${attention.length === 1 ? "person needs" : "people need"} attention · tap a card for full detail.`
          : `Showing ${filtered.length} of ${people.length} · tap a card for full detail · long-press to preview.`}
      </p>
    </div>
  );
}

/** Reason pill for the Attention card. */
function ReasonPill({ r }: { r: AttnReason }) {
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium",
      r.tone === "red" ? "bg-danger-soft/70 text-danger" : "bg-warn-soft/70 text-warn")}>
      {r.text}
    </span>
  );
}

/**
 * A single person in the Attention ritual — a bigger, worst-first card with the
 * hygiene reasons spelled out and one-tap decisions (Message/Add contact · Fix
 * documents → drawer · Snooze · Skip). Mirrors the Tasks Focus queue grammar.
 */
function AttentionCard({ p, reasons, onOpen, onMessage, onSnooze, onSkip }: {
  p: PersonRow;
  reasons: AttnReason[];
  onOpen: () => void;
  onMessage?: () => void;
  onSnooze: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="rounded-2xl bg-bg-elev ring-1 ring-border/70 elevated p-3.5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-semibold text-accent ring-1 ring-accent/25">
          {getInitials(p.name)}
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[14.5px] font-medium leading-tight hover:text-accent transition-colors">{p.name}</div>
          <div className="truncate text-xs text-fg-muted mt-0.5">{[p.role, p.companyName].filter(Boolean).join(" · ") || "—"}</div>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {reasons.map((r, i) => <ReasonPill key={i} r={r} />)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {onMessage ? (
          <button type="button" onClick={onMessage} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-all hover:-translate-y-0.5">
            <MessageCircle size={13} /> Message
          </button>
        ) : (
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-all hover:-translate-y-0.5">
            <UserPlus size={13} /> Add contact
          </button>
        )}
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors">
          <Wrench size={13} /> Fix documents
        </button>
        <button type="button" onClick={onSnooze} className="inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg transition-colors">
          <Clock size={13} /> Snooze
        </button>
        <button type="button" onClick={onSkip} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-fg-subtle hover:text-fg transition-colors">
          Skip <SkipForward size={13} />
        </button>
      </div>
    </div>
  );
}

type ManagerPicker = { labels: string[]; labelToId: Map<string, number>; labelById: Map<number, string> };

/**
 * Compact directory row — one line under the housing header. Carries table-grade
 * inline cells (manager combobox, portal-role cycle) on sm+; on mobile it's a
 * tap-to-open row. Reuses the same pointer handlers as the comfortable card.
 */
function CompactRow({ p, hint, selectMode, selected, managerPicker, onSetManager, onOpen, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel }: {
  p: PersonRow;
  hint: { onLeave: boolean; present: number; absent: number } | null;
  selectMode: boolean;
  selected: boolean;
  managerPicker: ManagerPicker;
  onSetManager: (id: number) => void;
  onOpen: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  const onLeave = !!hint?.onLeave;
  const wl = p.workload;
  const role: string = p.portalRole ?? "staff";
  const wlTone = wl.overdue > 0 ? "text-danger" : wl.open >= 5 ? "text-warn" : wl.open === 0 ? "text-fg-subtle" : "text-info";

  return (
    <div
      onClick={onOpen}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      className={cn("group flex items-center gap-2.5 rounded-xl px-3 py-2 cursor-pointer ring-1 transition-colors",
        selected ? "bg-accent-soft/50 ring-accent/40" : "bg-bg-elev/40 ring-border/50 hover:ring-border")}
    >
      {selectMode && (
        <span className={cn("h-4 w-4 rounded-md border flex items-center justify-center shrink-0", selected ? "bg-accent border-accent text-accent-fg" : "border-border-strong")}>
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      )}
      <span className="relative shrink-0">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-bg-subtle text-xs font-semibold text-fg-muted ring-1 ring-border">
          {getInitials(p.name)}
        </span>
        {onLeave && <span title="On approved leave today" className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-warn ring-2 ring-bg-elev" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-base font-medium leading-tight group-hover:text-accent transition-colors">{p.name}</span>
          {!p.hasContact && <PhoneOff size={11} className="text-danger shrink-0" />}
        </div>
        <div className="truncate text-xs text-fg-subtle">{[p.role, p.companyName].filter(Boolean).join(" · ") || "—"}</div>
      </div>

      {/* Inline manager cell (sm+): pick from active people; commits on select. */}
      <div className="hidden md:block w-[150px] shrink-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Combobox
          options={managerPicker.labels}
          defaultValue={p.managerId != null ? managerPicker.labelById.get(p.managerId) ?? "" : ""}
          placeholder="Set manager…"
          className="h-7 w-full rounded-lg bg-bg-subtle/70 text-xs text-fg ring-1 ring-border px-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
          onCommit={(v) => { const id = managerPicker.labelToId.get(v.trim()); if (id != null) onSetManager(id); }}
        />
      </div>

      {/* Portal level (sm+) — READ ONLY. It used to tap-cycle staff → manager →
          director, so one stray tap on a row could make somebody a director (or
          quietly demote an Admin to Staff), with no confirmation and no way to
          set a director's company scope. Change it on their own record, or in
          Settings → Portals; select several rows to change them together. */}
      <span
        title={p.portalEnabled ? "Portal level — change it on their record, or in Settings → Portals" : "No portal access"}
        className={cn("hidden sm:inline-flex w-[86px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ring-1",
          !p.portalEnabled ? "text-fg-subtle ring-border" :
          role === "director" || role === "hr" ? "bg-accent-soft text-accent ring-accent/25" :
          role === "manager" ? "bg-info-soft text-info ring-info/25" :
          "bg-bg-muted text-fg-muted ring-border")}
      >
        <ShieldCheck size={11} /> {p.portalEnabled ? ROLE_LABEL[asRole(role)] : "none"}
      </span>

      <span className={cn("w-[54px] shrink-0 text-right text-xs font-semibold tabular", wlTone)}>
        {wl.open}{wl.overdue ? ` · ${wl.overdue}↓` : ""}
      </span>
    </div>
  );
}
