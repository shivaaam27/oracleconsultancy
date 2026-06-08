"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Users, ChevronRight, ChevronDown, LayoutGrid, Search, Printer, X,
  ZoomIn, ZoomOut, Maximize2, Minimize2, Expand, FoldVertical,
  MessageCircle, UserRound, Send, Laptop, ShieldCheck, Plane, Sparkles, AlertTriangle,
} from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { Segmented } from "@/components/macos";
import { cn } from "@/lib/cn";
import { PERSON_TYPE_LABELS } from "@/lib/person-types";
import { countNodes, type CompanyTree, type OrgNode } from "@/lib/org-chart";
import type { OrgPersonExtras } from "@/lib/org-extras";

type Extras = Record<number, OrgPersonExtras>;

const TYPE_TINT: Record<string, string> = {
  local_staff: "bg-accent-soft text-accent ring-accent/25",
  outsider: "bg-bg-muted text-fg-muted ring-border",
  expat: "bg-info-soft text-info ring-info/25",
  candidate: "bg-warn-soft text-warn ring-warn/25",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Stable colour per department name (for the dept tint). */
function deptHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function waLink(node: OrgNode): string | null {
  const raw = node.whatsapp || node.phone;
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export type OrgChartCompany = { id: number; name: string; accentColor: string | null };

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function MiniPill({ tone, label, title }: { tone: string; label: string; title: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular", tone)}>
      {label}
    </span>
  );
}

function NodeCard({
  node,
  extras,
  accentColor,
  collapsed,
  onToggle,
  matched,
}: {
  node: OrgNode;
  extras?: OrgPersonExtras;
  accentColor: string | null;
  collapsed: boolean;
  onToggle: () => void;
  matched: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const accent = accentColor || "hsl(var(--accent))";
  const dept = node.departmentName;
  const wa = waLink(node);
  const mailto = node.email ? `mailto:${node.email}` : null;
  const x = extras;

  const compTone = x?.complianceStatus === "Risk" ? "bg-danger-soft text-danger ring-1 ring-danger/30"
    : x?.complianceStatus === "Watch" ? "bg-warn-soft text-warn ring-1 ring-warn/30"
    : "bg-ok-soft text-ok ring-1 ring-ok/30";

  return (
    <div
      className={cn(
        "org-card group relative w-[17rem] rounded-2xl glass elevated overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-lg",
        matched && "ring-2 ring-accent"
      )}
    >
      {/* company accent stripe */}
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} aria-hidden />

      {/* status flags top-right */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 print-hidden">
        {x?.onLeaveToday && (
          <span title="On leave today" className="inline-flex items-center gap-0.5 rounded-full bg-warn-soft text-warn ring-1 ring-warn/30 px-1.5 py-0.5 text-[9px] font-semibold">
            <Plane size={9} /> Leave
          </span>
        )}
        {x?.onboarding && (
          <span title="Onboarding in progress" className="inline-flex items-center gap-0.5 rounded-full bg-info-soft text-info ring-1 ring-info/30 px-1.5 py-0.5 text-[9px] font-semibold">
            <Sparkles size={9} /> Onboarding
          </span>
        )}
      </div>

      <div className="px-3 pt-3 pb-2.5">
        {/* header */}
        <div className="flex items-center gap-2.5">
          <span className={cn("h-11 w-11 rounded-full ring-1 flex items-center justify-center text-sm font-semibold shrink-0", TYPE_TINT[node.personType] ?? TYPE_TINT.outsider)}>
            {initials(node.name)}
          </span>
          <div className="min-w-0 flex-1">
            <PersonDrawerLink id={node.id} name={node.name} className="block text-sm font-semibold text-fg hover:text-accent hover:underline truncate" />
            <div className="flex items-center gap-1 text-[11px] text-fg-muted truncate">
              {dept && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: `hsl(${deptHue(dept)} 65% 55%)` }} />}
              <span className="truncate">{node.role || PERSON_TYPE_LABELS[node.personType]}{dept ? ` · ${dept}` : ""}</span>
            </div>
          </div>
          {hasChildren && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? "Expand reports" : "Collapse reports"}
              className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-bg-muted/70 transition-colors print-hidden"
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </div>

        {/* signals */}
        {x && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {x.compliancePct != null && (
              <span title={`Document compliance ${x.compliancePct}%`} className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular", compTone)}>
                <ShieldCheck size={10} /> {x.compliancePct}%
              </span>
            )}
            {x.open > 0 && <MiniPill tone="bg-info-soft text-info" label={`${x.open} open`} title={`${x.open} open task(s)`} />}
            {x.overdue > 0 && <MiniPill tone="bg-danger-soft text-danger" label={`${x.overdue} overdue`} title={`${x.overdue} overdue`} />}
            {x.notStarted > 0 && <MiniPill tone="bg-bg-muted text-fg-muted" label={`${x.notStarted} not started`} title={`${x.notStarted} not started`} />}
            {x.closed > 0 && <MiniPill tone="bg-ok-soft text-ok" label={`${x.closed} closed`} title={`${x.closed} completed/closed`} />}
            {x.assetsHeld > 0 && (
              <span title={`${x.assetsHeld} asset(s) held`} className="inline-flex items-center gap-0.5 rounded-md bg-bg-muted text-fg-muted px-1.5 py-0.5 text-[10px] font-medium tabular">
                <Laptop size={10} /> {x.assetsHeld}
              </span>
            )}
          </div>
        )}

        {node.secondaryManagers.length > 0 && (
          <div className="mt-1.5 inline-flex items-center text-[10px] text-fg-subtle border-l-2 border-dotted border-fg-subtle/50 pl-1.5">
            also reports to {node.secondaryManagers.map((m) => m.name ?? "—").join(", ")}
          </div>
        )}

        {/* hover quick actions */}
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity print-hidden">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="h-6 w-6 rounded-full flex items-center justify-center bg-bg-muted/70 text-fg-muted hover:text-ok hover:bg-ok-soft transition-colors">
              <MessageCircle size={13} />
            </a>
          )}
          <PersonDrawerLink id={node.id} name={node.name} title="Open profile" className="h-6 w-6 rounded-full flex items-center justify-center bg-bg-muted/70 text-fg-muted hover:text-accent hover:bg-accent-soft transition-colors">
            <UserRound size={13} />
          </PersonDrawerLink>
          <a href={`/outbox?person=${node.id}`} title="Outbox" className="h-6 w-6 rounded-full flex items-center justify-center bg-bg-muted/70 text-fg-muted hover:text-accent hover:bg-accent-soft transition-colors">
            <Send size={13} />
          </a>
          {x?.topTask && (
            <span title={`Top task — ${x.topTask.code}: ${x.topTask.title}`} className="h-6 px-1.5 inline-flex items-center gap-0.5 rounded-full bg-bg-muted/70 text-fg-muted text-[10px] max-w-[7.5rem] truncate">
              <AlertTriangle size={11} className="shrink-0 text-warn" /> {x.topTask.code}
            </span>
          )}
        </div>
      </div>

      {hasChildren && collapsed && (
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-fg-subtle bg-bg-elev rounded-full px-1.5 ring-1 ring-border tabular print-hidden">
          {countNodes(node.children)}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recursive tree                                                      */
/* ------------------------------------------------------------------ */

function Subtree({
  node, extras, accentColor, collapsedIds, toggle, matchIds, forceExpand,
}: {
  node: OrgNode;
  extras: Extras;
  accentColor: string | null;
  collapsedIds: Set<number>;
  toggle: (id: number) => void;
  matchIds: Set<number>;
  forceExpand: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = !forceExpand && collapsedIds.has(node.id);
  const showChildren = hasChildren && !collapsed;

  return (
    <li>
      <NodeCard
        node={node}
        extras={extras[node.id]}
        accentColor={accentColor}
        collapsed={collapsed}
        onToggle={() => toggle(node.id)}
        matched={matchIds.has(node.id)}
      />
      {showChildren && (
        <ul>
          {node.children.map((c) => (
            <Subtree key={c.id} node={c} extras={extras} accentColor={accentColor}
              collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={forceExpand} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** ids of every node that has children (collapsible). */
function collapsibleIds(roots: OrgNode[]): number[] {
  const out: number[] = [];
  const walk = (n: OrgNode) => { if (n.children.length) { out.push(n.id); n.children.forEach(walk); } };
  roots.forEach(walk);
  return out;
}

function TreeView({ tree, extras, accentColor }: { tree: CompanyTree; extras: Extras; accentColor: string | null }) {
  const [collapsedIds, setCollapsed] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    const ids = new Set<number>();
    if (!q) return ids;
    const walk = (n: OrgNode) => {
      if (n.name.toLowerCase().includes(q) || (n.role ?? "").toLowerCase().includes(q)) ids.add(n.id);
      n.children.forEach(walk);
    };
    [...tree.roots, ...tree.unassigned].forEach(walk);
    return ids;
  }, [q, tree]);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(collapsibleIds(tree.roots)));
  const resetView = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const zoom = (d: number) => setScale((s) => Math.min(1.6, Math.max(0.5, +(s + d).toFixed(2))));
  const print = () => { expandAll(); setTimeout(() => window.print(), 60); };

  const toggleFullscreen = () => {
    const el = canvasRef.current?.parentElement; // the bordered stage wrapper
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // drag-to-pan
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    canvasRef.current?.classList.add("dragging");
  };
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  }, []);
  const endDrag = () => { drag.current = null; canvasRef.current?.classList.remove("dragging"); };

  if (tree.total === 0) {
    return <p className="text-sm text-fg-subtle italic py-6 text-center">No active people in this company.</p>;
  }
  const hasStructure = tree.roots.length > 0;
  const ctrlBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle/80 ring-1 ring-border text-fg-muted hover:text-fg transition-colors";

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap print-hidden">
        <div className="text-[11px] text-fg-subtle tabular">
          {tree.total} active · {tree.withManager} with a manager · {tree.total - tree.withManager} unassigned
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a person…"
              className="h-8 w-40 rounded-full bg-bg-subtle/70 ring-1 ring-border pl-7 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-accent/40"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" aria-label="Clear search"><X size={12} /></button>
            )}
          </div>
          {hasStructure && (
            <>
              <button type="button" onClick={collapseAll} title="Collapse all" className={ctrlBtn}><FoldVertical size={14} /></button>
              <button type="button" onClick={expandAll} title="Expand all" className={ctrlBtn}><Expand size={14} /></button>
              <span className="w-px h-5 bg-border mx-0.5" />
              <button type="button" onClick={() => zoom(-0.1)} title="Zoom out" className={ctrlBtn}><ZoomOut size={14} /></button>
              <button type="button" onClick={resetView} title="Reset view" className={cn(ctrlBtn, "w-auto px-2 text-[11px] tabular")}>{Math.round(scale * 100)}%</button>
              <button type="button" onClick={() => zoom(0.1)} title="Zoom in" className={ctrlBtn}><ZoomIn size={14} /></button>
              <button type="button" onClick={toggleFullscreen} title="Fullscreen" className={ctrlBtn}><Maximize2 size={14} /></button>
            </>
          )}
          <button type="button" onClick={print} className="h-8 inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle/80 ring-1 ring-border px-2.5 text-xs text-fg-muted hover:text-fg transition-colors"><Printer size={13} /> Print</button>
        </div>
      </div>

      {q && matchIds.size === 0 && <div className="text-xs text-fg-subtle italic">No match for “{query}”.</div>}

      {hasStructure ? (
        <div className="rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 overflow-hidden">
          <div
            ref={canvasRef}
            className="org-canvas overflow-auto"
            style={{ maxHeight: "70vh" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            <div className="org-stage inline-block min-w-full p-6" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
              <ul className="org-tree mx-auto w-max">
                {tree.roots.map((n) => (
                  <Subtree key={n.id} node={n} extras={extras} accentColor={accentColor}
                    collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={!!q} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl glass elevated p-4 text-sm text-fg-muted">
          No reporting lines set yet for this company. Open a person and set their{" "}
          <span className="font-medium text-fg">Manager</span> to start building the tree.
        </div>
      )}

      {tree.unassigned.length > 0 && hasStructure && (
        <div className="pt-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle mb-2">
            <Users size={12} /> Unassigned ({tree.unassigned.length})
          </div>
          <div className="flex flex-wrap gap-2.5">
            {tree.unassigned.map((n) => (
              <NodeCard key={n.id} node={n} extras={extras[n.id]} accentColor={accentColor} collapsed={false} onToggle={() => {}} matched={matchIds.has(n.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Group overview                                                      */
/* ------------------------------------------------------------------ */

function companyLead(tree: CompanyTree): { node: OrgNode; reports: number } | null {
  if (tree.roots.length === 0) return null;
  let best = tree.roots[0];
  let bestReports = countNodes(best.children);
  for (const r of tree.roots.slice(1)) {
    const reports = countNodes(r.children);
    if (reports > bestReports) { best = r; bestReports = reports; }
  }
  return { node: best, reports: bestReports };
}

function GroupOverview({ companies, trees, onPick }: { companies: OrgChartCompany[]; trees: Record<number, CompanyTree>; onPick: (companyId: number) => void; }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {companies.map((c) => {
        const tree = trees[c.id];
        const lead = tree ? companyLead(tree) : null;
        const accent = c.accentColor || "hsl(var(--accent))";
        return (
          <button key={c.id} type="button" onClick={() => onPick(c.id)} className="group text-left rounded-2xl glass elevated p-4 hover:ring-1 hover:ring-accent/30 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                <span className="font-medium text-fg truncate">{c.name}</span>
              </div>
              <ChevronRight size={15} className="text-fg-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
            <div className="mt-2 text-[11px] text-fg-subtle tabular">
              {tree?.total ?? 0} people · {tree?.withManager ?? 0} reporting line{(tree?.withManager ?? 0) === 1 ? "" : "s"}
            </div>
            <div className="mt-1.5 text-xs text-fg-muted truncate">
              {lead
                ? <>Lead: <span className="text-fg">{lead.node.name}</span>{lead.reports > 0 && <span className="text-fg-subtle"> · {lead.reports} report{lead.reports === 1 ? "" : "s"}</span>}</>
                : <span className="italic text-fg-subtle">No reporting lines yet</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function OrgChart({
  companies, trees, extras = {}, initialCompanyId, showSwitcher = true, showGroup = true,
}: {
  companies: OrgChartCompany[];
  trees: Record<number, CompanyTree>;
  extras?: Extras;
  initialCompanyId?: number;
  showSwitcher?: boolean;
  showGroup?: boolean;
}) {
  const [view, setView] = useState<"group" | number>(
    initialCompanyId != null ? initialCompanyId : showGroup ? "group" : (companies[0]?.id ?? 0)
  );

  const options = [
    ...(showGroup ? [{ value: "group", label: "Group", icon: <LayoutGrid size={13} /> }] : []),
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const accentFor = (id: number) => companies.find((c) => c.id === id)?.accentColor ?? null;

  return (
    <div className="space-y-4">
      {showSwitcher && options.length > 1 && (
        <div className="overflow-x-auto -mx-1 px-1 no-scrollbar print-hidden">
          <Segmented value={view === "group" ? "group" : String(view)} onChange={(v) => setView(v === "group" ? "group" : Number(v))} size="sm" className="min-w-max" options={options} />
        </div>
      )}

      {view === "group" ? (
        <GroupOverview companies={companies} trees={trees} onPick={(id) => setView(id)} />
      ) : trees[view] ? (
        <TreeView key={view} tree={trees[view]} extras={extras} accentColor={accentFor(view)} />
      ) : (
        <p className="text-sm text-fg-subtle italic py-6 text-center">Select a company.</p>
      )}
    </div>
  );
}
