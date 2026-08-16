"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/**
 * Registers the Home/overview contextual action: New task.
 *
 * It used to push `?capture=open`, but the Capture Wizard route was removed and
 * nothing ever read that parameter again — so the button quietly did nothing.
 * It now goes to /task/new, which an intercepting route renders as a modal over
 * whatever you were looking at.
 */
export function HomeActions() {
  const pathname = usePathname();

  useContextActions(
    "home",
    [{ id: "create", label: "New task", icon: <Plus size={16} />, href: "/task/new", primary: true, tone: "accent" }],
    [pathname]
  );
  return null;
}
