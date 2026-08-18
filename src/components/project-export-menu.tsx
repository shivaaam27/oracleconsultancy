"use client";

// Export and print, on every project tab.
//
// One menu rather than a button per sheet: the owner should not have to
// remember which screen can produce which file. The export that matches the tab
// he is standing on is listed first and marked "this tab", so the common case is
// one click and the rest are still there.
//
// Each item is a plain link to `/api/projects/<id>/export?what=…`, so the
// browser downloads it the way it downloads anything else — no JavaScript to
// build a file, nothing held in memory.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Printer, ChevronDown } from "lucide-react";
import { PROJECT_EXPORTS, EXPORT_FOR_TAB } from "@/lib/project-exports";
import { cn } from "@/lib/cn";

export function ProjectExportMenu({ projectId, tab }: { projectId: number; tab: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else, and on Escape — the two ways a person
  // expects to dismiss a menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const here = EXPORT_FOR_TAB[tab];
  const items = [...PROJECT_EXPORTS].sort((a, b) =>
    a.key === here ? -1 : b.key === here ? 1 : 0);

  return (
    <div className="ml-auto flex items-center gap-1 pb-1" ref={box}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex items-center gap-1 rounded-[6px] border border-border px-2 py-1 text-[12px] text-fg-muted hover:text-fg"
        >
          <Download size={13} /> Export <ChevronDown size={12} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-1 w-64 rounded-[6px] border border-border bg-bg-elev py-1 shadow-lg"
          >
            {items.map((it) => (
              <a
                key={it.key}
                role="menuitem"
                href={`/api/projects/${projectId}/export?what=${it.key}`}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between px-3 py-1.5 text-[12px] hover:bg-bg-muted/60",
                  it.key === here ? "font-medium text-fg" : "text-fg-muted",
                )}
              >
                {it.label}
                {it.key === here && <span className="text-[10px] text-fg-subtle">this tab</span>}
              </a>
            ))}
          </div>
        )}
      </div>

      <Link
        href={`/projects/${projectId}/print`}
        className="inline-flex items-center gap-1 rounded-[6px] border border-border px-2 py-1 text-[12px] text-fg-muted hover:text-fg"
      >
        <Printer size={13} /> Print
      </Link>
    </div>
  );
}
