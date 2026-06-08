"use client";

import { useState } from "react";
import { Users, CornerDownRight, ChevronRight, LayoutGrid } from "lucide-react";
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

/** One person node + its reports, rendered as an indented outline tree. */
function NodeRow({ node, depth }: { node: OrgNode; depth: number }) {
  return (
    <li className="relative">
      <div className="flex items-center gap-2.5 py-1.5">
        <span
          className={cn(
            "h-8 w-8 rounded-full ring-1 flex items-center justify-center text-[12px] font-semibold shrink-0",
            TYPE_TINT[node.personType] ?? TYPE_TINT.outsider
          )}
        >
          {initials(node.name)}
        </span>
        <div className="min-w-0">
          <PersonDrawerLink
            id={node.id}
            name={node.name}
            className="text-sm font-medium text-fg hover:text-accent hover:underline text-left truncate"
          />
          <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle truncate">
            {node.role && <span className="truncate">{node.role}</span>}
            {node.role && node.departmentName && <span>·</span>}
            {node.departmentName && <span className="truncate">{node.departmentName}</span>}
            {!node.role && !node.departmentName && (
              <span className="italic">{PERSON_TYPE_LABELS[node.personType]}</span>
            )}
          </div>
          {node.secondaryManagers.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-fg-subtle/80 mt-0.5">
              <CornerDownRight size={11} className="opacity-60" />
              <span className="italic">
                also reports to {node.secondaryManagers.map((m) => m.name ?? "—").join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>
      {node.children.length > 0 && (
        <ul className="ml-4 pl-4 border-l border-border/70 space-y-0.5">
          {node.children.map((c) => (
            <NodeRow key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeView({ tree }: { tree: CompanyTree }) {
  if (tree.total === 0) {
    return <p className="text-sm text-fg-subtle italic py-6 text-center">No active people in this company.</p>;
  }
  const hasStructure = tree.roots.length > 0;
  return (
    <div className="space-y-5">
      <div className="text-[11px] text-fg-subtle tabular">
        {tree.total} active · {tree.withManager} with a manager · {tree.total - tree.withManager} unassigned
      </div>

      {hasStructure ? (
        <ul className="space-y-0.5">
          {tree.roots.map((n) => (
            <NodeRow key={n.id} node={n} depth={0} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl glass elevated p-4 text-sm text-fg-muted">
          No reporting lines set yet for this company. Open a person and set their{" "}
          <span className="font-medium text-fg">Manager</span> to start building the tree.
        </div>
      )}

      {tree.unassigned.length > 0 && hasStructure && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle mb-1.5">
            <Users size={12} /> Unassigned ({tree.unassigned.length})
          </div>
          <ul className="space-y-0.5">
            {tree.unassigned.map((n) => (
              <NodeRow key={n.id} node={n} depth={0} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The most senior person in a company's tree — the root with the most reports. */
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

/** Portfolio overview — a card per company; click to drill into its tree. */
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

/**
 * Organogram view. The server pre-builds one CompanyTree per company; this
 * component switches between a group overview and per-company trees. Pass a
 * single company with showGroup/showSwitcher off to embed one company's tree
 * (e.g. the company dashboard Org tab).
 */
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
  // "group" = portfolio overview; a number = a specific company's tree.
  // Default to the group overview, unless a specific company was requested
  // (deep-link) or the group view is disabled (embedded single-company use).
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
        <div className="overflow-x-auto -mx-1 px-1 no-scrollbar">
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
        <TreeView tree={trees[view]} />
      ) : (
        <p className="text-sm text-fg-subtle italic py-6 text-center">Select a company.</p>
      )}
    </div>
  );
}
