"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDepartmentHead } from "@/app/hrms/org/actions";
import {
  Users, ChevronRight, ChevronDown, Search, Printer, X,
  ZoomIn, ZoomOut, Maximize2, FoldVertical,
  MessageCircle, UserRound, Send, Laptop, ShieldCheck, Plane, Sparkles, AlertTriangle, Share2, Link2, CornerLeftUp, Network,
  Focus, Scaling, List, GitBranch, Building2, Minimize2, UnfoldVertical,
} from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PERSON_TYPE_LABELS } from "@/lib/person-types";
import { countNodes, type CompanyTree, type OrgNode } from "@/lib/org-chart";
import type { OrgPersonExtras } from "@/lib/org-extras";
import { OrgWeb, type WebPerson } from "@/components/org-web";
import { OrgDirectorPicker, type PickPerson } from "@/components/org-director-picker";

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
      className="org-pop fixed z-[80] w-64 -translate-x-1/2 rounded-2xl p-3 text-left print-hidden"
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
  node, extras, accentColor, collapsed, onToggle, matched, onHoverShow, onHoverHide, showCompany, onFocus,
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
  onFocus?: () => void;
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

        {onFocus && hasChildren && (
          <button
            type="button"
            onClick={onFocus}
            aria-label="Focus on this team"
            title="Focus on this team"
            className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-fg-subtle hover:text-accent hover:bg-bg-muted/70 transition-colors print-hidden"
          >
            <Focus size={12} />
          </button>
        )}
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
  node, extras, accentColor, collapsedIds, toggle, matchIds, forceExpand, onHoverShow, onHoverHide, showCompany, onFocus,
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
  onFocus?: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = !forceExpand && collapsedIds.has(node.id);
  const showChildren = hasChildren && !collapsed;
  return (
    <li>
      <NodeCard node={node} extras={extras[node.id]} accentColor={accentColor}
        collapsed={collapsed} onToggle={() => toggle(node.id)} matched={matchIds.has(node.id)}
        onHoverShow={onHoverShow} onHoverHide={onHoverHide} showCompany={showCompany}
        onFocus={onFocus ? () => onFocus(node.id) : undefined} />
      {showChildren && (
        <ul className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          {node.children.map((c) => (
            <Subtree key={c.id} node={c} extras={extras} accentColor={accentColor}
              collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={forceExpand}
              onHoverShow={onHoverShow} onHoverHide={onHoverHide} showCompany={showCompany} onFocus={onFocus} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* Compact vertical outline (zero horizontal scroll — great on mobile). */
function OutlineRow({
  node, depth, collapsedIds, toggle, onFocus, matchIds, showCompany, extras, pickerPeople,
}: {
  node: OrgNode; depth: number; collapsedIds: Set<number>; toggle: (id: number) => void;
  onFocus: (id: number) => void; matchIds: Set<number>; showCompany?: boolean; extras: Extras; pickerPeople?: PickPerson[];
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const x = extras[node.id];
  return (
    <>
      <div className={cn("flex items-center gap-2 py-1.5 pr-2 rounded-lg transition-colors hover:bg-bg-muted/40", matchIds.has(node.id) && "bg-accent/10 ring-1 ring-accent/30")} style={{ paddingLeft: depth * 18 + 4 }}>
        {hasChildren ? (
          <button type="button" onClick={() => toggle(node.id)} aria-label={collapsed ? "Expand" : "Collapse"} className="shrink-0 h-5 w-5 rounded flex items-center justify-center text-fg-subtle hover:text-fg">
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : <span className="w-5 shrink-0 inline-flex items-center justify-center"><span className="w-1 h-1 rounded-full bg-border" /></span>}
        <span className={cn("h-6 w-6 rounded-full ring-1 flex items-center justify-center text-[10px] font-semibold shrink-0", TYPE_TINT[node.personType] ?? TYPE_TINT.outsider)}>{initials(node.name)}</span>
        <PersonDrawerLink id={node.id} name={node.name} className="text-[13px] font-medium text-fg hover:text-accent truncate" />
        <span className="text-[11px] text-fg-subtle truncate hidden sm:inline">{node.role || PERSON_TYPE_LABELS[node.personType]}{showCompany && node.companyName ? ` · ${node.companyName}` : ""}</span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {x?.overdue ? <span className="text-[10px] font-bold text-danger tabular">{x.overdue}!</span> : x?.open ? <span className="text-[10px] font-bold text-info tabular">{x.open}</span> : null}
          {hasChildren && <span className="text-[10px] text-fg-subtle tabular" title={`${countNodes(node.children)} in team`}>{countNodes(node.children)}</span>}
          {hasChildren && <button type="button" onClick={() => onFocus(node.id)} title="Focus on this team" className="text-fg-subtle hover:text-accent print-hidden"><Focus size={12} /></button>}
          {pickerPeople && <OrgDirectorPicker personId={node.id} currentManagerId={node.managerId} people={pickerPeople} compact missing={node.managerId == null} />}
        </span>
      </div>
      {hasChildren && !collapsed && node.children.map((c) => (
        <OutlineRow key={c.id} node={c} depth={depth + 1} collapsedIds={collapsedIds} toggle={toggle} onFocus={onFocus} matchIds={matchIds} showCompany={showCompany} extras={extras} pickerPeople={pickerPeople} />
      ))}
    </>
  );
}

function collapsibleIds(roots: OrgNode[]): number[] {
  const out: number[] = [];
  const walk = (n: OrgNode) => { if (n.children.length) { out.push(n.id); n.children.forEach(walk); } };
  roots.forEach(walk);
  return out;
}

/** For big trees, start with only the top two levels open so the initial view
 *  is compact and readable — drill/expand reveals the rest (no wide scroll). */
function initialCollapsed(tree: CompanyTree): Set<number> {
  if (tree.total <= 14) return new Set();
  const rootIds = new Set(tree.roots.map((r) => r.id));
  return new Set(collapsibleIds(tree.roots).filter((id) => !rootIds.has(id)));
}

/* Print-only: the full hierarchy as a clean indented roster (paginates well,
   shows every person + role/department/company — unlike the scaled chart). */
function PrintRows({ nodes, depth }: { nodes: OrgNode[]; depth: number }) {
  return (
    <>
      {nodes.map((n) => {
        const meta = [n.role, n.departmentName, n.companyName].filter(Boolean).join(" · ");
        return (
          <div key={n.id}>
            <div className="opr" style={{ paddingLeft: depth * 16 }}>
              <span className="opn">{n.name}</span>{meta && <span className="opm"> — {meta}</span>}
            </div>
            {n.children.length > 0 && <PrintRows nodes={n.children} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

function TreeView({ tree, extras, accentColor, companyName, associated = [], portfolio = false, companyId, deptHeads = {}, pickerPeople }: { tree: CompanyTree; extras: Extras; accentColor: string | null; companyName: string | null; associated?: AssociatedPerson[]; portfolio?: boolean; companyId?: number; deptHeads?: Record<string, number>; pickerPeople?: PickPerson[] }) {
  const router = useRouter();
  const [, startHead] = useTransition();
  const saveHead = (departmentId: number, headPersonId: number | null) => {
    startHead(async () => { if (companyId != null) { await setDepartmentHead(companyId, departmentId, headPersonId); router.refresh(); } });
  };
  const [collapsedIds, setCollapsed] = useState<Set<number>>(() => initialCollapsed(tree));
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLUListElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [mode, setMode] = useState<"chart" | "list" | "depts">("chart");

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

  // By-department lens: group EVERYONE (tree + roster) by department.
  const allDeptGroups = useMemo(() => {
    const all: OrgNode[] = [];
    const walk = (n: OrgNode) => { all.push(n); n.children.forEach(walk); };
    tree.roots.forEach(walk); tree.unassigned.forEach(walk);
    const map = new Map<string, OrgNode[]>();
    for (const n of all) { const k = n.departmentName || "No department"; (map.get(k) ?? map.set(k, []).get(k)!).push(n); }
    return [...map.entries()].sort((a, b) => (a[0] === "No department" ? 1 : b[0] === "No department" ? -1 : a[0].localeCompare(b[0])));
  }, [tree]);

  // Index nodes for drill-down focus (re-root the tree on one person).
  const { byId, parentOf } = useMemo(() => {
    const byId = new Map<number, OrgNode>();
    const parentOf = new Map<number, number | null>();
    const walk = (n: OrgNode, p: number | null) => { byId.set(n.id, n); parentOf.set(n.id, p); n.children.forEach((c) => walk(c, n.id)); };
    tree.roots.forEach((r) => walk(r, null));
    tree.unassigned.forEach((r) => walk(r, null));
    return { byId, parentOf };
  }, [tree]);

  const focusNode = focusId != null ? byId.get(focusId) ?? null : null;
  const ancestors = useMemo(() => {
    if (focusId == null) return [] as OrgNode[];
    const chain: OrgNode[] = [];
    let cur = parentOf.get(focusId) ?? null;
    while (cur != null) { const n = byId.get(cur); if (n) chain.unshift(n); cur = parentOf.get(cur) ?? null; }
    return chain;
  }, [focusId, parentOf, byId]);
  const rootsToRender = focusNode ? [focusNode] : tree.roots;

  const fit = useCallback(() => {
    const ul = stageRef.current, box = canvasRef.current;
    if (!ul || !box) return;
    const cw = box.clientWidth, ch = box.clientHeight;
    // Stage padding (p-8 = 32px each side) is part of the scaled box.
    const uw = ul.offsetWidth + 64, uh = ul.offsetHeight + 64;
    if (!uw || !uh) return;
    const s = Math.min(1.6, Math.max(0.2, +Math.min((cw - 24) / uw, (ch - 24) / uh, 1).toFixed(2)));
    setScale(s);
    // Centre the scaled tree in the viewport (transform-origin is top-left, so
    // translate it to the middle). Reset native scroll first.
    box.scrollLeft = 0; box.scrollTop = 0;
    setPan({ x: Math.max(8, (cw - uw * s) / 2), y: Math.max(8, (ch - uh * s) / 2) });
  }, []);
  // On drill in/out, keep it readable at 100% and scroll back to the focused
  // root at the top-left (Fit is a manual button — auto-shrinking a wide
  // fan-out to a sliver is worse than scrolling; Outline mode is the real
  // no-scroll answer for very wide teams).
  useEffect(() => {
    const r = requestAnimationFrame(() => { setScale(1); setPan({ x: 0, y: 0 }); if (canvasRef.current) { canvasRef.current.scrollLeft = 0; canvasRef.current.scrollTop = 0; } });
    return () => cancelAnimationFrame(r);
  }, [focusId]);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(collapsibleIds(rootsToRender)));
  const allExpanded = collapsedIds.size === 0;
  const toggleAll = () => (allExpanded ? collapseAll() : expandAll());
  const resetView = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const zoom = (d: number) => setScale((s) => Math.min(1.6, Math.max(0.5, +(s + d).toFixed(2))));
  const print = () => window.print();
  const toggleFullscreen = () => setIsFs((v) => !v);

  // Fullscreen = a CSS fill-the-viewport overlay (reliable everywhere, incl.
  // iframes where the native Fullscreen API is blocked). Centre the tree on
  // enter, lock body scroll, and exit on Esc.
  useEffect(() => {
    if (!isFs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFs(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const r = requestAnimationFrame(() => requestAnimationFrame(() => fit()));
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; cancelAnimationFrame(r); };
  }, [isFs, fit]);

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
    <div ref={rootRef} className={cn("space-y-3 org-root", isFs && "fixed inset-0 z-[90] bg-bg p-4 sm:p-5 overflow-auto")}>
      {/* Print-only header (company / portfolio + date). */}
      <div className="org-print-title print-only">
        <div className="opt">{companyName ?? "Portfolio"} — Organogram</div>
        <div className="osub">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {tree.total} people · {tree.linesInTree} reporting lines</div>
      </div>
      {/* Print-only roster — the complete, paginating org listing. */}
      <div className="org-print-roster print-only">
        <PrintRows nodes={tree.roots} depth={0} />
        {tree.unassigned.length > 0 && (
          <>
            <div className="ops">Not in a reporting line</div>
            <PrintRows nodes={tree.unassigned} depth={0} />
          </>
        )}
      </div>
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
          <div className="inline-flex rounded-lg ring-1 ring-border overflow-hidden">
            {hasStructure && <button type="button" onClick={() => setMode("chart")} title="Chart view" className={cn("h-8 w-8 inline-flex items-center justify-center transition-colors", mode === "chart" ? "bg-accent text-accent-fg" : "bg-bg-subtle/80 text-fg-muted hover:text-fg")}><GitBranch size={14} /></button>}
            {hasStructure && <button type="button" onClick={() => setMode("list")} title="Outline view" className={cn("h-8 w-8 inline-flex items-center justify-center transition-colors", mode === "list" ? "bg-accent text-accent-fg" : "bg-bg-subtle/80 text-fg-muted hover:text-fg")}><List size={14} /></button>}
            <button type="button" onClick={() => setMode("depts")} title="By department" className={cn("h-8 w-8 inline-flex items-center justify-center transition-colors", mode === "depts" ? "bg-accent text-accent-fg" : "bg-bg-subtle/80 text-fg-muted hover:text-fg")}><Building2 size={14} /></button>
          </div>
          {hasStructure && mode !== "depts" && (
            <>
              <button type="button" onClick={toggleAll} title={allExpanded ? "Collapse all" : "Expand all"} className={ctrlBtn}>{allExpanded ? <FoldVertical size={14} /> : <UnfoldVertical size={14} />}</button>
              {mode === "chart" && (
                <>
                  <span className="w-px h-5 bg-border mx-0.5" />
                  <button type="button" onClick={() => zoom(-0.1)} title="Zoom out" className={ctrlBtn}><ZoomOut size={14} /></button>
                  <button type="button" onClick={resetView} title="Reset view" className={cn(ctrlBtn, "w-auto px-2 text-[11px] tabular")}>{Math.round(scale * 100)}%</button>
                  <button type="button" onClick={() => zoom(0.1)} title="Zoom in" className={ctrlBtn}><ZoomIn size={14} /></button>
                  <button type="button" onClick={fit} title="Fit to screen" className={ctrlBtn}><Scaling size={14} /></button>
                  <button type="button" onClick={toggleFullscreen} title={isFs ? "Exit fullscreen" : "Fullscreen"} className={cn(ctrlBtn, isFs && "bg-accent text-accent-fg ring-accent")}>{isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
                </>
              )}
            </>
          )}
          <button type="button" onClick={print} className="h-8 inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle/80 ring-1 ring-border px-2.5 text-xs text-fg-muted hover:text-fg transition-colors"><Printer size={13} /> Print</button>
        </div>
      </div>

      {q && matchIds.size === 0 && <div className="text-xs text-fg-subtle italic">No match for “{query}”.</div>}

      {mode === "depts" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allDeptGroups.map(([dept, members]) => {
            const deptId = members.find((m) => m.departmentId != null)?.departmentId ?? null;
            const headId = companyId != null && deptId != null ? deptHeads[`${companyId}:${deptId}`] ?? null : null;
            const sorted = headId ? [...members].sort((a, b) => (a.id === headId ? -1 : b.id === headId ? 1 : 0)) : members;
            const color = dept === "No department" ? "hsl(var(--border-strong))" : `hsl(${deptHue(dept)} 65% 55%)`;
            return (
              <div key={dept} className="rounded-2xl ring-1 ring-border/60 bg-bg-subtle/40 p-3 space-y-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-sm">{dept}</span>
                  <span className="text-fg-subtle text-xs tabular">· {members.length}</span>
                  {companyId != null && deptId != null && (
                    <span className="inline-flex items-center gap-1 ml-auto text-[11px] text-fg-muted print-hidden">
                      Head
                      <select value={headId ?? ""} onChange={(e) => saveHead(deptId, e.target.value ? Number(e.target.value) : null)} className="rounded-md bg-bg-subtle ring-1 ring-border px-1.5 py-0.5 text-[11px] cursor-pointer focus:outline-none focus:ring-accent/40">
                        <option value="">— none —</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {sorted.map((n) => (
                    <div key={n.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-bg-muted/40 transition-colors">
                      <span className={cn("h-7 w-7 rounded-full ring-1 flex items-center justify-center text-[10px] font-semibold shrink-0", TYPE_TINT[n.personType] ?? TYPE_TINT.outsider)}>{initials(n.name)}</span>
                      <div className="min-w-0 flex-1">
                        <PersonDrawerLink id={n.id} name={n.name} className="block text-[13px] font-medium text-fg hover:text-accent truncate leading-tight" />
                        <div className="text-[10.5px] text-fg-subtle truncate leading-tight">{n.role || PERSON_TYPE_LABELS[n.personType]}{portfolio && n.companyName ? ` · ${n.companyName}` : ""}</div>
                      </div>
                      {n.id === headId && <span className="text-[9px] font-semibold uppercase tracking-wide bg-accent text-accent-fg rounded-full px-1.5 py-0.5 shrink-0">Head</span>}
                      {pickerPeople && <OrgDirectorPicker personId={n.id} currentManagerId={n.managerId} people={pickerPeople} compact missing={n.managerId == null} />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode !== "depts" && hasStructure && (
        <>
          {focusNode && (
            <div className="flex items-center gap-1 text-xs flex-wrap print-hidden">
              <button type="button" onClick={() => setFocusId(null)} className="inline-flex items-center gap-1 rounded-full bg-bg-subtle/70 ring-1 ring-border px-2 py-0.5 text-fg-muted hover:text-fg transition-colors"><Users size={11} /> All</button>
              {ancestors.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1">
                  <ChevronRight size={12} className="text-fg-subtle" />
                  <button type="button" onClick={() => setFocusId(a.id)} className="rounded-full px-2 py-0.5 text-fg-muted hover:text-accent hover:bg-bg-muted/50 transition-colors">{a.name}</button>
                </span>
              ))}
              <ChevronRight size={12} className="text-fg-subtle" />
              <span className="rounded-full px-2 py-0.5 font-medium text-accent bg-accent-soft">{focusNode.name}</span>
            </div>
          )}

          {mode === "chart" ? (
            <div className="rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 overflow-hidden">
              <div ref={canvasRef} className="org-canvas overflow-auto" style={{ maxHeight: isFs ? "calc(100dvh - 130px)" : "72vh" }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
                <div className="org-stage inline-block min-w-full p-8" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}>
                  <ul ref={stageRef} className="org-tree mx-auto w-max motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300">
                    {rootsToRender.map((n) => (
                      <Subtree key={n.id} node={n} extras={extras} accentColor={accentColor}
                        collapsedIds={collapsedIds} toggle={toggle} matchIds={matchIds} forceExpand={!!q}
                        onHoverShow={showHover} onHoverHide={hideHover} showCompany={portfolio} onFocus={setFocusId} />
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 p-2 overflow-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300" style={{ maxHeight: isFs ? "calc(100dvh - 130px)" : "72vh" }}>
              {rootsToRender.map((n) => (
                <OutlineRow key={n.id} node={n} depth={0} collapsedIds={collapsedIds} toggle={toggle} onFocus={setFocusId} matchIds={matchIds} showCompany={portfolio} extras={extras} pickerPeople={pickerPeople} />
              ))}
            </div>
          )}
        </>
      )}

      {mode !== "depts" && !hasStructure && (
        <div className="rounded-xl bg-bg-subtle/40 ring-1 ring-border/60 p-3 text-[11px] text-fg-muted leading-snug">
          No in-company reporting lines yet — everyone is shown below. Set a person&apos;s{" "}
          <span className="font-medium text-fg">Director</span> to someone in this company to nest them into a tree.
          {tree.reportingOut > 0 && <> {tree.reportingOut} {tree.reportingOut === 1 ? "person reports" : "people report"} to a director in another company (shown on their card).</>}
        </div>
      )}

      {mode !== "depts" && !focusNode && tree.unassigned.length > 0 && (
        <div className="pt-1 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
            <Users size={12} /> {hasStructure ? `Unassigned (${tree.unassigned.length})` : `People (${tree.unassigned.length})`}
          </div>
          {deptGroups.some(([d]) => d !== "No department") ? (
            deptGroups.map(([dept, members]) => {
              const deptId = members[0]?.departmentId ?? null;
              const headId = companyId != null && deptId != null ? deptHeads[`${companyId}:${deptId}`] ?? null : null;
              const sorted = headId ? [...members].sort((a, b) => (a.id === headId ? -1 : b.id === headId ? 1 : 0)) : members;
              return (
                <div key={dept}>
                  <div className="flex items-center gap-1.5 text-[11px] text-fg-muted mb-1.5 flex-wrap">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dept === "No department" ? "hsl(var(--border-strong))" : `hsl(${deptHue(dept)} 65% 55%)` }} />
                    <span className="font-medium">{dept}</span>
                    <span className="text-fg-subtle tabular">· {members.length}</span>
                    {companyId != null && deptId != null && (
                      <span className="inline-flex items-center gap-1 ml-1 print-hidden">
                        <span className="text-fg-subtle">· Head</span>
                        <select value={headId ?? ""} onChange={(e) => saveHead(deptId, e.target.value ? Number(e.target.value) : null)}
                          className="rounded-md bg-bg-subtle ring-1 ring-border px-1.5 py-0.5 text-[11px] text-fg focus:outline-none focus:ring-accent/40 cursor-pointer">
                          <option value="">— none —</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {sorted.map((n) => (
                      <div key={n.id} className="relative group/r">
                        {n.id === headId && <span className="absolute -top-2 left-2 z-10 text-[9px] font-semibold uppercase tracking-wide bg-accent text-accent-fg rounded-full px-1.5 py-0.5 shadow-sm">Head</span>}
                        {pickerPeople && <span className="absolute -top-2 right-1 z-20"><OrgDirectorPicker personId={n.id} currentManagerId={n.managerId} people={pickerPeople} compact missing={n.managerId == null} /></span>}
                        <NodeCard node={n} extras={extras[n.id]} accentColor={accentColor} collapsed={false} onToggle={() => {}} matched={matchIds.has(n.id)}
                          onHoverShow={showHover} onHoverHide={hideHover} showCompany={portfolio} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {tree.unassigned.map((n) => (
                <div key={n.id} className="relative">
                  {pickerPeople && <span className="absolute -top-2 right-1 z-20"><OrgDirectorPicker personId={n.id} currentManagerId={n.managerId} people={pickerPeople} compact missing={n.managerId == null} /></span>}
                  <NodeCard node={n} extras={extras[n.id]} accentColor={accentColor} collapsed={false} onToggle={() => {}} matched={matchIds.has(n.id)}
                    onHoverShow={showHover} onHoverHide={hideHover} showCompany={portfolio} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode !== "depts" && !focusNode && associated.length > 0 && (
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
  companies, trees, portfolioTree, extras = {}, webPeople, associatedByCompany = {}, deptHeads = {}, pickerPeople, initialCompanyId, showSwitcher = true, showEveryone = true,
}: {
  companies: OrgChartCompany[];
  trees: Record<number, CompanyTree>;
  portfolioTree?: CompanyTree;
  extras?: Extras;
  webPeople?: WebPerson[];
  associatedByCompany?: Record<number, AssociatedPerson[]>;
  deptHeads?: Record<string, number>;
  pickerPeople?: PickPerson[];
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
        <TreeView key="portfolio" tree={portfolioTree} extras={extras} accentColor={null} companyName={null} portfolio pickerPeople={pickerPeople} />
      ) : typeof view === "number" && trees[view] ? (
        <TreeView key={view} tree={trees[view]} extras={extras} accentColor={accentFor(view)} companyName={companyName(view)} associated={associatedByCompany[view] ?? []} companyId={view} deptHeads={deptHeads} pickerPeople={pickerPeople} />
      ) : (
        <p className="text-sm text-fg-subtle italic py-6 text-center">Select a company.</p>
      )}
    </div>
  );
}
