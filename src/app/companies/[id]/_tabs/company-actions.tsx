"use client";

import { Plus, ExternalLink } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/** Registers the company page's contextual actions into the action bar. */
export function CompanyActions({ companyId, companyName }: { companyId: number; companyName: string }) {
  useContextActions(
    "company",
    [
      { id: "new-task", label: "New Task", icon: <Plus size={16} />, href: `/task/new?companyId=${companyId}&returnTo=${encodeURIComponent(`/companies/${companyId}`)}`, primary: true, tone: "accent" },
      { id: "open-tasks", label: "Open in Tasks", icon: <ExternalLink size={16} />, href: `/?tab=tasks&company=${encodeURIComponent(companyName)}`, compact: true },
    ],
    [companyId, companyName]
  );
  return null;
}
