"use client";

import { useMemo, useRef, useState } from "react";
import { Users, ChevronRight, ChevronDown, LayoutGrid, Search, Printer, X, ListChecks } from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { Segmented } from "@/components/macos";
import { cn } from "@/lib/cn";
import { PERSON_TYPE_LABELS } from "@/lib/person-types";
import { countNodes, type CompanyTree, type OrgNode } from "@/lib/org-chart";

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

export type OrgChartCompany = { id: number; name: string; accentColor: string | null };

/* ------------------------------------------------------------------ */
/* The card + recursive tree                                          */
/* ------------------------------------------------------------------ */

function NodeCard({
  node,
  collapsed,
  onToggle,
  matched,
}: {
  node: OrgNode;
  collapsed: boolean;
  onToggle: () => void;
  matched: boolean;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div
      className={cn(
        "org-card relative flex items-center gap-3 rounded-2xl glass elevated pl-3 pr-4 py-2.5 min-w-[15rem] max-w-[18rem]",
        matched && "ring-2 ring-accent"
      )}
    >
      <span
        className={cn(
          "h-10 w-10 rounded-full ring-1 flex items-center justify-center text-[13px] font-semibold shrink-0",
          TYPE_TINT[node.personType] ?? TYPE_TINT.outsider
        )}
      >
        {initials(node.name)}
      </span>
      <div className="min-w-0 flex-1">
        <PersonDrawerLink
          id={node.id}
          name={node.name}
          className="block text-sm font-semibold text-fg hover:text-accent hover:underline text-left truncate"
        />
        <div className="text-[11px] text-fg-muted truncate">
          {node.role || PERSON_TYPE_LABELS[node.personType]}
          {node.departmentName ? ` · ${node.departmentName}` : ""}
        </div>
        {node.secondaryManagers.length > 0 && (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-fg-subtle border-l-2 border-dotted border-fg-subtle/50 pl-1.5">
            also reports to {node.secondaryManagers.map((m) => m.name ?? "—").join(", ")}
          </div>
        )}
      </div>

      {/* open-task badge */}
      {node.openTasks > 0 && (
        <span
          className="absolute -top-1.5 -left-1.5 inline-flex items-center gap-0.5 rounded-full bg-info-soft text-info ring-1 ring-info/30 px-1.5 py-0.5 text-[10px] font-semibold tabular print-hidden"
          title={`${node.openTasks} open task${node.openTasks === 1 ? "" : "s"}`}
        >
          <ListChecks size={10} /> {node.openTasks}
        </span>
      )}

      {/* collapse / expand */}
      {hasChildren && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand reports" : "Collapse reports"}
          className="shrink-0 -mr-1 h-6 w-6 rounded-full flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-bg-muted/70 transition-colors print-hidden"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
      )}
      {hasChildren && collapsed && (
        <span className="absolute -bottom-2 right-3 text-[10px] text-fg-subtle bg-bg-elev rounded-full px-1.5 ring-1 ring-border tabular">
          {countNodes(node.children)}
        </span>
      )}
    </div>
  );
}

