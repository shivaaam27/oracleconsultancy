"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Users, ChevronRight, ChevronDown, Search, Printer, X,
  ZoomIn, ZoomOut, Maximize2, Expand, FoldVertical,
  MessageCircle, UserRound, Send, Laptop, ShieldCheck, Plane, Sparkles, AlertTriangle, Share2, Link2, CornerLeftUp, Network,
} from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
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

export type OrgChartCompany = { id: number; name: string; accentColor: string | null };
export type AssociatedPerson = { id: number; name: string; role: string | null; relationship: string | null; personType: string };

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
                <div className={cn("h-full rounded-full", x.complianceStatus === "Risk" ? "bg-danger" : x.complianceStatus === "Watch" ? "bg-warn" : "bg-success")} style={{ width: `${x.compliancePct}%` }} />
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
          <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-bg-muted/70 text-fg-muted hover:text-success transition-colors"><MessageCircle size={13} /></a>
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
  node, extras, accentColor, collapsed, onToggle, matched, onHoverShow, onHoverHide, showCompany,
}: {
  node: OrgNode;
  extras?: OrgPersonExtras;
  accentColor: string | null;
  collapsed: boolean;
  onToggle: () => void;
  matched: boolean;
  onHoverShow?: (node: OrgNode, el: HTMLElement) => void;
  onHoverHide?: () => void;
  showCompany?: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const accent = node.companyAccent || accentColor || "hsl(var(--accent))";
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
          {showCompany && node.companyName && (
            <div className="text-[10px] font-medium truncate leading-tight" style={{ color: accent }}>{node.companyName}</div>
          )}
          {node.reportsOutOfCompany && node.managerName && (
            <div className="flex items-center gap-1 text-[10px] text-fg-subtle truncate leading-tight" title={`Reports to ${node.managerName}${node.managerCompanyName ? ` at ${node.managerCompanyName}` : ""}`}>
              <CornerLeftUp size={10} className="shrink-0" />
              <span className="truncate">{node.managerName}{node.managerCompanyName ? ` · ${node.managerCompanyName}` : ""}</span>
            </div>
          )}
          {node.secondaryManagers.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-info/80 truncate leading-tight" title={`Also reports to ${node.secondaryManagers.map((m) => m.name).filter(Boolean).join(", ")}`}>
              <Link2 size={10} className="shrink-0" />
              <span className="truncate">also: {node.secondaryManagers.map((m) => m.name).filter(Boolean).join(", ")}</span>
            </div>
          )}
        </div>

        {/* compact signal cluster */}
        <div className="flex items-center gap-1 shrink-0">
          {x?.overdue ? (
            <span title={`${x.overdue} overdue`} className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger-soft text-danger text-[10px] font-bold tabular">{x.overdue}</span>
          ) : x?.open ? (
            <span title={`${x.open} open`} className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-info-soft text-info text-[10px] font-bold tabular">{x.open}</span>
          ) : null}
          {x?.compliancePct != null && (
            <span title={`Compliance ${x.compliancePct}%`} className={cn("w-2 h-2 rounded-full", x.complianceStatus === "Risk" ? "bg-danger" : x.complianceStatus === "Watch" ? "bg-warn" : "bg-success")} />
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
  node, extras, accentColor, collapsedIds, toggle, matchIds, forceExpand, onHoverShow, onHoverHide, showCompany,
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
  showCompany?: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = !forceExpand && collapsedIds.has(node.id);
  const showChildren = hasChildren && !collapsed;
  return (
    <li>
      <NodeCard node={node} extras={extras[node.id]} accentColor={accentColor}
        collapsed={collapsed} onToggle={() => toggle(node.id)} matched={matchIds.has(node.id)}
        onHoverShow={onHoverShow} onHoverHide={onHoverHide} showCompany={showCompany} />
      {showChildren && (
        <ul>
          {node.children.map((c) => (
            <Subtree key={c.id} node={c} extras={extras} accentColor={accentColor}
              collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={forceExpand}
              onHoverShow={onHoverShow} onHoverHide={onHoverHide} showCompany={showCompany} />
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

function TreeView({ tree, extras, accentColor, companyName, associated = [], portfolio = false }: { tree: CompanyTree; extras: Extras; accentColor: string | null; companyName: string | null; associated?: AssociatedPerson[]; portfolio?: boolean }) {
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
    // Touch devices have no hover; a tap on the name opens the drawer instead.
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) return;
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

  // Item 4: group the roster by department (visual boxes; no schema head yet).
  const deptGroups = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    for (const n of tree.unassigned) {
      const key = n.departmentName || "No department";
      (map.get(key) ?? map.set(key, []).get(key)!).push(n);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tree.unassigned]);

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
    // On touch, let the native scroll container handle panning (smoother, momentum).
    if (e.pointerType !== "mouse") return;
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print-hidden">
        <div className="text-[11px] text-fg-subtle tabular">
          {tree.total} active · {tree.linesInTree} in tree
          {tree.reportingOut > 0 && <> · {tree.reportingOut} report out</>}
          {tree.total - tree.withManager > 0 && <> · {tree.total - tree.withManager} no director</>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative flex-1 min-w-[9rem] sm:flex-none">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person…"
              className="h-8 w-full sm:w-40 rounded-full bg-bg-subtle/70 ring-1 ring-border pl-7 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-accent/40" />
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

      {hasStructure && (
        <div className="rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 overflow-hidden">
          <div ref={canvasRef} className="org-canvas overflow-auto" style={{ maxHeight: "72vh" }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
            <div className="org-stage inline-block min-w-full p-8" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
              <ul className="org-tree mx-auto w-max">
                {tree.roots.map((n) => (
                  <Subtree key={n.id} node={n} extras={extras} accentColor={accentColor}
                    collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={!!q}
                    onHoverShow={showHover} onHoverHide={hideHover} showCompany={portfolio} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!hasStructure && (
        <div className="rounded-xl bg-bg-subtle/40 ring-1 ring-border/60 p-3 text-[11px] text-fg-muted leading-snug">
          No in-company reporting lines yet — everyone is shown below. Set a person&apos;s{" "}
          <span className="font-medium text-fg">Director</span> to someone in this company to nest them into a tree.
          {tree.reportingOut > 0 && <> {tree.reportingOut} {tree.reportingOut === 1 ? "person reports" : "people report"} to a director in another company (shown on their card).</>}
        </div>
      )}

      {tree.unassigned.length > 0 && (
        <div className="pt-1 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
            <Users size={12} /> {hasStructure ? `Unassigned (${tree.unassigned.length})` : `People (${tree.unassigned.length})`}
          </div>
          {deptGroups.length > 1 ? (
            deptGroups.map(([dept, members]) => (
              <div key={dept}>
                <div className="flex items-center gap-1.5 text-[11px] text-fg-muted mb-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dept === "No department" ? "hsl(var(--border-strong))" : `hsl(${deptHue(dept)} 65% 55%)` }} />
                  <span className="font-medium">{dept}</span>
                  <span className="text-fg-subtle tabular">· {members.length}</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {members.map((n) => (
                    <NodeCard key={n.id} node={n} extras={extras[n.id]} accentColor={accentColor} collapsed={false} onToggle={() => {}} matched={matchIds.has(n.id)}
                      onHoverShow={showHover} onHoverHide={hideHover} showCompany={portfolio} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {tree.unassigned.map((n) => (
                <NodeCard key={n.id} node={n} extras={extras[n.id]} accentColor={accentColor} collapsed={false} onToggle={() => {}} matched={matchIds.has(n.id)}
                  onHoverShow={showHover} onHoverHide={hideHover} showCompany={portfolio} />
              ))}
            </div>
          )}
        </div>
      )}

      {associated.length > 0 && (
        <div className="pt-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle mb-2">
            <Link2 size={12} /> External &amp; associated ({associated.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {associated.map((a) => (
              <div key={a.id} className="inline-flex items-center gap-2 rounded-xl glass elevated pl-1 pr-3 py-1.5">
                <span className={cn("h-8 w-8 rounded-full ring-1 flex items-center justify-center text-[11px] font-semibold shrink-0", TYPE_TINT[a.personType] ?? TYPE_TINT.outsider)}>
                  {initials(a.name)}
                </span>
                <div className="min-w-0">
                  <PersonDrawerLink id={a.id} name={a.name} className="block text-[13px] font-medium text-fg hover:text-accent truncate leading-tight" />
                  <div className="text-[10.5px] text-fg-subtle truncate leading-tight">{a.relationship || a.role || "Associated"}</div>
                </div>
              </div>
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
/* Switcher — responsive, touch-friendly tab bar                       */
/* ------------------------------------------------------------------ */

function OrgSwitcher({
  view, setView, companies, everyoneOn, portfolioOn,
}: {
  view: "everyone" | "portfolio" | number;
  setView: (v: "everyone" | "portfolio" | number) => void;
  companies: OrgChartCompany[];
  everyoneOn: boolean;
  portfolioOn: boolean;
}) {
  const chip = "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition-all active:scale-95";
  return (
    <div className="-mx-1 px-1 overflow-x-auto no-scrollbar print-hidden">
      <div className="flex items-center gap-1.5 w-max snap-x snap-mandatory">
        {everyoneOn && (
          <button
            type="button"
            onClick={() => setView("everyone")}
            className={cn(chip, view === "everyone" ? "bg-accent text-accent-fg ring-accent shadow-sm" : "bg-bg-elev/60 text-fg-muted ring-border hover:text-fg")}
          >
            <Share2 size={13} /> Everyone
          </button>
        )}
        {portfolioOn && (
          <button
            type="button"
            onClick={() => setView("portfolio")}
            className={cn(chip, view === "portfolio" ? "bg-accent text-accent-fg ring-accent shadow-sm" : "bg-bg-elev/60 text-fg-muted ring-border hover:text-fg")}
          >
            <Network size={13} /> Portfolio
          </button>
        )}
        {companies.map((c) => {
          const active = view === c.id;
          const accent = c.accentColor || "hsl(var(--accent))";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setView(c.id)}
              style={active ? { backgroundColor: accent, color: "#fff", borderColor: accent } : undefined}
              className={cn(chip, active ? "shadow-sm ring-transparent" : "bg-bg-elev/60 text-fg-muted ring-border hover:text-fg")}
            >
              {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />}
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function OrgChart({
  companies, trees, portfolioTree, extras = {}, webPeople, associatedByCompany = {}, initialCompanyId, showSwitcher = true, showEveryone = true,
}: {
  companies: OrgChartCompany[];
  trees: Record<number, CompanyTree>;
  portfolioTree?: CompanyTree;
  extras?: Extras;
  webPeople?: WebPerson[];
  associatedByCompany?: Record<number, AssociatedPerson[]>;
  initialCompanyId?: number;
  showSwitcher?: boolean;
  showEveryone?: boolean;
}) {
  const everyoneOn = showEveryone && !!webPeople;
  const portfolioOn = showEveryone && !!portfolioTree;
  const [view, setView] = useState<"everyone" | "portfolio" | number>(
    initialCompanyId != null ? initialCompanyId : everyoneOn ? "everyone" : (companies[0]?.id ?? 0)
  );

  const showBar = everyoneOn || portfolioOn || companies.length > 1;
  const companyName = (id: number) => companies.find((c) => c.id === id)?.name ?? null;
  const accentFor = (id: number) => companies.find((c) => c.id === id)?.accentColor ?? null;

  return (
    <div className="space-y-4">
      {showSwitcher && showBar && (
        <OrgSwitcher view={view} setView={setView} companies={companies} everyoneOn={everyoneOn} portfolioOn={portfolioOn} />
      )}

      {view === "everyone" && webPeople ? (
        <OrgWeb people={webPeople} companies={companies} extras={extras} onPickCompany={(id) => setView(id)} />
      ) : view === "portfolio" && portfolioTree ? (
        <TreeView key="portfolio" tree={portfolioTree} extras={extras} accentColor={null} companyName={null} portfolio />
      ) : typeof view === "number" && trees[view] ? (
        <TreeView key={view} tree={trees[view]} extras={extras} accentColor={accentFor(view)} companyName={companyName(view)} associated={associatedByCompany[view] ?? []} />
      ) : (
        <p className="text-sm text-fg-subtle italic py-6 text-center">Select a company.</p>
      )}
    </div>
  );
}
