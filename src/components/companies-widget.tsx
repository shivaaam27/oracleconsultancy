"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, ExternalLink, ListTodo } from "lucide-react";
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
  closedTitles: string[];
};

/**
 * Subtle, collapsible dashboard widget — every company with its open (red) and
 * closed (green) counts and a quick-open button. Long-press a row for a minimal
 * peek that lists the open / closed tasks inline (toggle, no navigation).
 */
export function CompaniesWidget({ companies }: { companies: CompanyGlance[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState<CompanyGlance | null>(null);
  const [peekView, setPeekView] = useState<"open" | "closed">("open");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  function onDown(c: CompanyGlance, e: React.PointerEvent) {
    longPressed.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeekView("open"); setPeek(c); }, 400);
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clear();
  }

  if (companies.length === 0) return null;

  const peekActions = (c: CompanyGlance): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => router.push(`/companies/${c.id}`) },
    { label: "Tasks", icon: <ListTodo size={15} />, onClick: () => router.push(`/?tab=tasks&company=${encodeURIComponent(c.name)}`) },
  ];

  const titles = peek ? (peekView === "open" ? peek.openTitles : peek.closedTitles) : [];
  const total = peek ? (peekView === "open" ? peek.open : peek.closed) : 0;

  return (
    <>
      <details className="group glass elevated rounded-2xl overflow-hidden" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
          <Building2 size={12} /> Companies
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{companies.length}</span>
          <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-2 pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
            {companies.map((c) => (
              <div
                key={c.id}
                onPointerDown={(e) => onDown(c, e)}
                onPointerMove={onMove}
                onPointerUp={clear}
                onPointerLeave={clear}
                onPointerCancel={clear}
                onContextMenu={(e) => e.preventDefault()}
                className="group/row flex items-center gap-2.5 px-2.5 py-2 rounded-xl select-none hover:bg-bg-muted/50 transition-colors"
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.accent || "hsl(var(--fg-subtle))" }} />
                <span className="flex-1 min-w-0 truncate text-sm">{c.name}</span>
                {/* open (red) / closed (green) */}
                <span className="inline-flex items-center gap-1 shrink-0">
                  <span className={cn("inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular",
                    c.open === 0 ? "bg-bg-subtle/60 text-fg-subtle" : "bg-danger-soft/70 text-danger")} title={`${c.open} open`}>{c.open}</span>
                  <span className={cn("inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular",
                    c.closed === 0 ? "bg-bg-subtle/60 text-fg-subtle" : "bg-success-soft/70 text-success")} title={`${c.closed} closed`}>{c.closed}</span>
                </span>
                {/* open button */}
                <button
                  type="button"
                  onClick={() => router.push(`/companies/${c.id}`)}
                  aria-label={`Open ${c.name}`}
                  className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-subtle hover:text-accent hover:bg-bg-muted transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-fg-subtle text-center pt-2">Hold a company for a quick look</p>
        </div>
      </details>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => router.push(`/companies/${peek.id}`) : undefined}
        title={peek?.name}
        subtitle={peek ? `${peek.open + peek.closed} tasks` : undefined}
        pills={peek ? (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPeekView("open"); }}
              className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tabular transition-all",
                peekView === "open" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger" : "bg-danger-soft/40 ring-1 ring-danger/20 text-danger/80 hover:ring-2")}
            >
              <span className="font-semibold">{peek.open}</span> open
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPeekView("closed"); }}
              className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tabular transition-all",
                peekView === "closed" ? "bg-success-soft/70 ring-2 ring-success/40 text-success" : "bg-success-soft/40 ring-1 ring-success/20 text-success/80 hover:ring-2")}
            >
              <span className="font-semibold">{peek.closed}</span> closed
            </button>
          </>
        ) : undefined}
        body={peek ? (
          titles.length > 0 ? (
            <span className="block space-y-1 max-h-48 overflow-y-auto pr-1">
              {titles.map((t, i) => (
                <span key={i} className="block truncate text-fg-muted">• {t}</span>
              ))}
              {total > titles.length && <span className="block text-fg-subtle">+ {total - titles.length} more</span>}
            </span>
          ) : (
            <span className="text-fg-subtle">{peekView === "open" ? "No open tasks 🎉" : "Nothing closed yet."}</span>
          )
        ) : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />
    </>
  );
}
