"use client";
/**
 * Studio People (design/studio-mockup/gen/p_people.py, board People) — what
 * /people draws when Settings → New look → People is on.
 *
 * ⚠️ RESTYLED, NOT REWIRED. The rows are the same `PersonRow`s the Desk
 * directory gets, the counts use the same rules (overloaded = 5+ open,
 * probation ending = within 30 days), and every change goes through the same
 * actions in `src/app/people/actions.ts`.
 *
 *   header  People · company / type / location · Browse | Attention · Group · + Add person
 *   cards   Directory (active, inactive, rings)  |  Needs attention — or the picked person
 *   body    a card per person, grouped; or the Attention queue, worst first
 *   foot    search + the filter chips; Select for bulk changes
 */
import { PersonFace } from "@/components/studio/face";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Maximize2, X, Mail, MessageCircle, Phone, CheckSquare, Check, Clock, SkipForward, ArrowUpRight, Loader2, LayoutGrid, Columns3, ChevronLeft, ChevronRight } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, Ring, stBtn, stFloatBar } from "@/components/studio/kit";
import { StudioMenu } from "@/components/studio/tasks/controls";
import { StudioChoiceMenu } from "@/components/studio/tasks/cells";
import { useToast } from "@/components/shell/toast";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { withReturn, markPush } from "@/lib/nav/return-to";
import type { PersonRow } from "@/lib/people/people-queries";
import { PERSON_TYPES, PERSON_TYPE_LABELS } from "@/lib/people/person-types";
import { PORTAL_ROLES, ROLE_LABEL, asPortalRole } from "@/lib/portal/portal-permissions";
import { snoozePerson, setPeopleActive, bulkSetPeopleField, bulkSetPortalRole } from "@/app/people/actions";
import { cn } from "@/lib/cn";
import { useRemindPerson } from "./remind";
import { useCreateParam } from "@/lib/hooks/use-create-param";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { useStudioPaths } from "@/components/studio/studio-paths";

type Company = { id: number; name: string };
type Hints = Record<number, { onLeave: boolean; present: number; absent: number }>;

const CHIPS: [string, string, string][] = [
  ["all", "All", "var(--st-ink)"],
  ["overloaded", "Overloaded", "#E0479E"],
  ["noContact", "No contact", "#F5A524"],
  ["probationEnding", "Probation ending", "#8B5CF6"],
  ["portal", "Has portal", "#19C37D"],
  ["noPortal", "No portal", "#B9BBBF"],
  ["inactive", "Inactive", "#5B5E63"],
];
const GROUPS: [string, string][] = [["company", "Company"], ["manager", "Manager"], ["department", "Department"], ["site", "Location"], ["none", "No grouping"]];

