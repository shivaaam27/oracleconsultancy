"use client";

// A dropdown with nothing in it looks broken. This says why, and where to fix it.
//
// Per-project reference lists (the owner's choice) mean a new project starts
// with every list empty — so the first thing you meet on the Requisitions screen
// is a "Who pays" row with no buttons. Without this banner that reads as a bug.

import Link from "next/link";
import { Settings2 } from "lucide-react";

export function SetupNeeded({
  projectId, missing,
}: {
  projectId: number;
  /** Plain names of the empty lists, e.g. ["Who pays", "Suppliers"]. */
  missing: string[];
}) {
  if (missing.length === 0) return null;
  const list = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-[11px] text-warn">
      <Settings2 size={12} className="mt-px shrink-0" />
      <span>
        <strong>{list}</strong> {missing.length === 1 ? "is" : "are"} empty, so those dropdowns
        have nothing to offer. Fill {missing.length === 1 ? "it" : "them"} in on the{" "}
        <Link href={`/projects/${projectId}/setup`} className="underline underline-offset-2">
          Setup tab
        </Link>
        {" "}— or type a value here and it will be used just this once.
      </span>
    </p>
  );
}
