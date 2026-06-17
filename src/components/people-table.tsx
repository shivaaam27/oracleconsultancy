"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, MessageCircle, Filter, ListTodo, Clock, Copy, UserPlus, UserMinus, UserCheck, CheckSquare, X, Pencil, ShieldCheck, ShieldOff, Users, PhoneOff, MoonStar, Flame, Hourglass, UserX } from "lucide-react";
import { PersonCard } from "./person-card";
import { Combobox } from "./combobox";
import { PeekPreview, type PeekAction } from "./peek-preview";
import { FluidSelect } from "./fluid-select";
import { Button, CountPill, Select } from "./ui";
import { triggerHaptic } from "@/lib/use-long-press";
import { cn } from "@/lib/cn";
import { displayNote } from "@/lib/notes-display";
import { useToast } from "./toast";
import { snoozePerson, togglePersonActive, setPeopleActive, bulkSetPeopleField, bulkAddSecondaryManager, bulkSetPortalRole } from "@/app/people/actions";
import type { PersonRow } from "@/lib/people-queries";
import { PERSON_TYPES, PERSON_TYPE_LABELS, type PersonType } from "@/lib/person-types";

/** A short WhatsApp reminder built from the person's most urgent tasks. */
function quickReminderText(p: PersonRow): string {
  const lines = [`Hi ${p.name}, a quick reminder:`, ""];
  p.topTasks.forEach((t) => lines.push(`• ${t.actionItem} (${t.code})`));
  lines.push("", "Please update the tracker when you can. Thanks.");
  return lines.join("\n");
}

type SortKey = "name" | "company" | "workload";
type SortDir = "asc" | "desc";

type FilterKind = "all" | "noContact" | "snoozed" | "inactive" | "overloaded" | "probationEnding" | "portal" | "noPortal";

