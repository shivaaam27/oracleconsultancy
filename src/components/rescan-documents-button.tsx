"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { RescanDocumentsDialog } from "./rescan-documents-dialog";

/** Opens the "Re-scan documents" tool — re-reads a company's saved files and
 *  proposes fixes (you approve each one). Sits beside "Find duplicates". */
export function RescanDocumentsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-bg-elev px-3 py-2 text-sm font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted"
      >
        <ScanLine size={15} /> Re-scan documents
      </button>
      <RescanDocumentsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