function Subtree({
  node,
  collapsedIds,
  toggle,
  matchIds,
  forceExpand,
  firstMatchRef,
  firstMatchId,
}: {
  node: OrgNode;
  collapsedIds: Set<number>;
  toggle: (id: number) => void;
  matchIds: Set<number>;
  forceExpand: boolean;
  firstMatchRef: React.RefObject<HTMLLIElement | null>;
  firstMatchId: number | null;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = !forceExpand && collapsedIds.has(node.id);
  const showChildren = hasChildren && !collapsed;
  const matched = matchIds.has(node.id);

  return (
    <li ref={node.id === firstMatchId ? firstMatchRef : undefined}>
      <div className="relative shrink-0">
        <NodeCard node={node} collapsed={collapsed} onToggle={() => toggle(node.id)} matched={matched} />
        {showChildren && <span className="org-stub-out" aria-hidden />}
      </div>
      {showChildren && (
        <ul>
          {node.children.map((c) => (
            <Subtree
              key={c.id}
              node={c}
              collapsedIds={collapsedIds}
              toggle={toggle}
              matchIds={matchIds}
              forceExpand={forceExpand}
              firstMatchRef={firstMatchRef}
              firstMatchId={firstMatchId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeView({ tree }: { tree: CompanyTree }) {
  const [collapsedIds, setCollapsed] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const firstMatchRef = useRef<HTMLLIElement | null>(null);

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Search: match by name/role; force-expand while searching so matches show.
  const q = query.trim().toLowerCase();
  const { matchIds, firstMatchId } = useMemo(() => {
    const ids = new Set<number>();
    let first: number | null = null;
    if (!q) return { matchIds: ids, firstMatchId: first };
    const walk = (n: OrgNode) => {
      if (n.name.toLowerCase().includes(q) || (n.role ?? "").toLowerCase().includes(q)) {
        ids.add(n.id);
        if (first == null) first = n.id;
      }
      n.children.forEach(walk);
    };
    [...tree.roots, ...tree.unassigned].forEach(walk);
    return { matchIds: ids, firstMatchId: first };
  }, [q, tree]);

  const expandAll = () => setCollapsed(new Set());
  const print = () => { expandAll(); setTimeout(() => window.print(), 60); };

  if (tree.total === 0) {
    return <p className="text-sm text-fg-subtle italic py-6 text-center">No active people in this company.</p>;
  }
  const hasStructure = tree.roots.length > 0;

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap print-hidden">
        <div className="text-[11px] text-fg-subtle tabular">
          {tree.total} active · {tree.withManager} with a manager · {tree.total - tree.withManager} unassigned
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a person…"
              className="h-8 w-44 rounded-full bg-bg-subtle/70 ring-1 ring-border pl-7 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-accent/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={print}
            className="h-8 inline-flex items-center gap-1.5 rounded-full bg-bg-subtle/70 ring-1 ring-border px-3 text-xs text-fg-muted hover:text-fg transition-colors"
          >
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {q && matchIds.size === 0 && (
        <div className="text-xs text-fg-subtle italic">No match for “{query}”.</div>
      )}

      {hasStructure ? (
        <div className="overflow-x-auto -mx-1 px-1 pb-2">
          <ul className="org-tree">
            {tree.roots.map((n) => (
              <Subtree
                key={n.id}
                node={n}
                collapsedIds={collapsedIds}
                toggle={toggle}
                matchIds={matchIds}
                forceExpand={!!q}
                firstMatchRef={firstMatchRef}
                firstMatchId={firstMatchId}
              />
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl glass elevated p-4 text-sm text-fg-muted">
          No reporting lines set yet for this company. Open a person and set their{" "}
          <span className="font-medium text-fg">Manager</span> to start building the tree.
        </div>
      )}

      {tree.unassigned.length > 0 && hasStructure && (
        <div className="pt-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle mb-2">
            <Users size={12} /> Unassigned ({tree.unassigned.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {tree.unassigned.map((n) => (
              <div key={n.id} className="shrink-0">
                <NodeCard node={n} collapsed={false} onToggle={() => {}} matched={matchIds.has(n.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Group overview                                                     */
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

function GroupOverview({
  companies,
  trees,
  onPick,
}: {
  companies: OrgChartCompany[];
  trees: Record<number, CompanyTree>;
  onPick: (companyId: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {companies.map((c) => {
        const tree = trees[c.id];
        const lead = tree ? companyLead(tree) : null;
        const accent = c.accentColor || "hsl(var(--accent))";
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            className="group text-left rounded-2xl glass elevated p-4 hover:ring-1 hover:ring-accent/30 transition-all"
          >
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
/* Main                                                               */
/* ------------------------------------------------------------------ */

export function OrgChart({
  companies,
  trees,
  initialCompanyId,
  showSwitcher = true,
  showGroup = true,
}: {
  companies: OrgChartCompany[];
  trees: Record<number, CompanyTree>;
  initialCompanyId?: number;
  showSwitcher?: boolean;
  showGroup?: boolean;
}) {
  const [view, setView] = useState<"group" | number>(
    initialCompanyId != null ? initialCompanyId
    : showGroup ? "group"
    : (companies[0]?.id ?? 0)
  );

  const options = [
    ...(showGroup ? [{ value: "group", label: "Group", icon: <LayoutGrid size={13} /> }] : []),
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <div className="space-y-4">
      {showSwitcher && options.length > 1 && (
        <div className="overflow-x-auto -mx-1 px-1 no-scrollbar print-hidden">
          <Segmented
            value={view === "group" ? "group" : String(view)}
            onChange={(v) => setView(v === "group" ? "group" : Number(v))}
            size="sm"
            className="min-w-max"
            options={options}
          />
        </div>
      )}

      {view === "group" ? (
        <GroupOverview companies={companies} trees={trees} onPick={(id) => setView(id)} />
      ) : trees[view] ? (
        <TreeView key={view} tree={trees[view]} />
      ) : (
        <p className="text-sm text-fg-subtle italic py-6 text-center">Select a company.</p>
      )}
    </div>
  );
}
