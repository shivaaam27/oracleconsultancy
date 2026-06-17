"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, MessageSquarePlus, Send, Loader2, Users, ExternalLink, CheckCircle2 } from "lucide-react";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { CaretInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CompleteTaskSheet } from "@/components/complete-task-sheet";
import { portalAddUpdate } from "@/app/portal/actions";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Portal task card — the staff/manager Home "My tasks" row, iPhone-Aurora.
 * Glass card with a status/priority rail; tap to expand a role-scoped status
 * mover + an inline "Add an update…" (so staff act without opening the task);
 * swipe-left reveals a quick Update. Everything posts through the role-gated
 * `portalAddUpdate` — the server re-checks the allowed status set, so the UI
 * can never widen a staff member's reach.
 *
 * Completing a task is NOT offered here — that goes through the secure
 * completion gate (requires an explanation update) added separately.
 * ------------------------------------------------------------------ */

export type PortalCardTask = {
  id: number;
  code: string;
  actionItem: string;
  status: string;
  priority: string;
  deadline: string | null;
  companyName: string | null;
  companyAccent?: string | null;
  teamSize: number;
  latestUpdate?: string | null;
  requiresAttachment?: boolean;
};

const STAFF_STATUSES = ["In Progress", "Under Review", "Blocked"];
const MANAGER_STATUSES = [...STAFF_STATUSES, "Completed"];
const STATUS_DOT: Record<string, string> = {
  "Not Started": "hsl(var(--fg-subtle))",
  "In Progress": "hsl(var(--info))",
  "Under Review": "hsl(var(--warn))",
  "Waiting External": "hsl(var(--warn))",
  Blocked: "hsl(var(--danger))",
  Escalated: "hsl(var(--danger))",
  Completed: "hsl(var(--success))",
  Closed: "hsl(var(--success))",
};
function statusDotClass(s: string): string {
  if (s === "Completed" || s === "Closed") return "bg-success";
  if (s === "Blocked" || s === "Escalated") return "bg-danger";
  if (s === "Waiting External" || s === "Under Review") return "bg-warn";
  if (s === "In Progress") return "bg-info";
  return "bg-fg-subtle";
}

export function PortalTaskCard({ task: t, viewerRole }: { task: PortalCardTask; viewerRole: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [updateBody, setUpdateBody] = useState("");
  const [busy, start] = useTransition();
  // Swipe-left → Update (82px right tray); swipe-right → Complete (86px left tray).
  // Axis-locked + finger-following so a vertical scroll never opens a tray.
  const swipe = useSwipeRow({ leftWidth: 86, rightWidth: 82 });

  const now = new Date();
  const overdue = !!t.deadline && new Date(t.deadline) < now;
  const allowed = viewerRole === "staff" ? STAFF_STATUSES : MANAGER_STATUSES;
  const statusOptions: FluidOption[] = [
    { value: t.status, label: t.status, dot: STATUS_DOT[t.status] },
    ...allowed.filter((s) => s !== t.status).map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] })),
  ];

  function changeStatus(next: string) {
    if (next === t.status || !allowed.includes(next)) return;
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", String(t.id));
      fd.set("code", t.code);
      fd.set("body", `Moved to ${next}.`);
      fd.set("newStatus", next);
      try { await portalAddUpdate(fd); toast(`Moved to ${next}.`, { tone: "success" }); router.refresh(); }
      catch { toast("Couldn't change the status.", { tone: "danger" }); }
    });
  }
  function postUpdate() {
    const body = updateBody.trim();
    if (!body) return;
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", String(t.id));
      fd.set("code", t.code);
      fd.set("body", body);
      try { await portalAddUpdate(fd); setUpdateBody(""); toast("Update posted.", { tone: "success" }); router.refresh(); }
      catch { toast("Couldn't post the update.", { tone: "danger" }); }
    });
  }

  const dueTone = overdue ? "text-danger" : "text-fg-subtle";

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe-left → quick Update */}
      <button
        type="button"
        onClick={() => { swipe.reset(); setOpen(true); }}
        className="absolute inset-y-0 right-0 flex w-[82px] flex-col items-center justify-center gap-1 bg-accent-soft text-[11px] font-medium text-accent"
      >
        <MessageSquarePlus size={17} /> Update
      </button>
      {/* Swipe-right → secure Complete (opens the gated sheet) */}
      <button
        type="button"
        onClick={() => { swipe.reset(); setCompleteOpen(true); }}
        className="absolute inset-y-0 left-0 flex w-[86px] flex-col items-center justify-center gap-1 bg-success-soft text-[11px] font-medium text-success"
      >
        <CheckCircle2 size={18} /> Complete
      </button>

      <div
        {...swipe.bind}
        className="relative touch-pan-y rounded-2xl bg-bg-elev ring-1 ring-border transition-transform duration-300"
        style={{ transform: `translateX(${swipe.offset}px)`, transition: swipe.dragging ? "none" : undefined }}
      >
        <button
          type="button"
          onClick={() => { if (swipe.swiped) { swipe.reset(); return; } setOpen((o) => !o); }}
          className="flex w-full items-stretch gap-3 text-left"
        >
          <span className={`w-1 shrink-0 rounded-l-2xl ${overdue ? "bg-danger" : statusDotClass(t.status)}`} />
          <span className="min-w-0 flex-1 py-3">
            <span className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-bg-subtle/70 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted ring-1 ring-border/50">{t.code}</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted"><span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(t.status)}`} />{t.status}</span>
              {t.deadline && (
                <span className={`text-[11px] ${dueTone}`}>
                  · {new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{overdue ? " · overdue" : ""}
                </span>
              )}
            </span>
            <span className="block truncate text-sm font-medium">{t.actionItem}</span>
            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-fg-subtle">
              {t.companyName && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.companyAccent || "var(--border)" }} />}
              {[t.companyName, t.teamSize > 1 ? `Team of ${t.teamSize}` : null].filter(Boolean).join(" · ")}
            </span>
            {t.latestUpdate && <span className="mt-1 block truncate text-[11px] text-fg-muted">“{t.latestUpdate}”</span>}
          </span>
          <span className="mr-2.5 flex shrink-0 items-center">
            <ChevronRight size={16} className={`text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
          </span>
        </button>

        {open && (
          <div className="space-y-3 border-t border-border/50 p-3.5">
            <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
              Status
              <FluidSelect value={t.status} options={statusOptions} onSelect={changeStatus} buttonClassName="rounded-xl bg-bg-subtle/60 ring-1 ring-border" />
            </label>
            <div className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
              <MessageSquarePlus size={15} className="shrink-0 text-accent" />
              <CaretInput
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); postUpdate(); } }}
                placeholder="Add an update…"
                className="py-2 text-sm"
              />
              <button type="button" onClick={postUpdate} disabled={busy || !updateBody.trim()} aria-label="Post update" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              {t.teamSize > 1 && <span className="inline-flex items-center gap-1"><Users size={13} /> Team of {t.teamSize}</span>}
              {t.deadline && <span className={overdue ? "text-danger" : undefined}><CalendarDays size={12} className="mr-1 inline -mt-px" />Due {new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
              <Link href={`/portal/task/${t.code}`} className="ml-auto inline-flex items-center gap-1.5 text-accent hover:underline">
                Open <ExternalLink size={13} />
              </Link>
            </div>
          </div>
        )}
      </div>

      <CompleteTaskSheet
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        taskId={t.id}
        code={t.code}
        requiresAttachment={t.requiresAttachment}
      />
    </div>
  );
}