function whatsappHref(num: string) {
  return `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
}

/** True if the person's probation ends within the next 30 days (and not past). */
function probationEndingSoon(p: PersonRow, now: Date): boolean {
  if (!p.probationEndDate) return false;
  const days = (p.probationEndDate.getTime() - now.getTime()) / 86400000;
  return days >= 0 && days <= 30;
}

export function PeopleTable({ people, companies, complianceById, directoryHints }: {
  people: PersonRow[];
  companies: Array<{ id: number; name: string; accentColor?: string | null }>;
  complianceById?: Record<number, { score: number; status: "Good" | "Watch" | "Risk" }>;
  directoryHints?: Record<number, { onLeave: boolean; present: number; absent: number }>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [companyFilter, setCompanyFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | PersonType>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("workload");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showInactive, setShowInactive] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [, startSnooze] = useTransition();
  const [, startBulk] = useTransition();
  const [peek, setPeek] = useState<PersonRow | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const moved = useRef(false);
  const lastPointerType = useRef<string>("mouse");

  function openPerson(id: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", String(id));
    params.delete("task");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
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
  function applyBulkField(field: "company" | "department" | "manager", value: number | string | null) {
    const ids = [...selected];
    if (!ids.length) return;
    startBulk(async () => {
      const res = await bulkSetPeopleField(ids, field, value);
      toast(res.ok ? `Updated ${ids.length} ${ids.length === 1 ? "person" : "people"}` : (res.error || "Couldn't update"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) { setBulkEditing(false); router.refresh(); }
    });
  }
  function applyBulkSecondary(value: number | null) {
    const ids = [...selected];
    if (!ids.length) return;
    startBulk(async () => {
      const res = await bulkAddSecondaryManager(ids, value);
      toast(res.ok ? (value == null ? `Cleared extra managers on ${ids.length}` : `Updated ${ids.length} ${ids.length === 1 ? "person" : "people"}`) : (res.error || "Couldn't update"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) { setBulkEditing(false); router.refresh(); }
    });
  }
  function applyBulkRole(role: "staff" | "manager" | "director") {
    const ids = [...selected];
    if (!ids.length) return;
    startBulk(async () => {
      const res = await bulkSetPortalRole(ids, role);
      if (res.ok) {
        const parts = [`${res.updated ?? 0} set to ${role}`];
        if (res.skipped) parts.push(`${res.skipped} skipped (no portal access)`);
        toast(parts.join(" · "), { tone: "success" });
        setBulkEditing(false); router.refresh();
      } else {
        toast(res.error || "Couldn't update", { tone: "warn" });
      }
    });
  }
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
    // On touch, open directly on tap-up. Mobile browsers drop the synthesized
    // click inside scrollable lists, so relying on onClick fails on phones.
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

  const filtered = useMemo(() => {
    const now = new Date();
    let rows = people.slice();

    // Active filter
    if (!showInactive && filter !== "inactive") {
      rows = rows.filter((p) => p.active);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.role?.toLowerCase().includes(q) ?? false) ||
        (p.companyName?.toLowerCase().includes(q) ?? false)
      );
    }

    // Company filter — match primary company OR an associated company link
    if (companyFilter !== "all") {
      rows = rows.filter(
        (p) => p.companyId === companyFilter || p.associations.some((a) => a.companyId === companyFilter)
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      rows = rows.filter((p) => p.personType === typeFilter);
    }

    // Site/location filter — matches their work site OR residence ("who's at X").
    if (siteFilter !== "all") {
      rows = rows.filter((p) => p.workSiteName === siteFilter || p.residenceName === siteFilter);
    }

    // Filter chip
    if (filter === "noContact") rows = rows.filter((p) => !p.hasContact);
    if (filter === "snoozed") rows = rows.filter((p) => p.snoozedUntil && p.snoozedUntil > now);
    if (filter === "inactive") rows = rows.filter((p) => !p.active);
    if (filter === "overloaded") rows = rows.filter((p) => p.workload.open >= 5);
    if (filter === "probationEnding") rows = rows.filter((p) => probationEndingSoon(p, now));
    if (filter === "portal") rows = rows.filter((p) => p.portalEnabled);
    if (filter === "noPortal") rows = rows.filter((p) => !p.portalEnabled);

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "company") cmp = (a.companyName ?? "").localeCompare(b.companyName ?? "");
      else cmp = a.workload.open - b.workload.open;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [people, search, filter, companyFilter, typeFilter, siteFilter, sortKey, sortDir, showInactive]);

  // Distinct site/location names present in the directory (work site + residence).
  const siteOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of people) { if (p.workSiteName) s.add(p.workSiteName); if (p.residenceName) s.add(p.residenceName); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [people]);

  // Company accent colour, for each person's left rail.
  const accentById = useMemo(() => {
    const m: Record<number, string | null> = {};
    for (const c of companies) m[c.id] = c.accentColor ?? null;
    return m;
  }, [companies]);

  // How many active people report (primary line) to each person — for the card.
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

  // Portal breakdown of the current selection — shown live in the bulk bar so
  // you can see who already has access before assigning a role (no surprises).
  const selStats = useMemo(() => {
    let withPortal = 0;
    for (const p of people) if (selected.has(p.id) && p.portalEnabled) withPortal++;
    return { withPortal, without: selected.size - withPortal };
  }, [people, selected]);

  // Glanceable header stats (active · portal · avg compliance · needs attention).
  const stats = useMemo(() => {
    const active = people.filter((p) => p.active);
    const scores = active.map((p) => complianceById?.[p.id]).filter(Boolean) as Array<{ score: number; status: "Good" | "Watch" | "Risk" }>;
    const avg = scores.length ? Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length) : null;
    const needsAttention = scores.filter((x) => x.status !== "Good").length;
    return { active: active.length, portal: counts.portal, avg, needsAttention };
  }, [people, complianceById, counts.portal]);

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

  return (
    <div className="space-y-4">
      {/* Glanceable stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Active", value: String(stats.active), tone: "text-fg" },
          { label: "Portal", value: String(stats.portal), tone: "text-info", icon: <ShieldCheck size={12} className="text-info" /> },
          { label: "Avg compliance", value: stats.avg == null ? "—" : `${stats.avg}%`, tone: stats.avg != null && stats.avg < 70 ? "text-warn" : "text-success" },
          { label: "Needs attention", value: String(stats.needsAttention), tone: stats.needsAttention > 0 ? "text-warn" : "text-fg-subtle" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-bg-elev ring-1 ring-border px-3 py-2">
            <div className="text-[11px] text-fg-subtle inline-flex items-center gap-1">{s.icon}{s.label}</div>
            <div className={cn("text-[22px] font-semibold leading-tight tabular", s.tone)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, role, company…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <FluidSelect
          value={companyFilter === "all" ? "all" : String(companyFilter)}
          onSelect={(v) => setCompanyFilter(v === "all" ? "all" : parseInt(v, 10))}
          options={[{ value: "all", label: "All Companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <FluidSelect
          value={typeFilter}
          onSelect={(v) => setTypeFilter(v as typeof typeFilter)}
          options={[
            { value: "all", label: "All Types" },
            ...PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE_LABELS[t] })),
          ]}
        />
        {siteOptions.length > 0 && (
          <FluidSelect
            value={siteFilter}
            onSelect={(v) => setSiteFilter(v)}
            options={[{ value: "all", label: "All Locations" }, ...siteOptions.map((s) => ({ value: s, label: s }))]}
          />
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter size={11} className="text-fg-subtle" />
        {[
          { key: "all", label: "All", icon: Users, count: counts.all, tone: "default" as const },
          { key: "noContact", label: "No contact info", icon: PhoneOff, count: counts.noContact, tone: "danger" as const },
          { key: "snoozed", label: "Snoozed", icon: MoonStar, count: counts.snoozed, tone: "warn" as const },
          { key: "overloaded", label: "Overloaded (5+)", icon: Flame, count: counts.overloaded, tone: "warn" as const },
          { key: "probationEnding", label: "Probation ending", icon: Hourglass, count: counts.probationEnding, tone: "warn" as const },
          { key: "portal", label: "Has portal", icon: ShieldCheck, count: counts.portal, tone: "default" as const },
          { key: "noPortal", label: "No portal", icon: ShieldOff, count: counts.noPortal, tone: "default" as const },
          { key: "inactive", label: "Inactive", icon: UserX, count: counts.inactive, tone: "default" as const },
        ].map(({ key, label, icon: Icon, count, tone }) => {
          const active = filter === key;
          const tint = active
            ? tone === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
              : tone === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
              : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
            : count === 0 ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle"
            : tone === "danger" ? "bg-danger-soft/50 ring-1 ring-danger/25 text-danger hover:ring-2"
            : tone === "warn" ? "bg-warn-soft/50 ring-1 ring-warn/25 text-warn hover:ring-2"
            : "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-muted hover:ring-2 hover:ring-border";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as FilterKind)}
              title={`${label} · ${count}`}
              aria-label={`${label} (${count})`}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 py-1.5 text-xs rounded-full transition-all backdrop-blur-md hover:shadow-sm",
                // Icon-only on mobile to save space; full label from sm up. The
                // active filter always shows its label so you know what's applied.
                active ? "pl-2 pr-3" : "px-2 sm:pl-2 sm:pr-3",
                tint
              )}
            >
              <Icon size={13} className="shrink-0" />
              <CountPill count={count} tone="inherit" />
              <span className={cn("font-medium", active ? "inline" : "hidden sm:inline")}>{label}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-3">
          {!selectMode ? (
            <>
              <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="accent-accent"
                />
                Show inactive in list
              </label>
              <button type="button" onClick={() => setSelectMode(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted hover:text-fg transition-colors">
                <CheckSquare size={13} /> Select
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={toggleSelectAll}
                className="text-xs font-medium text-accent hover:underline">
                {allFilteredSelected ? "Clear all" : "Select all"}
              </button>
              <button type="button" onClick={exitSelect}
                className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg transition-colors">
                <X size={13} /> Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Directory — spacious Aurora cards, one floating glass card per person */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              accentColor={p.companyId != null ? accentById[p.companyId] ?? null : null}
              directReports={reportsCountById[p.id] ?? 0}
              compliance={complianceById?.[p.id] ?? null}
              hint={directoryHints?.[p.id] ?? null}
              selectMode={selectMode}
              selected={selected.has(p.id)}
              onOpen={() => {
                if (selectMode) { toggleSelect(p.id); return; }
                if (longPressed.current) { longPressed.current = false; return; }
                if (lastPointerType.current === "touch") return; // touch handled in onPointerUp
                openPerson(p.id);
              }}
              onPointerDown={selectMode ? undefined : (e) => onRowPointerDown(p, e)}
              onPointerMove={selectMode ? undefined : onRowPointerMove}
              onPointerUp={selectMode ? undefined : (e) => onRowPointerUp(p, e)}
              onPointerLeave={selectMode ? undefined : clearPress}
              onPointerCancel={selectMode ? undefined : clearPress}
            />
          ))}
        </div>
      )}

      {/* Bulk action bar — floats above the nav pill while selecting */}
      {selectMode && selected.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[5.5rem] md:bottom-24 z-40 flex flex-col items-center gap-2">
          {bulkEditing && (
            <div className="w-[min(90vw,26rem)] rounded-2xl bg-bg-elev ring-1 ring-border shadow-pill p-2 grid grid-cols-2 gap-1.5">
              {(() => {
                const selCls = "h-8 min-w-0 w-full rounded-lg bg-bg-subtle text-[11px] text-fg ring-1 ring-border px-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40";
                // Searchable, duplicate-safe manager pickers: disambiguate identical
                // names so the correct person id is always resolved (no name collisions).
                const activePeople = people.filter((p) => p.active);
                const dupName = new Map<string, number>();
                for (const p of activePeople) dupName.set(p.name, (dupName.get(p.name) ?? 0) + 1);
                const labelOf = (p: PersonRow) => (dupName.get(p.name)! > 1 ? `${p.name} · ${p.departmentName ?? "#" + p.id}` : p.name);
                const labelToId = new Map(activePeople.map((p) => [labelOf(p), p.id] as const));
                const mgrLabels = activePeople.map(labelOf);
                return (
                  <>
                    <Select defaultValue="" onChange={(e) => { if (e.target.value !== "") applyBulkField("company", e.target.value === "none" ? null : Number(e.target.value)); e.currentTarget.selectedIndex = 0; }} className="h-8 min-w-0 bg-bg-subtle text-[11px] text-fg ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40">
                      <option value="" disabled>Set company…</option>
                      <option value="none">— Clear —</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <Combobox options={["— Clear —", ...mgrLabels]} placeholder="Set manager…" className={selCls} clearOnCommit onCommit={(v) => { const t = v.trim(); if (!t) return; if (t === "— Clear —") { applyBulkField("manager", null); return; } const id = labelToId.get(t); if (id != null) applyBulkField("manager", id); }} />
                    <Combobox options={["— Clear extra —", ...mgrLabels]} placeholder="Also reports to…" className={selCls} clearOnCommit onCommit={(v) => { const t = v.trim(); if (!t) return; if (t === "— Clear extra —") { applyBulkSecondary(null); return; } const id = labelToId.get(t); if (id != null) applyBulkSecondary(id); }} />
                    <Combobox options={[...new Set(people.map((p) => p.departmentName).filter(Boolean) as string[])].sort()} placeholder="Set department…" className={selCls} clearOnCommit onCommit={(v) => { const t = v.trim(); if (t) applyBulkField("department", t); }} />
                    <Select defaultValue="" onChange={(e) => { const v = e.target.value; if (v) applyBulkRole(v as "staff" | "manager" | "director"); e.currentTarget.selectedIndex = 0; }} className="h-8 min-w-0 bg-bg-subtle text-[11px] text-fg ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40 col-span-2">
                      <option value="" disabled>Set portal role… (already-enabled only)</option>
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="director">Director</option>
                    </Select>
                  </>
                );
              })()}
            </div>
          )}
          <div className="glass elevated rounded-full shadow-pill flex items-center gap-1.5 pl-4 pr-1.5 py-1.5">
            <span className="text-xs font-medium text-fg-muted">
              {selected.size} selected
              {selStats.withPortal > 0 && <span className="text-fg-subtle"> · {selStats.withPortal} with portal</span>}
              {selStats.without > 0 && <span className="text-fg-subtle"> · {selStats.without} without</span>}
            </span>
            <Button size="sm" variant={bulkEditing ? "primary" : "secondary"} onClick={() => setBulkEditing((v) => !v)}><Pencil size={14} /> Set fields</Button>
            <Button size="sm" variant="secondary" onClick={() => doBulk(true)}><UserCheck size={14} /> Restore</Button>
            <Button size="sm" variant="danger-soft" onClick={() => doBulk(false)}><UserMinus size={14} /> Deactivate</Button>
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-info-soft/60 ring-1 ring-info/25 text-info tabular">{peek.workload.open} open</span>
            {peek.workload.overdue > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger tabular">{peek.workload.overdue} overdue</span>}
            {peek.workload.dueSoon > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warn-soft/60 ring-1 ring-warn/25 text-warn tabular">{peek.workload.dueSoon} due soon</span>}
            {!peek.hasContact && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger">No contact</span>}
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
                    <span className="min-w-0 flex-1 truncate text-[13px]">{t.actionItem}</span>
                    <span className="font-mono text-[10px] text-fg-subtle shrink-0">{t.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />

      {filtered.length === 0 && (
        <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated text-center py-12 text-fg-muted text-sm">
          No people match these filters.
        </div>
      )}

      <p className="text-xs text-fg-subtle px-1">
        Showing {filtered.length} of {people.length} · tap a card for full detail · hover to preview workload.
      </p>
    </div>
  );
}
