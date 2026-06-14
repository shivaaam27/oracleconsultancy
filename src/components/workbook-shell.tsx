"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { NotebookPen, StickyNote, ListTodo, Plus } from "lucide-react";
import { Segmented } from "@/components/macos";
import { useContextActions } from "@/components/context-actions";

type Tab = "meetings" | "notes" | "todo";

export function WorkbookShell({
  meetingsSlot,
  notesSlot,
  todoSlot,
  initialTab = "meetings",
}: {
  meetingsSlot: React.ReactNode;
  notesSlot: React.ReactNode;
  todoSlot: React.ReactNode;
  initialTab?: Tab;
}) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Keep the chosen tab in the URL so a refresh, the back button, and deep
  // links (e.g. the Capture Wizard's "Save as note") all land on the right tab.
  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "meetings") params.delete("tab");
    else params.set("tab", next);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const slot = tab === "meetings" ? meetingsSlot : tab === "notes" ? notesSlot : todoSlot;

  // Tab-aware "New" in the global action bar — dispatches an event the active
  // workspace listens for, so the bar mirrors the current section.
  const newLabel = tab === "meetings" ? "New meeting" : tab === "notes" ? "New note" : "New to-do";
  const newEvent = tab === "meetings" ? "workbook:new-meeting" : tab === "notes" ? "workbook:new-note" : "workbook:new-todo";
  useContextActions(
    "workbook",
    [{ id: "new", label: newLabel, icon: <Plus size={16} />, onClick: () => window.dispatchEvent(new CustomEvent(newEvent)), primary: true, tone: "accent" }],
    [tab]
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold tracking-tight">Workbook</h1>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "meetings", label: "Meetings", icon: <NotebookPen size={14} /> },
            { value: "notes", label: "Notes", icon: <StickyNote size={14} /> },
            { value: "todo", label: "To-do", icon: <ListTodo size={14} /> },
          ]}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
        >
          {slot}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
