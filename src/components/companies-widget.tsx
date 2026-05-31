"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ExternalLink, ListTodo } from "lucide-react";
import { cn } from "@/lib/cn";
import { triggerHaptic } from "@/lib/use-long-press";
import { PeekPreview, type PeekAction } from "./peek-preview";

export type CompanyGlance = {
  id: number;
  name: string;
  accent: string | null;
  open: number;
  closed: number;
  openTitles: string[];
};

/**
 * Subtle, collapsible dashboard widget — a quiet roll-up of every company with
 * its open count. Tap a company to open it; long-press for a minimal peek of its
 * open tasks plus a closed-count badge. Collapsed by default to stay out of the way.
 */
export function CompaniesWidget({ companies }: { companies: CompanyGlance[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState<CompanyGlance | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  function onDown(c: CompanyGlance, e: React.PointerEvent) {
    longPressed.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(c); }, 400);
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clear();
  }

  if (companies.length === 0) return null;

  const totalOpen = companies.reduce((n, c) => n + c.open, 0);

  const peekActions = (c: CompanyGlance): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => router.push(`/companies/${c.id}`) },
    { label: "Tasks", icon: <ListTodo size={15} />, onClick: () => router.push(`/?tab=tasks&company=${encodeURIComponent(c.name)}`) },
  ];

  return (
    <>
      <details className="group glass elevated rounded-2xl overflow-hidden" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
          <Building2 size={12} /> Companies
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{companies.length}</span>
          <span className="text-fg-subtle normal-case tracking-normal font-normal">· {totalOpen} open</span>
          <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-2 pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { if (longPressed.current) { longPressed.current = false; return; } router.push(`/companies/${c.id}`); }}
                onPointerDown={(e) => onDown(c, e)}
                onPointerMove={onMove}
                onPointerUp={clear}
                onPointerLeave={clear}
                onPointerCancel={clear}
                onContextMenu={(e) => e.preventDefault()}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left select-none hover:bg-bg-muted/50 transition-colors"
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.accent || "hsl(var(--fg-subtle))" }} />
                <span className="flex-1 min-w-0 truncate text-sm">{c.name}</span>
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full text-[11px] font-semibold tabular",
                  c.open === 0 ? "bg-bg-subtle/60 text-fg-subtle" : "bg-info-soft/70 text-info"
                )}>{c.open}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-fg-subtle text-center pt-2">Tap to open · hold for a quick look</p>
        </div>
      </details>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => router.push(`/companies/${peek.id}`) : undefined}
        title={peek?.name}
        subtitle={peek ? `${peek.open} open` : undefined}
        pills={peek ? (
          <>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-info-soft/60 ring-1 ring-info/25 text-info tabular">{peek.open} open</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-bg-subtle/70 ring-1 ring-border/60 text-fg-muted tabular">{peek.closed} closed</span>
          </>
        ) : undefined}
        body={peek && peek.openTitles.length > 0 ? (
          <span className="block space-y-1">
            {peek.openTitles.map((t, i) => (
              <span key={i} className="block truncate text-fg-muted">• {t}</span>
            ))}
            {peek.open > peek.openTitles.length && (
              <span className="block text-fg-subtle">+ {peek.open - peek.openTitles.length} more</span>
            )}
          </span>
        ) : (peek ? <span className="text-fg-subtle">No open tasks 🎉</span> : undefined)}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />
    </>
  );
}
