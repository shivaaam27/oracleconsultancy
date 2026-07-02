"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { useAnchored } from "@/lib/use-anchored";
import { portalCopyTaskToCompany, portalDeleteTask } from "@/app/portal/actions";
import type { BoardCompany } from "@/components/director-board-client";
import { cn } from "@/lib/cn";

/* Fan-out company control (group director / HR). The task's OWN company is
 * always ticked + locked (this is where the task lives — keeps ≥1). Ticking
 * another company creates an independent COPY there; unticking a copy made in
 * this session archives it. Mirrors the multi-company create, applied to edit. */

const fieldShell = "rounded-lg bg-bg-elev ring-1 ring-border";

export function TaskCopyToCompanies({
  taskId, currentCompanyId, currentCompanyName, companies,
}: {
  taskId: number;
  currentCompanyId: number | null;
  currentCompanyName: string;
  companies: BoardCompany[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Companies this task was copied INTO during this session → their new task id.
  const [copies, setCopies] = useState<Record<number, { taskId: number; code: string }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchored(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const nameById = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const copyCount = Object.keys(copies).length;
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, q]);

  function toggle(companyId: number) {
    if (companyId === currentCompanyId) return; // the task's own company is locked
    const name = nameById.get(companyId) ?? "that company";
    setBusyId(companyId);
    if (copies[companyId]) {
      // Untick → archive the copy created this session.
      start(async () => {
        const res = await portalDeleteTask(copies[companyId].taskId);
        setBusyId(null);
        if (res?.error) { toast(res.error, { tone: "danger" }); return; }
        setCopies((c) => { const n = { ...c }; delete n[companyId]; return n; });
        toast(`Removed the copy in ${name}.`, { tone: "success" });
        router.refresh();
      });
    } else {
      // Tick → create an independent copy there.
      start(async () => {
        const res = await portalCopyTaskToCompany(taskId, companyId);
        setBusyId(null);
        if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
        setCopies((c) => ({ ...c, [companyId]: { taskId: res.taskId, code: res.code } }));
        toast(`Copied to ${name} · ${res.code}`, { tone: "success" });
        router.refresh();
      });
    }
  }

  const summary = copyCount === 0 ? currentCompanyName : `${currentCompanyName} +${copyCount}`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(fieldShell, "flex w-full items-center justify-between gap-2 px-3 py-2 text-[12px] transition-colors hover:bg-bg-muted")}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 size={14} className="shrink-0 text-fg-muted" />
          <span className="truncate text-fg">{summary}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-lg"
          style={{
            left: anchor.left,
            width: Math.max(anchor.width, 240),
            ...(anchor.openUp ? { bottom: window.innerHeight - anchor.top + 6 } : { top: anchor.top + 6 }),
          }}
        >
          <p className="border-b border-border/60 px-3 py-2 text-[11px] text-fg-muted">Tick a company to create a copy of this task there.</p>
          <label className="relative block border-b border-border/60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm placeholder:text-fg-muted focus:outline-none" />
          </label>
          <ul className="overflow-y-auto py-1" style={{ maxHeight: anchor.maxHeight }}>
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">No matches.</li>}
            {filtered.map((c) => {
              const isCurrent = c.id === currentCompanyId;
              const on = isCurrent || !!copies[c.id];
              const rowBusy = busyId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    disabled={isCurrent || rowBusy}
                    title={isCurrent ? "This task lives here" : undefined}
                    className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-muted/60 disabled:cursor-default", on ? "text-accent" : "text-fg")}
                  >
                    <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1", on ? "bg-accent text-accent-fg ring-accent" : "ring-border")}>
                      {rowBusy ? <Loader2 size={11} className="animate-spin" /> : on && <Check size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {isCurrent && <span className="shrink-0 rounded-full bg-bg-subtle px-1.5 py-0.5 text-[10px] text-fg-subtle">current</span>}
                    {copies[c.id] && <span className="shrink-0 font-mono text-[10px] text-fg-subtle">{copies[c.id].code}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