// Names keep their Mr / Mrs / Ms (owner, 25 Sept 2026); initials() drops the
// title itself, so the circles still read "JS".
const shortName = (n: string) => n.trim();
const probationSoon = (p: PersonRow, now: number) => {
  if (!p.probationEndDate) return false;
  const d = (new Date(p.probationEndDate).getTime() - now) / 86_400_000;
  return d >= 0 && d <= 30;
};
function portalLabel(p: PersonRow): string {
  if (!p.portalEnabled) return "No portal";
  return p.portalDesignation || `${ROLE_LABEL[asPortalRole(p.portalRole)]} portal`;
}
/** "12 · 8 late" / "13 open" / "—" and its colour, as on the board. */
function load(p: PersonRow): { text: string; c: string } {
  const { open, overdue } = p.workload;
  if (!open) return { text: "—", c: "var(--st-sub)" };
  return { text: overdue ? `${open} · ${overdue} late` : `${open} open`, c: overdue >= 3 ? "var(--st-late-text)" : overdue ? "var(--st-soon-text)" : "var(--st-sub)" };
}
function reminderText(p: PersonRow): string {
  const lines = [`Hi ${shortName(p.name)}, a quick reminder:`, ""];
  p.topTasks.forEach((t) => lines.push(`• ${t.actionItem} (${t.code})`));
  lines.push("", "Please update the tracker when you can. Thanks.");
  return lines.join("\n");
}
const waHref = (num: string, text?: string) => `https://wa.me/${num.replace(/[^0-9]/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Their face (Blobatar): colour by role, expression by their work. */
function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  return <PersonFace name={name} size={size} />;
}

/** "+ Add person" opens the footer's "+ New" card on its Person tab (the one
 *  create card — mockup boards QuickAdd and CreateEdit). */
const openAdd = () => window.dispatchEvent(new CustomEvent("studio:new", { detail: { tab: "person" } }));

/** `readOnly` — a director: browse and open people; add, snooze, remind and
 *  bulk changes are the owner's (and refused on the server anyway). */
export function StudioPeople({ people, companies, hints = {}, readOnly = false }: {
  readOnly?: boolean;
  people: PersonRow[];
  companies: Company[];
  hints?: Hints;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const paths = useStudioPaths();
  // A member of staff (26 Sept 2026): their colleagues as a contact book — no
  // workload, no portal levels, no attention queue. The server sends none of it.
  const staff = paths.staff;
  const [busy, start] = useTransition();
  // Columns — one column per group, side by side — is everyone's view
  // (owner, 26 Sept 2026: "system wide … so everyone gets same view"); Grid
  // stays one click away.
  const f = useUrlFilters({ co: "all", type: "all", loc: "all", mode: "browse", group: "company", chip: "all", q: "", lay: "cols" }, { debounceKeys: ["q"] });
  const cols = f.values.lay === "cols" && f.values.mode === "browse";
  const [q, setQ] = useState(f.values.q);
  const [sel, setSel] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [now] = useState(() => Date.now());
  const { remind, pending: reminding } = useRemindPerson();
  const area = useRef<HTMLDivElement>(null);
  useFitFrame(area, { minimum: 360 });
  // Ring size by CSS (both drawn, one shown), not by a media hook: the hook
  // reads the window, the server has none, and the first paint mismatched.
  // /people?new=1 — the old New menu's "Person", and any link that meant "add one".
  useCreateParam("1", () => { if (!readOnly) openAdd(); });

  const openPerson = (id: number) => {
    const to = withReturn(paths.person(id), `${window.location.pathname}${window.location.search}`);
    markPush(to);
    router.push(to);
  };

  // Scope: search + company / type / location (NOT the chip) — the base for both modes.
  const scoped = useMemo(() => {
    const needle = f.values.q.trim().toLowerCase();
    return people.filter((p) => {
      if (f.values.chip !== "inactive" && !p.active) return false;
      if (needle && ![p.name, p.email, p.role, p.companyName, p.staffId].some((v) => v?.toLowerCase().includes(needle))) return false;
      if (f.values.co !== "all" && String(p.companyId) !== f.values.co && !p.associations.some((a) => String(a.companyId) === f.values.co)) return false;
      if (f.values.type !== "all" && p.personType !== f.values.type) return false;
      if (f.values.loc !== "all" && p.workSiteName !== f.values.loc && p.residenceName !== f.values.loc) return false;
      return true;
    });
  }, [people, f.values]);

  const counts = useMemo(() => {
    const act = people.filter((p) => p.active);
    return {
      all: act.length,
      overloaded: act.filter((p) => p.workload.open >= 5).length,
      noContact: act.filter((p) => !p.hasContact).length,
      probationEnding: act.filter((p) => probationSoon(p, now)).length,
      portal: act.filter((p) => p.portalEnabled).length,
      noPortal: act.filter((p) => !p.portalEnabled).length,
      inactive: people.length - act.length,
    } as Record<string, number>;
  }, [people, now]);

  const rows = useMemo(() => {
    const c = f.values.chip;
    return scoped
      .filter((p) =>
        c === "overloaded" ? p.workload.open >= 5
          : c === "noContact" ? !p.hasContact
            : c === "probationEnding" ? probationSoon(p, now)
              : c === "portal" ? p.portalEnabled
                : c === "noPortal" ? !p.portalEnabled
                  : c === "inactive" ? !p.active : true)
      .sort((a, b) => b.workload.overdue - a.workload.overdue || b.workload.open - a.workload.open || a.name.localeCompare(b.name));
  }, [scoped, f.values.chip, now]);

  // The Attention ritual — the same score the Desk directory uses, worst first.
  const attention = useMemo(() => scoped
    .filter((p) => p.active && !skipped.has(p.id))
    .map((p) => {
      const reasons: { text: string; c: string }[] = [];
      let score = 0;
      if (!p.hasContact) { score += 3; reasons.push({ text: "No contact details", c: "var(--st-late-text)" }); }
      if (probationSoon(p, now)) { score += 2; reasons.push({ text: `Probation ends in ${Math.ceil((new Date(p.probationEndDate!).getTime() - now) / 86_400_000)}d`, c: "var(--st-soon-text)" }); }
      if (p.workload.overdue > 0) { score += 2; reasons.push({ text: `${p.workload.overdue} overdue`, c: "var(--st-late-text)" }); }
      else if (p.workload.open >= 5) { score += 1; reasons.push({ text: `Overloaded · ${p.workload.open} open`, c: "var(--st-soon-text)" }); }
      return { p, score, reasons };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)), [scoped, skipped, now]);

  const groups = useMemo(() => {
    const by = f.values.group;
    if (by === "none") return [{ key: "all", name: "Everyone", items: rows }];
    // A column per company (the viewer's companies — every company for the
    // owner), and a person sits under EVERY one they work for, not only their
    // main one: for a director that main company may be one they are not in
    // (owner, 26 Sept 2026). The same rule for everyone, so every view matches.
    if (by === "company") {
      const out = companies
        .map((c) => ({ key: `c${c.id}`, name: c.name, items: rows.filter((p) => p.companyId === c.id || p.associations.some((a) => a.companyId === c.id)) }))
        .filter((g) => g.items.length > 0)
        .sort((x, y) => y.items.length - x.items.length || x.name.localeCompare(y.name));
      const placed = new Set(out.flatMap((g) => g.items.map((p) => p.id)));
      const rest = rows.filter((p) => !placed.has(p.id));
      return rest.length ? [...out, { key: "none", name: readOnly ? "Also here to help" : "No company — outsiders & candidates", items: rest }] : out;
    }
    const m = new Map<string, { key: string; name: string; sort: string; items: PersonRow[] }>();
    for (const p of rows) {
      const [key, name] =
        by === "manager" ? (p.managerId != null ? [`m${p.managerId}`, p.managerName ?? "—"] : ["none", "No manager set"])
          : by === "department" ? (p.departmentName ? [`d${p.departmentName}`, p.departmentName] : ["none", "No department"])
            : by === "site" ? (p.workSiteName ? [`s${p.workSiteName}`, p.workSiteName] : ["none", "No location set"])
              : p.companyId != null ? [`c${p.companyId}`, p.companyName ?? "—"] : ["none", "Outsiders & candidates"];
      const g = m.get(key) ?? { key, name, sort: key === "none" ? "~" : name, items: [] };
      g.items.push(p);
      m.set(key, g);
    }
    // Busiest group first, the way the board reads (worst news at the top).
    return [...m.values()].sort((a, b) => {
      const oa = a.items.reduce((n, p) => n + p.workload.overdue, 0), ob = b.items.reduce((n, p) => n + p.workload.overdue, 0);
      return a.sort === "~" ? 1 : b.sort === "~" ? -1 : ob - oa || a.name.localeCompare(b.name);
    });
  }, [rows, f.values.group, readOnly, companies]);

  const selP = sel != null ? people.find((p) => p.id === sel) ?? null : null;
  const clickPerson = (p: PersonRow) => {
    if (selecting) { setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); return; }
    // On a phone the card above is out of sight — open the person instead.
    if (!window.matchMedia("(min-width: 1024px)").matches) { openPerson(p.id); return; }
    setSel(sel === p.id ? null : p.id);
  };
  const active = counts.all;
  const locations = useMemo(() => [...new Set(people.flatMap((p) => [p.workSiteName, p.residenceName]).filter(Boolean) as string[])].sort(), [people]);

  function snooze(p: PersonRow) {
    start(async () => {
      const res = await snoozePerson(p.id, new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
      toast(res.ok ? `${shortName(p.name)} snoozed until tomorrow.` : res.error || "Couldn't snooze.", { tone: res.ok ? "success" : "warn" });
      if (res.ok) router.refresh();
    });
  }
  function bulk(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const res = await fn();
      toast(res.ok ? done : res.error || "Couldn't update.", { tone: res.ok ? "success" : "warn" });
      if (res.ok) { setPicked(new Set()); router.refresh(); }
    });
  }
  const ids = [...picked];
  const pickedLabel = `${ids.length} ${ids.length === 1 ? "person" : "people"}`;

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="People"
        left={
          <>
            <StudioMenu label={f.values.co === "all" ? "All companies" : companies.find((c) => String(c.id) === f.values.co)?.name ?? "All companies"} searchable options={[
              { key: "all", label: "All companies", href: f.hrefFor({ co: "all" }), active: f.values.co === "all" },
              ...companies.map((c) => ({ key: String(c.id), label: c.name, href: f.hrefFor({ co: String(c.id) }), active: f.values.co === String(c.id) })),
            ]} />
            <StudioMenu label={f.values.type === "all" ? "All types" : PERSON_TYPE_LABELS[f.values.type as keyof typeof PERSON_TYPE_LABELS] ?? "All types"} options={[
              { key: "all", label: "All types", href: f.hrefFor({ type: "all" }), active: f.values.type === "all" },
              ...PERSON_TYPES.map((t) => ({ key: t, label: PERSON_TYPE_LABELS[t], href: f.hrefFor({ type: t }), active: f.values.type === t })),
            ]} />
            <StudioMenu label={f.values.loc === "all" ? "All locations" : f.values.loc} searchable={locations.length > 8} options={[
              { key: "all", label: "All locations", href: f.hrefFor({ loc: "all" }), active: f.values.loc === "all" },
              ...locations.map((l) => ({ key: l, label: l, href: f.hrefFor({ loc: l }), active: f.values.loc === l })),
            ]} />
          </>
        }
        right={
          <>
            {!staff && <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label="Mode">
              {([["browse", "Browse", null], ["attention", "Attention", attention.length]] as const).map(([k, l, n]) => (
                <button key={k} type="button" role="tab" aria-selected={f.values.mode === k} onClick={() => f.set({ mode: k })}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
                    f.values.mode === k ? "bg-[var(--st-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {l}{n != null && <span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>}
                </button>
              ))}
            </div>}
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px] max-md:hidden" role="tablist" aria-label="Layout">
              {([["grid", "Grid", LayoutGrid], ["cols", "Columns", Columns3]] as const).map(([k, l, Icon]) => (
                <button key={k} type="button" role="tab" aria-selected={f.values.lay === k} title={l} onClick={() => f.set({ lay: k, mode: "browse" })}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors",
                    f.values.lay === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  <Icon size={14} /><span className="hidden xl:inline">{l}</span>
                </button>
              ))}
            </div>
            <StudioMenu label="Group" sub={`· ${GROUPS.find(([k]) => k === f.values.group)?.[1] ?? "Company"}`}
              options={GROUPS.map(([k, l]) => ({ key: k, label: l, href: f.hrefFor({ group: k }), active: f.values.group === k }))} />
            {!readOnly && <button type="button" onClick={openAdd} className={stBtn.dark}><Plus size={15} />Add person</button>}
          </>
        }
      />

      {/* ── The two cards ─────────────────────────────────────────────────── */}
      <StudioCardRow className="lg:h-[220px]">
        <StudioCard className="md:min-h-[200px]">
          <CardHead label={staff ? "Your colleagues" : "Directory"} right={<span className="text-xs text-[var(--st-muted)]">{people.length} people · {companies.length} {companies.length === 1 ? "company" : "companies"}</span>} />
          {staff ? <StaffCompanyBars people={people} companies={companies} pick={(id) => f.set({ co: f.values.co === String(id) ? "all" : String(id) })} on={f.values.co} /> :
          <div className="mt-auto flex items-end gap-3 pt-3 sm:flex-wrap sm:gap-5 lg:flex-nowrap xl:gap-7">
            <div className="min-w-0 flex-1 sm:flex-none">
              <span className="contents sm:hidden"><BigNumber value={active} unit="active" size={52} /></span>
              <span className="hidden sm:contents"><BigNumber value={active} unit="active" /></span>
              <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[var(--st-on-card-muted)]">
                <button type="button" onClick={() => f.set({ chip: "inactive", mode: "browse" })} className="hover:text-[var(--st-on-card)]">{counts.inactive} inactive</button>
                <button type="button" onClick={() => f.set({ chip: "noPortal", mode: "browse" })} className="hover:text-[var(--st-on-card)]">{counts.noPortal} without a portal login</button>
              </div>
            </div>
            <span className="hidden flex-1 sm:block" />
            <button type="button" onClick={() => f.set({ chip: "portal", mode: "browse" })} title="Show who is on the portal">
              <span className="hidden xl:contents"><Ring value={active ? (counts.portal / active) * 100 : 0} size={116} stroke={12} color="var(--st-ok)" track="var(--st-card-line)" label={counts.portal} sub="on the portal" /></span>
              <span className="hidden sm:contents xl:hidden"><Ring value={active ? (counts.portal / active) * 100 : 0} size={92} stroke={10} color="var(--st-ok)" track="var(--st-card-line)" label={counts.portal} sub="on the portal" /></span>
              <span className="contents sm:hidden"><Ring value={active ? (counts.portal / active) * 100 : 0} size={66} stroke={8} color="var(--st-ok)" track="var(--st-card-line)" label={counts.portal} sub="portal" /></span>
            </button>
            <button type="button" onClick={() => f.set({ chip: "overloaded", mode: "browse" })} title="Show who is overloaded">
              <span className="hidden xl:contents"><Ring value={active ? (counts.overloaded / active) * 100 : 0} size={116} stroke={12} color="var(--st-late)" track="var(--st-card-line)" label={counts.overloaded} sub="overloaded" /></span>
              <span className="hidden sm:contents xl:hidden"><Ring value={active ? (counts.overloaded / active) * 100 : 0} size={92} stroke={10} color="var(--st-late)" track="var(--st-card-line)" label={counts.overloaded} sub="overloaded" /></span>
              <span className="contents sm:hidden"><Ring value={active ? (counts.overloaded / active) * 100 : 0} size={66} stroke={8} color="var(--st-late)" track="var(--st-card-line)" label={counts.overloaded} sub="busy" /></span>
            </button>
          </div>}
        </StudioCard>

        <StudioCard texture="contour" className="min-h-[200px]">
          {selP ? (
            <div key={selP.id} className="st-pop flex h-full flex-col gap-2.5">
              <div className="flex h-[26px] items-center gap-2">
                {selP.staffId && <span className="st-mono rounded-md bg-[var(--st-card-line)] px-[7px] py-[3px] text-[11px] text-[#C9CBCF]">{selP.staffId}</span>}
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--st-on-card-muted)]">{selP.companyName ?? "No company"}</span>
                <button type="button" onClick={() => openPerson(selP.id)} aria-label="Open the full record" title="Open the full record"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--st-on-card)] text-[#111214]"><Maximize2 size={13} strokeWidth={2.2} /></button>
                <button type="button" onClick={() => setSel(null)} aria-label="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2E3035] text-[#C9CBCF] hover:text-[var(--st-on-card)]"><X size={12} strokeWidth={2.4} /></button>
              </div>
              <div className="flex items-center gap-3">
                <Avatar name={selP.name} size={44} />
                <div className="min-w-0">
                  <div className="truncate text-[22px] font-medium tracking-[-0.015em]">{selP.name}</div>
                  <div className="truncate text-[13px] text-[var(--st-on-card-muted)]">{selP.role ?? "No job title"}{selP.managerName ? ` · reports to ${shortName(selP.managerName)}` : ""}</div>
                </div>
              </div>
              <div className="flex-1" />
              <div className="flex flex-wrap items-center gap-2">
                {!staff && <>
                <Link href={`/?tab=tasks&who=${selP.id}`} title="Their open tasks" className="flex h-[26px] items-center rounded-lg bg-[var(--st-card-3)] px-2.5 text-xs hover:bg-[var(--st-card-line)]">{selP.workload.open} open</Link>
                <span className={cn("flex h-[26px] items-center rounded-lg bg-[var(--st-card-3)] px-2.5 text-xs", selP.workload.overdue ? "text-[#F07BBE]" : "text-[var(--st-on-card-muted)]")}>{selP.workload.overdue} late</span>
                <span className="flex h-[26px] items-center rounded-lg bg-[var(--st-card-3)] px-2.5 text-xs">{portalLabel(selP)}</span>
                </>}
                {hints[selP.id]?.onLeave && <span className="flex h-[26px] items-center rounded-lg bg-[var(--st-card-3)] px-2.5 text-xs text-[#F5B94E]">On leave today</span>}
                <span className="flex-1" />
                {selP.email && <a href={`mailto:${selP.email}`} aria-label="Email" title={selP.email} className={ICON_BTN}><Mail size={14} /></a>}
                {selP.whatsapp && <a href={waHref(selP.whatsapp)} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" className={ICON_BTN}><MessageCircle size={14} /></a>}
                {(selP.phone || selP.whatsapp) && <a href={`tel:${selP.phone ?? selP.whatsapp}`} aria-label="Call" title="Call" className={ICON_BTN}><Phone size={14} /></a>}
                {!readOnly && <button type="button" disabled={!selP.workload.open || reminding} onClick={() => remind(selP, selP.topTasks)}
                  title={selP.workload.open ? "Saves a reminder in the Outbox for you to send" : "No open tasks"}
                  className={cn(stBtn.onCard, "h-8 rounded-[9px] disabled:opacity-50")}>{reminding && <Loader2 size={12} className="animate-spin" />}Remind about open work</button>}
              </div>
            </div>
          ) : staff ? (
            <div className="st-pop flex h-full flex-col">
              <CardHead label="Reach someone" right={<span className="text-xs text-[var(--st-muted)]">Pick a person to see them here</span>} />
              <p className="mt-auto pt-3 text-[15px] leading-normal text-[#E6E6E3]">Click a colleague to see how to reach them — chat, WhatsApp, email or a call. Double-click opens their page.</p>
            </div>
          ) : (
            <div className="st-pop flex h-full flex-col">
              <CardHead label={`Needs attention · ${attention.length}`} right={<span className="text-xs text-[var(--st-muted)]">Pick a person to see them here</span>} />
              <div className="mt-auto grid grid-cols-3 gap-2 pt-3">
                {([["overloaded", counts.overloaded, "carry 5+ open tasks"], ["noContact", counts.noContact, "have no contact details"], ["probationEnding", counts.probationEnding, "probations ending soon"]] as const).map(([k, n, l]) => (
                  <button key={k} type="button" onClick={() => f.set({ chip: k, mode: "browse" })}
                    className="rounded-[12px] border border-[var(--st-card-line)] bg-[var(--st-card-2)] p-3 text-left transition-colors hover:bg-[var(--st-card-3)]">
                    <div className="text-[26px] leading-none tracking-[-0.02em] tabular-nums">{n}</div>
                    <div className="mt-1 text-[11px] text-[var(--st-muted)]">{l}</div>
                  </button>
                ))}
              </div>
              <div className="mt-2.5 text-xs text-[var(--st-muted)]">
                Switch to <button type="button" onClick={() => f.set({ mode: "attention" })} className="font-medium text-[var(--st-on-card)] hover:underline">Attention</button> to work through them worst first — message, fix details, snooze or skip.
              </div>
            </div>
          )}
        </StudioCard>
      </StudioCardRow>

      {/* ── The people, or the queue — from lg it fills the frame and scrolls in
           itself, with the search bar floating over its foot (the board). */}
      <div ref={area} className="relative min-h-0">
      {cols && groups.length > 0 && (
        <div className="hidden md:block md:h-[62vh] lg:absolute lg:inset-0 lg:h-auto">
          <PeopleColumns groups={groups} titled={f.values.group !== "none"} note={staff ? undefined : (items) => {
            const over = items.reduce((n, p) => n + p.workload.overdue, 0);
            const noCon = items.filter((p) => !p.hasContact).length;
            return { text: [over ? `${over} overdue` : null, noCon ? `${noCon} no contact` : null].filter(Boolean).join(" · ") || "on track", c: over >= 3 ? "var(--st-late-text)" : over || noCon ? "var(--st-soon-text)" : "var(--st-ok-text)" };
          }}>
            {(p) => {
              const l = load(p);
              const on = selecting ? picked.has(p.id) : sel === p.id;
              return (
                <button key={p.id} type="button" onClick={() => clickPerson(p)} onDoubleClick={() => !selecting && openPerson(p.id)}
                  title={selecting ? undefined : "Click to see them above · double-click to open"}
                  className={cn("flex w-full min-w-0 shrink-0 items-center gap-2.5 rounded-xl border-[1.5px] px-2.5 py-2 text-left transition-colors",
                    on ? "border-[var(--st-ink)] bg-[var(--st-page)]" : "border-transparent hover:bg-[var(--st-page)]", !p.active && "opacity-60")}>
                  <Avatar name={p.name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{shortName(p.name)}</span>
                    <span className="block truncate text-xs text-[var(--st-muted)]">{p.role ?? "No job title"}</span>
                  </span>
                  {selecting
                    ? <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px]", on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-dash)]")}>{on && <Check size={11} strokeWidth={3} />}</span>
                    : !staff && <span className="shrink-0 whitespace-nowrap text-xs font-medium" style={{ color: l.c }}>{l.text}</span>}
                </button>
              );
            }}
          </PeopleColumns>
        </div>
      )}
      <div className={cn("st-scroll lg:absolute lg:inset-0 lg:overflow-y-auto lg:pr-1", cols && groups.length > 0 && "md:hidden")}>
      {f.values.mode === "attention" ? (
        <div className="flex flex-col gap-2.5 pb-24">
          {attention.length === 0 ? (
            <div className="rounded-[16px] bg-[var(--st-surface)] p-10 text-center text-sm text-[var(--st-muted)]">Nothing needs attention — every active person has contact details and no overdue load.</div>
          ) : attention.map(({ p, reasons }) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[16px] bg-[var(--st-surface)] px-4 py-3">
              <Avatar name={p.name} />
              <button type="button" onClick={() => openPerson(p.id)} className="min-w-[160px] flex-1 text-left">
                <span className="block truncate text-[14px] font-medium">{shortName(p.name)}</span>
                <span className="block truncate text-xs text-[var(--st-muted)]">{[p.role, p.companyName].filter(Boolean).join(" · ")}</span>
              </button>
              <div className="flex flex-wrap gap-1.5">
                {reasons.map((r) => <span key={r.text} className="flex h-6 items-center rounded-lg bg-[var(--st-page)] px-2 text-xs" style={{ color: r.c }}>{r.text}</span>)}
              </div>
              <div className="flex gap-1.5">
                {p.whatsapp
                  ? <a href={waHref(p.whatsapp, reminderText(p))} target="_blank" rel="noreferrer" className={stBtn.ghost}><MessageCircle size={14} />Message</a>
                  : <button type="button" onClick={() => openPerson(p.id)} className={stBtn.ghost}><ArrowUpRight size={14} />Add contact</button>}
                {!readOnly && <button type="button" onClick={() => snooze(p)} disabled={busy} className={stBtn.ghost}><Clock size={14} />Snooze</button>}
                <button type="button" onClick={() => setSkipped((s) => new Set(s).add(p.id))} className={stBtn.ghost}><SkipForward size={14} />Skip</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-[18px] pb-24">
          {groups.length === 0 && <div className="rounded-[16px] bg-[var(--st-surface)] p-10 text-center text-sm text-[var(--st-muted)]">Nobody matches.</div>}
          {groups.map((g) => {
            const over = g.items.reduce((n, p) => n + p.workload.overdue, 0);
            const noCon = g.items.filter((p) => !p.hasContact).length;
            const note = [over ? `${over} overdue` : null, noCon ? `${noCon} no contact` : null].filter(Boolean).join(" · ") || "on track";
            const noteC = over >= 3 ? "var(--st-late-text)" : over || noCon ? "var(--st-soon-text)" : "var(--st-ok-text)";
            return (
              <section key={g.key}>
                {f.values.group !== "none" && (
                  <div className="flex items-baseline gap-2.5 px-1 pb-2">
                    <span className="text-[15px] font-semibold">{g.name}</span>
                    {!staff && <span className="text-xs" style={{ color: noteC }}>{note}</span>}
                    <span className="text-xs text-[var(--st-muted)]">{g.items.length} {g.items.length === 1 ? "person" : "people"}</span>
                  </div>
                )}
                {/* Phone (mockup M_People): the group is one white card of rows. */}
                <div className="grid grid-cols-1 rounded-[18px] bg-[var(--st-surface)] px-1 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] sm:gap-2.5 sm:rounded-none sm:bg-transparent sm:px-0">
                  {g.items.map((p) => {
                    const l = load(p);
                    const on = selecting ? picked.has(p.id) : sel === p.id;
                    return (
                      <button key={p.id} type="button"
                        onClick={() => clickPerson(p)}
                        onDoubleClick={() => !selecting && openPerson(p.id)}
                        title={selecting ? undefined : "Click to see them above · double-click to open"}
                        className={cn("relative flex min-w-0 flex-col gap-2.5 bg-[var(--st-surface)] text-left transition-colors",
                          "border-b border-[var(--st-line-soft)] px-3 py-2.5 last:border-b-0",
                          "sm:rounded-[16px] sm:border-[1.5px] sm:p-3.5 sm:last:border-b-[1.5px]",
                          on ? "sm:border-[var(--st-ink)] max-sm:bg-[var(--st-page)]" : "sm:border-transparent sm:hover:border-[var(--st-line)]", !p.active && "opacity-60")}>
                        {selecting && (
                          <span className={cn("absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-[5px] border-[1.5px]",
                            on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-dash)]")}>{on && <Check size={11} strokeWidth={3} />}</span>
                        )}
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={p.name} />
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium">{shortName(p.name)}</span>
                            <span className="block truncate text-xs text-[var(--st-muted)]">{p.role ?? "No job title"}</span>
                          </span>
                          {/* Phone (mockup M_People): one row, the load on the right. */}
                          {!staff && <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-xs font-medium sm:hidden" style={{ color: l.c }}>{l.text}</span>}
                        </span>
                        <span className="hidden min-w-0 items-center gap-1.5 text-[11px] sm:flex">
                          {p.staffId && <span className="st-mono shrink-0 rounded-[5px] bg-[var(--st-page)] px-1.5 py-0.5 text-[var(--st-label)]">{p.staffId}</span>}
                          <span className="truncate text-[var(--st-muted)]">{staff ? p.companyName ?? "" : hints[p.id]?.onLeave ? "On leave today" : portalLabel(p)}</span>
                          <span className="flex-1" />
                          {!staff && <span className="shrink-0 whitespace-nowrap text-xs font-medium" style={{ color: l.c }}>{l.text}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      </div>

      {/* ── The floating foot: search + the chips; Select for changes in bulk.
           Below lg it rides above the footer; from lg it sits on the area. */}
      {/* The cards fade out under the bar instead of peeking out, cut, below it. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-24 bg-gradient-to-b from-transparent to-[var(--st-page)] lg:block" />
      <div className={cn(stFloatBar.sticky, "-mt-20", stFloatBar.fixedLg)}>
        {selecting ? (
          <div className="pointer-events-auto flex w-full max-w-[1100px] flex-wrap items-center gap-2 rounded-2xl bg-[var(--st-card)] p-2 pl-4 text-[var(--st-on-card)] shadow-[0_10px_28px_rgba(17,18,20,0.25)] sm:h-14 sm:flex-nowrap sm:py-0">
            <span className="text-[13px] font-medium">{ids.length ? pickedLabel : "Tick people to change them together"}</span>
            <button type="button" onClick={() => setPicked(new Set(rows.map((p) => p.id)))} className="text-xs text-[var(--st-on-card-muted)] hover:text-[var(--st-on-card)]">All {rows.length}</button>
            <span className="flex-1" />
            {busy && <Loader2 size={14} className="animate-spin" />}
            {ids.length > 0 && (
              <>
                <StudioChoiceMenu tone="dark" value={null} empty="Company" prefix="Set" showDot={false} width={260}
                  options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
                  onPick={(v) => bulk(() => bulkSetPeopleField(ids, "company", Number(v)), `Company set for ${pickedLabel}.`)} />
                <StudioChoiceMenu tone="dark" value={null} empty="Manager" prefix="Set" showDot={false} width={260}
                  options={[{ value: "", label: "No manager" }, ...people.filter((p) => p.active).map((p) => ({ value: String(p.id), label: p.name }))]}
                  onPick={(v) => bulk(() => bulkSetPeopleField(ids, "manager", v ? Number(v) : null), `Manager set for ${pickedLabel}.`)} />
                <StudioChoiceMenu tone="dark" value={null} empty="Portal level" prefix="Set" showDot={false}
                  options={PORTAL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  onPick={(v) => bulk(() => bulkSetPortalRole(ids, v), `Portal level set.`)} />
                <button type="button" onClick={() => bulk(() => setPeopleActive(ids, false), `${pickedLabel} deactivated.`)} className={stBtn.onCardGhost}>Deactivate</button>
                <button type="button" onClick={() => bulk(() => setPeopleActive(ids, true), `${pickedLabel} restored.`)} className={stBtn.onCardGhost}>Restore</button>
              </>
            )}
            <button type="button" onClick={() => { setSelecting(false); setPicked(new Set()); }} className={stBtn.onCard}>Done</button>
          </div>
        ) : (
          <div className="pointer-events-auto flex w-full max-w-[1100px] flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-2 pl-4 shadow-[0_10px_28px_rgba(17,18,20,0.12)] sm:h-14 sm:flex-nowrap sm:py-0">
            <label className="flex min-w-[160px] flex-1 items-center gap-2 text-[var(--st-muted)]">
              <Search size={15} />
              <span className="sr-only">Search people</span>
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); f.set({ q: e.target.value }); }} placeholder="Search people"
                className="bare-field h-9 w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none" />
            </label>
            {!staff && <span className="hidden h-6 w-px bg-[var(--st-line)] sm:block" aria-hidden />}
            <div className="flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {!staff && CHIPS.map(([k, l, dot]) => {
                const on = f.values.chip === k;
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => f.set({ chip: k, mode: "browse" })}
                    className={cn("flex h-9 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[10px] border px-3 text-xs transition-colors",
                      on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-line)] bg-[var(--st-surface)] hover:bg-[var(--st-page)]")}>
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: on && k === "all" ? "var(--st-surface)" : dot }} />
                    {l}<span className="st-mono text-[11px] opacity-70">{counts[k]}</span>
                  </button>
                );
              })}
              {!readOnly && <button type="button" onClick={() => setSelecting(true)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]" title="Tick several people and change them together">
                <CheckSquare size={14} />Select
              </button>}
            </div>
          </div>
        )}
      </div>
      </div>
    </StudioScope>
  );
}

/** Columns: one per group, side by side, sharing the width when there are two
 *  or three and sliding sideways (‹ ›) when there are more. The page never
 *  scrolls — each column scrolls inside itself, as the Home cards do. */
function PeopleColumns({ groups, titled, note, children }: { groups: { key: string; name: string; items: PersonRow[] }[]; titled: boolean; note?: (items: PersonRow[]) => { text: string; c: string }; children: (p: PersonRow) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [groups.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const slide = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    const col = el.firstElementChild as HTMLElement | null;
    el.scrollBy({ left: dir * ((col?.offsetWidth ?? 300) + 12), behavior: "smooth" });
  };
  const ARROW = "absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--st-line)] bg-[var(--st-surface)] shadow-[0_6px_18px_rgba(17,18,20,0.14)] transition-opacity hover:bg-[var(--st-page)]";
  return (
    <div className="relative h-full">
      <div ref={ref} onScroll={measure} className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto pb-20 [scrollbar-width:none]">
        {groups.map((g) => (
          <section key={g.key} className="flex min-h-0 min-w-[260px] shrink-0 grow basis-[calc((100%-24px)/3)] snap-start flex-col rounded-[18px] bg-[var(--st-surface)] xl:basis-[calc((100%-36px)/4)]">
            {titled && (
              <div className="flex shrink-0 items-baseline gap-2 border-b border-[var(--st-line-soft)] px-4 pb-2.5 pt-3.5">
                <span className="min-w-0 truncate text-[15px] font-semibold">{g.name}</span>
                <span className="shrink-0 text-xs text-[var(--st-muted)]">{g.items.length}</span>
                {note && (() => { const n = note(g.items); return <span className="ml-auto shrink-0 text-xs" style={{ color: n.c }}>{n.text}</span>; })()}
              </div>
            )}
            <div className="st-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
              {g.items.map((p) => children(p))}
            </div>
          </section>
        ))}
      </div>
      {edge.left && <button type="button" aria-label="Earlier columns" onClick={() => slide(-1)} className={cn(ARROW, "-left-3")}><ChevronLeft size={17} /></button>}
      {edge.right && <button type="button" aria-label="More columns" onClick={() => slide(1)} className={cn(ARROW, "-right-3")}><ChevronRight size={17} /></button>}
    </div>
  );
}

/** Staff's first card: how many colleagues in each of their companies — a
 *  company is a filter, as the owner's rings are. */
function StaffCompanyBars({ people, companies, pick, on }: { people: PersonRow[]; companies: Company[]; pick: (id: number) => void; on: string }) {
  const count = (id: number) => people.filter((p) => p.active && (p.companyId === id || p.associations.some((a) => a.companyId === id))).length;
  const rows = companies.map((c) => ({ ...c, n: count(c.id) })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="mt-auto flex items-end gap-5 pt-3">
      <BigNumber value={people.filter((p) => p.active).length} unit="colleagues" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {rows.slice(0, 4).map((c) => (
          <button key={c.id} type="button" onClick={() => pick(c.id)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-left text-xs">
            <span className={cn("truncate", on === String(c.id) ? "text-white" : "text-[#C9CBCF] hover:text-white")}>{c.name}</span>
            <span className="st-mono text-[var(--st-on-card-muted)]">{c.n}</span>
            <span className="col-span-2 mt-1 h-[5px] overflow-hidden rounded-[3px] bg-[var(--st-card-line)]"><span className="block h-full rounded-[3px] bg-[var(--st-ok)]" style={{ width: `${(c.n / max) * 100}%` }} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ICON_BTN = "flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#34363B] text-[#E6E6E3] transition-colors hover:bg-[var(--st-card-2)]";
