"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Users, ChevronRight, ChevronDown, Search, Printer, X,
  ZoomIn, ZoomOut, Maximize2, Expand, FoldVertical,
  MessageCircle, UserRound, Send, Laptop, ShieldCheck, Plane, Sparkles, AlertTriangle, Share2,
} from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { Segmented } from "@/components/macos";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PERSON_TYPE_LABELS } from "@/lib/person-types";
import { countNodes, type CompanyTree, type OrgNode } from "@/lib/org-chart";
import type { OrgPersonExtras } from "@/lib/org-extras";
import { OrgWeb, type WebPerson } from "@/components/org-web";

export type Extras = Record<number, OrgPersonExtras>;

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

function complianceTone(s: OrgPersonExtras["complianceStatus"]): "success" | "warn" | "danger" {
  return s === "Risk" ? "danger" : s === "Watch" ? "warn" : "success";
}

export type OrgChartCompany = { id: number; name: string; accentColor: string | null };

/* ------------------------------------------------------------------ */
/* Hover detail popover — the "peek" with full signals + actions       */
/* ------------------------------------------------------------------ */

function HoverDetail({
  node, extras, companyName, style, onMouseEnter, onMouseLeave,
}: {
  node: OrgNode;
  extras?: OrgPersonExtras;
  companyName?: string | null;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const x = extras;
  const wa = waLink(node);
  return (
    <div
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="org-pop fixed z-[80] w-64 -translate-x-1/2 rounded-2xl glass glass-menu elevated p-3 text-left print-hidden"
    >
      <div className="text-sm font-semibold text-fg leading-snug">{node.name}</div>
      <div className="text-[11px] text-fg-muted">
        {node.role || PERSON_TYPE_LABELS[node.personType]}
        {node.departmentName ? ` · ${node.departmentName}` : ""}
        {companyName ? ` · ${companyName}` : ""}
      </div>

      {x && (
        <>
          {x.compliancePct != null && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-fg-subtle mb-1">
                <span className="inline-flex items-center gap-1"><ShieldCheck size={11} /> Document compliance</span>
                <span className="tabular font-medium text-fg">{x.compliancePct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full", x.complianceStatus === "Risk" ? "bg-danger" : x.complianceStatus === "Watch" ? "bg-warn" : "bg-ok")} style={{ width: `${x.compliancePct}%` }} />
              </div>
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-1">
            {x.open > 0 && <Badge tone="info">{x.open} open</Badge>}
            {x.overdue > 0 && <Badge tone="danger">{x.overdue} overdue</Badge>}
            {x.notStarted > 0 && <Badge tone="default">{x.notStarted} not started</Badge>}
            {x.closed > 0 && <Badge tone="success">{x.closed} closed</Badge>}
            {x.open === 0 && x.closed === 0 && x.notStarted === 0 && <span className="text-[11px] text-fg-subtle italic">No tasks</span>}
          </div>

          {(x.assetsHeld > 0 || x.onLeaveToday || x.onboarding) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {x.assetsHeld > 0 && <Badge tone="default"><Laptop size={10} /> {x.assetsHeld} asset{x.assetsHeld === 1 ? "" : "s"}</Badge>}
              {x.onLeaveToday && <Badge tone="warn"><Plane size={10} /> On leave</Badge>}
              {x.onboarding && <Badge tone="info"><Sparkles size={10} /> Onboarding</Badge>}
            </div>
          )}

          {x.topTask && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-fg-muted">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warn" />
              <span className="leading-snug"><span className="font-medium text-fg">{x.topTask.code}</span> · {x.topTask.title}</span>
            </div>
          )}
        </>
      )}

      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/50 pt-2">
        <PersonDrawerLink id={node.id} name={node.name} title="Open profile" className="flex-1 h-7 inline-flex items-center justify-center gap-1 rounded-lg bg-accent text-accent-fg text-[11px] font-medium hover:bg-accent-hover transition-colors">
          <UserRound size={12} /> Profile
        </PersonDrawerLink>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-bg-muted/70 text-fg-muted hover:text-ok transition-colors"><MessageCircle size={13} /></a>
        )}
        <a href={`/outbox?person=${node.id}`} title="Outbox" className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-bg-muted/70 text-fg-muted hover:text-accent transition-colors"><Send size={13} /></a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact card                                                        */
/* ------------------------------------------------------------------ */

function NodeCard({
  node, extras, accentColor, collapsed, onToggle, matched, onHoverShow, onHoverHide,
}: {
  node: OrgNode;
  extras?: OrgPersonExtras;
  accentColor: string | null;
  collapsed: boolean;
  onToggle: () => void;
  matched: boolean;
  onHoverShow?: (node: OrgNode, el: HTMLElement) => void;
  onHoverHide?: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const accent = accentColor || "hsl(var(--accent))";
  const dept = node.departmentName;
  const x = extras;

  return (
    <div className={cn("org-card group relative", matched && "z-10")}>
      <div
        onMouseEnter={(e) => onHoverShow?.(node, e.currentTarget)}
        onMouseLeave={onHoverHide}
        className={cn(
          "relative flex items-center gap-2.5 rounded-xl glass elevated pl-1 pr-2.5 py-1.5 w-[14rem] transition-all hover:-translate-y-0.5 hover:shadow-lg hover:ring-1 hover:ring-accent/30",
          matched && "ring-2 ring-accent"
        )}
      >
        {/* company accent rail */}
        <span className="self-stretch w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} aria-hidden />

        <span className={cn("h-9 w-9 rounded-full ring-1 flex items-center justify-center text-[12px] font-semibold shrink-0", TYPE_TINT[node.personType] ?? TYPE_TINT.outsider)}>
          {initials(node.name)}
        </span>

        <div className="min-w-0 flex-1">
          <PersonDrawerLink id={node.id} name={node.name} className="block text-[13px] font-semibold text-fg hover:text-accent truncate leading-tight" />
          <div className="flex items-center gap-1 text-[10.5px] text-fg-muted truncate leading-tight">
            {dept && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: `hsl(${deptHue(dept)} 65% 55%)` }} />}
            <span className="truncate">{node.role || PERSON_TYPE_LABELS[node.personType]}</span>
          </div>
        </div>

        {/* compact signal cluster */}
        <div className="flex items-center gap-1 shrink-0">
          {x?.overdue ? (
            <span title={`${x.overdue} overdue`} className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger-soft text-danger text-[10px] font-bold tabular">{x.overdue}</span>
          ) : x?.open ? (
            <span title={`${x.open} open`} className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-info-soft text-info text-[10px] font-bold tabular">{x.open}</span>
          ) : null}
          {x?.compliancePct != null && (
            <span title={`Compliance ${x.compliancePct}%`} className={cn("w-2 h-2 rounded-full", x.complianceStatus === "Risk" ? "bg-danger" : x.complianceStatus === "Watch" ? "bg-warn" : "bg-ok")} />
          )}
          {x?.onLeaveToday && <Plane size={11} className="text-warn" />}
        </div>

        {hasChildren && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand reports" : "Collapse reports"}
            className="shrink-0 h-5 w-5 -mr-1 rounded-full flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-bg-muted/70 transition-colors print-hidden"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {hasChildren && collapsed && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-fg-subtle bg-bg-elev rounded-full px-1.5 ring-1 ring-border tabular print-hidden">
            {countNodes(node.children)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recursive tree                                                      */
/* ------------------------------------------------------------------ */

function Subtree({
  node, extras, accentColor, collapsedIds, toggle, matchIds, forceExpand, onHoverShow, onHoverHide,
}: {
  node: OrgNode;
  extras: Extras;
  accentColor: string | null;
  collapsedIds: Set<number>;
  toggle: (id: number) => void;
  matchIds: Set<number>;
  forceExpand: boolean;
  onHoverShow: (node: OrgNode, el: HTMLElement) => void;
  onHoverHide: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = !forceExpand && collapsedIds.has(node.id);
  const showChildren = hasChildren && !collapsed;
  return (
    <li>
      <NodeCard node={node} extras={extras[node.id]} accentColor={accentColor}
        collapsed={collapsed} onToggle={() => toggle(node.id)} matched={matchIds.has(node.id)}
        onHoverShow={onHoverShow} onHoverHide={onHoverHide} />
      {showChildren && (
        <ul>
          {node.children.map((c) => (
            <Subtree key={c.id} node={c} extras={extras} accentColor={accentColor}
              collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={forceExpand}
              onHoverShow={onHoverShow} onHoverHide={onHoverHide} />
          ))}
        </ul>
      )}
    </li>
  );
}

function collapsibleIds(roots: OrgNode[]): number[] {
  const out: number[] = [];
  const walk = (n: OrgNode) => { if (n.children.length) { out.push(n.id); n.children.forEach(walk); } };
  roots.forEach(walk);
  return out;
}

function TreeView({ tree, extras, accentColor, companyName }: { tree: CompanyTree; extras: Extras; accentColor: string | null; companyName: string | null }) {
  const [collapsedIds, setCollapsed] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Single fixed-position hovercard (escapes the canvas overflow clip).
  const [hovered, setHovered] = useState<{ node: OrgNode; left: number; top: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHover = (node: OrgNode, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const r = el.getBoundingClientRect();
    const half = 132; // ~half popover width; keep it on-screen
    const left = Math.min(window.innerWidth - half - 8, Math.max(half + 8, r.left + r.width / 2));
    // Flip above the card if there isn't room below.
    const below = r.bottom + 8;
    const top = below + 230 > window.innerHeight ? Math.max(8, r.top - 8 - 230) : below;
    setHovered({ node, left, top });
  };
  const hideHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(null), 140);
  };

  const toggle = (id: number) =>
    setCollapsed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

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
    const el = canvasRef.current?.parentElement;
    if (!document.fullscreenElement) el?.requestFullscreen?.(); else document.exitFullscreen?.();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,.org-card")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    canvasRef.current?.classList.add("dragging");
  };
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  }, []);
  const endDrag = () => { drag.current = null; canvasRef.current?.classList.remove("dragging"); };

  if (tree.total === 0) return <p className="text-sm text-fg-subtle italic py-6 text-center">No active people in this company.</p>;
  const hasStructure = tree.roots.length > 0;
  const ctrlBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle/80 ring-1 ring-border text-fg-muted hover:text-fg transition-colors";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap print-hidden">
        <div className="text-[11px] text-fg-subtle tabular">
          {tree.total} active · {tree.withManager} with a manager · {tree.total - tree.withManager} unassigned
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person…"
              className="h-8 w-40 rounded-full bg-bg-subtle/70 ring-1 ring-border pl-7 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-accent/40" />
            {query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" aria-label="Clear search"><X size={12} /></button>}
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
          <div ref={canvasRef} className="org-canvas overflow-auto" style={{ maxHeight: "72vh" }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
            <div className="org-stage inline-block min-w-full p-8" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
              <ul className="org-tree mx-auto w-max">
                {tree.roots.map((n) => (
                  <Subtree key={n.id} node={n} extras={extras} accentColor={accentColor}
                    collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={!!q}
                    onHoverShow={showHover} onHoverHide={hideHover} />
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
              <NodeCard key={n.id} node={n} extras={extras[n.id]} accentColor={accentColor} collapsed={false} onToggle={() => {}} matched={matchIds.has(n.id)}
                onHoverShow={showHover} onHoverHide={hideHover} />
            ))}
          </div>
        </div>
      )}

      {hovered && (
        <HoverDetail
          node={hovered.node}
          extras={extras[hovered.node.id]}
          companyName={companyName}
          style={{ left: hovered.left, top: hovered.top }}
          onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}
          onMouseLeave={hideHover}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function OrgChart({
  companies, trees, extras = {}, webPeople, initialCompanyId, showSwitcher = true, showEveryone = true,
}: {
  companies: OrgChartCompany[];
  trees: Record<number, CompanyTree>;
  extras?: Extras;
  webPeople?: WebPerson[];
  initialCompanyId?: number;
  showSwitcher?: boolean;
  showEveryone?: boolean;
}) {
  const everyoneOn = showEveryone && !!webPeople;
  const [view, setView] = useState<"everyone" | number>(
    initialCompanyId != null ? initialCompanyId : everyoneOn ? "everyone" : (companies[0]?.id ?? 0)
  );

  const options = [
    ...(everyoneOn ? [{ value: "everyone", label: "Everyone", icon: <Share2 size={13} /> }] : []),
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const companyName = (id: number) => companies.find((c) => c.id === id)?.name ?? null;
  const accentFor = (id: number) => companies.find((c) => c.id === id)?.accentColor ?? null;

  return (
    <div className="space-y-4">
      {showSwitcher && options.length > 1 && (
        <div className="overflow-x-auto -mx-1 px-1 no-scrollbar print-hidden">
          <Segmented value={view === "everyone" ? "everyone" : String(view)} onChange={(v) => setView(v === "everyone" ? "everyone" : Number(v))} size="sm" className="min-w-max" options={options} />
        </div>
      )}

      {view === "everyone" && webPeople ? (
        <OrgWeb people={webPeople} companies={companies} extras={extras} onPickCompany={(id) => setView(id)} />
      ) : typeof view === "number" && trees[view] ? (
        <TreeView key={view} tree={trees[view]} extras={extras} accentColor={accentFor(view)} companyName={companyName(view)} />
      ) : (
        <p className="text-sm text-fg-subtle italic py-6 text-center">Select a company.</p>
      )}
    </div>
  );
}
