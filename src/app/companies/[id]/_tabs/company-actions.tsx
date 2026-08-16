"use client";

import { usePathname } from "next/navigation";
import { Plus, ExternalLink } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/** Registers the company page's contextual actions into the action bar.
 *
 *  New Task used to push `?capture=open`, which nothing has read since the
 *  Capture Wizard was removed — the button did nothing. It now opens /task/new
 *  with this company preselected (rendered as a modal by the intercepting route).
 */
export function CompanyActions({ companyId, companyName }: { companyId: number; companyName: string }) {
  const pathname = usePathname();

  useContextActions(
    "company",
    [
      {
        id: "new-task",
        label: "New Task",
        icon: <Plus size={16} />,
        href: `/task/new?companyId=${companyId}&returnTo=${encodeURIComponent(pathname)}`,
        primary: true,
        tone: "accent",
      },
      { id: "open-tasks", label: "Open in Tasks", icon: <ExternalLink size={16} />, href: `/?tab=tasks&company=${encodeURIComponent(companyName)}`, compact: true },
    ],
    [companyId, companyName, pathname]
  );
  return null;
}
