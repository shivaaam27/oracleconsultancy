"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { NotebookPen, StickyNote } from "lucide-react";
import { Segmented } from "@/components/macos";

type Tab = "meetings" | "notes";

export function WorkbookShell({
  meetingsSlot,
  notesSlot,
  initialTab = "meetings",
}: {
  meetingsSlot: React.ReactNode;
  notesSlot: React.ReactNode;
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

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Workbook</h1>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "meetings", label: "Meetings", icon: <NotebookPen size={14} /> },
            { value: "notes", label: "Notes", icon: <StickyNote size={14} /> },
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
          {tab === "meetings" ? meetingsSlot : notesSlot}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
