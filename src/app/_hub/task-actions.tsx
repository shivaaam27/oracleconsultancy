"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/** Registers the Task Management page's contextual action — opens the Create launcher at the Task form. */
export function TaskActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function newTask() {
    const p = new URLSearchParams(searchParams.toString());
    p.set("capture", "open");
    p.set("create", "task");
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  useContextActions(
    "tasks",
    [{ id: "new-task", label: "New Task", icon: <Plus size={16} />, onClick: newTask, primary: true, tone: "accent" }],
    [pathname]
  );
  return null;
}
