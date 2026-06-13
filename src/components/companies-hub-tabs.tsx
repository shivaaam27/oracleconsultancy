"use client";

import { useState, type ReactNode } from "react";
import { Building2, Boxes } from "lucide-react";
import { cn } from "@/lib/cn";
import { DepartmentsAdmin } from "./departments-admin";
import type { DepartmentAdminRow } from "@/lib/departments";

/** Companies hub: segmented Companies | Departments. The companies grid is
 *  server-rendered and passed in as a slot; departments load alongside it. */
export function CompaniesHubTabs({ companiesSlot, departments }: { companiesSlot: ReactNode; departments: DepartmentAdminRow[] }) {
  const [tab, setTab] = useState<"companies" | "departments">("companies");
  const tabCls = (active: boolean) =>
    cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors",
      active ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60");

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-full bg-bg-subtle/70 ring-1 ring-border p-1">
        <button type="button" onClick={() => setTab("companies")} className={tabCls(tab === "companies")}><Building2 size={14} /> Companies</button>
        <button type="button" onClick={() => setTab("departments")} className={tabCls(tab === "departments")}><Boxes size={14} /> Departments</button>
      </div>
      {tab === "companies" ? companiesSlot : <DepartmentsAdmin departments={departments} />}
    </div>
  );
}
