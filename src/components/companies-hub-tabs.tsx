"use client";

import { useState, type ReactNode } from "react";
import { Building2, Boxes, MapPin, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { DepartmentsAdmin } from "./departments-admin";
import { ReferenceAdmin } from "./reference-admin";
import type { DepartmentAdminRow } from "@/lib/departments";
import type { SiteAdminRow } from "@/lib/sites";
import type { RoleAdminRow } from "@/lib/roles";
import { createSite, renameSite, mergeSites, deleteSite, createRole, renameRole, mergeRoles, deleteRole } from "@/app/companies/reference-actions";

type Tab = "companies" | "departments" | "sites" | "roles";

/** Companies hub: reference-data centre — Companies · Departments · Sites · Roles. */
export function CompaniesHubTabs({ companiesSlot, departments, sites, roles }: {
  companiesSlot: ReactNode;
  departments: DepartmentAdminRow[];
  sites: SiteAdminRow[];
  roles: RoleAdminRow[];
}) {
  const [tab, setTab] = useState<Tab>("companies");
  // Phone: four equal segments filling the width. The four labelled tabs come to
  // ~417px, so in a 375px screen this was a sideways scroller with no affordance
  // and Roles sat off the edge as a bare icon — the same failure the Tasks filter
  // row and the People chips had. The icons stand down below `sm` to buy the room.
  const tabCls = (active: boolean) =>
    cn("inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-[12px] sm:text-sm font-medium rounded-full transition-colors whitespace-nowrap",
      active ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60");

  return (
    <div className="space-y-4">
      <div className="flex w-full sm:inline-flex sm:w-auto items-center gap-1 rounded-full bg-bg-subtle/70 ring-1 ring-border p-1 sm:overflow-x-auto sm:max-w-full">
        <button type="button" onClick={() => setTab("companies")} className={tabCls(tab === "companies")}><Building2 size={14} className="hidden sm:block" /> Companies</button>
        <button type="button" onClick={() => setTab("departments")} className={tabCls(tab === "departments")}><Boxes size={14} className="hidden sm:block" /> Departments</button>
        <button type="button" onClick={() => setTab("sites")} className={tabCls(tab === "sites")}><MapPin size={14} className="hidden sm:block" /> Sites</button>
        <button type="button" onClick={() => setTab("roles")} className={tabCls(tab === "roles")}><BadgeCheck size={14} className="hidden sm:block" /> Roles</button>
      </div>

      {tab === "companies" && companiesSlot}
      {tab === "departments" && <DepartmentsAdmin departments={departments} />}
      {tab === "sites" && (
        <ReferenceAdmin
          items={sites.map((s) => ({ id: s.id, name: s.name, meta: `${s.workCount} work · ${s.residenceCount} living here` }))}
          noun="site" addPlaceholder="New site / location…"
          onCreate={createSite} onRename={renameSite} onMerge={mergeSites} onDelete={deleteSite}
          mergeNote="Re-points everyone based or living there." deleteNote="Anyone here is set to “no site”."
        />
      )}
      {tab === "roles" && (
        <ReferenceAdmin
          items={roles.map((r) => ({ id: r.id, name: r.name, meta: `${r.peopleCount} ${r.peopleCount === 1 ? "person" : "people"}` }))}
          noun="job title" addPlaceholder="New job title / role…"
          onCreate={createRole} onRename={renameRole} onMerge={mergeRoles} onDelete={deleteRole}
          mergeNote="Re-points everyone with that role." deleteNote="People keep their current role text."
        />
      )}
    </div>
  );
}
