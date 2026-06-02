"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, ExternalLink } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/** Registers the company page's contextual actions into the action bar. */
export function CompanyActions({ companyId, companyName }: { companyId: number; companyName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function newTask() {
    const p = new URLSearchParams(searchParams.toString());
    p.set("capture", "open");
    p.set("create", "task");
    p.set("companyId", String(companyId));
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  useContextActions(
    "company",
    [
      { id: "new-task", label: "New Task", icon: <Plus size={16} />, onClick: newTask, primary: true, tone: "accent" },
      { id: "open-tasks", label: "Open in Tasks", icon: <ExternalLink size={16} />, href: `/?tab=tasks&company=${encodeURIComponent(companyName)}`, compact: true },
    ],
    [companyId, companyName, pathname]
  );
  return null;
}
