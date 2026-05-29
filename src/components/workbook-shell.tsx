"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NotebookPen, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";

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
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Workbook</h1>
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-bg-muted/60 border border-border">
          <TabButton active={tab === "meetings"} onClick={() => setTab("meetings")} icon={NotebookPen} label="Meetings" />
          <TabButton active={tab === "notes"} onClick={() => setTab("notes")} icon={StickyNote} label="Notes" />
        </div>
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

function TabButton({
  active, onClick, icon: Icon, label,
}: {
  active: boolean; onClick: () => void; icon: typeof NotebookPen; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
        active ? "bg-bg-elev text-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg"
      )}
    >
      <Icon size={14} /> {label}
    </button>
  );
}
