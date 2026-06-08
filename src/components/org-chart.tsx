"use client";

import { useState } from "react";
import { Users, CornerDownRight } from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { Segmented } from "@/components/macos";
import { cn } from "@/lib/cn";
import { PERSON_TYPE_LABELS } from "@/lib/person-types";
import type { CompanyTree, OrgNode } from "@/lib/org-chart";

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

/**
 * Organogram view. The server pre-builds one CompanyTree per company; this
 * component just switches between them. Pass a single company (and omit the
 * switcher) to embed one company's tree, e.g. on the company dashboard.
 */
export function OrgChart({
  companies,
  trees,
  initialCompanyId,
  showSwitcher = true,
}: {
  companies: OrgChartCompany[];
  trees: Record<number, CompanyTree>;
  initialCompanyId?: number;
  showSwitcher?: boolean;
}) {
  const [companyId, setCompanyId] = useState<number>(
    initialCompanyId ?? companies[0]?.id ?? 0
  );
  const tree = trees[companyId];

  return (
    <div className="space-y-4">
      {showSwitcher && companies.length > 1 && (
        <div className="overflow-x-auto -mx-1 px-1 no-scrollbar">
          <Segmented
            value={String(companyId)}
            onChange={(v) => setCompanyId(Number(v))}
            size="sm"
            className="min-w-max"
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        </div>
      )}
      {tree ? <TreeView tree={tree} /> : (
        <p className="text-sm text-fg-subtle italic py-6 text-center">Select a company.</p>
      )}
    </div>
  );
}
