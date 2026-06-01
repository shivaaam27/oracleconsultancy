"use client";

import { Plus } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/** Registers the Task Management page's contextual actions into the action bar. */
export function TaskActions() {
  useContextActions(
    "tasks",
    [
      { id: "new-task", label: "New Task", icon: <Plus size={16} />, href: "/task/new", primary: true, tone: "accent" },
    ],
    []
  );
  return null;
}
