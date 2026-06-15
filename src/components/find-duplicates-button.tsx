"use client";

import { useState } from "react";
import { CopyCheck } from "lucide-react";
import { DuplicateSweepDialog } from "./duplicate-sweep-dialog";

/** Opens the "Find duplicates" sweep over all documents. */
export function FindDuplicatesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-bg-elev px-3 py-2 text-sm font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted"
      >
        <CopyCheck size={15} /> Find duplicates
      </button>
      <DuplicateSweepDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
