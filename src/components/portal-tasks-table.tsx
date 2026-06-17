"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Check, ExternalLink, MessageSquare, MoreHorizontal, Users } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { Badge, IconButton, SearchInput } from "@/components/ui";
import { Segmented, type SegmentOption } from "@/components/macos";
import { Reveal } from "@/components/reveal";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { TaskMetaLine, WaitingOnChip, PinnedMarker } from "@/components/task-meta-line";
import { TaskUpdateLine } from "@/components/task-update-line";
import { portalAddUpdate } from "@/app/portal/actions";
import { taskStatusTone as statusTone, priorityTone } from "@/lib/badge-tones";
import { spring } from "@/lib/motion";
import type { TaskRow } from "@/lib/queries";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Portal Tasks table — the staff/manager/director twin of the admin
 * Aurora task list. Rows carry the same rich preview as the admin redesign
 * (description + latest-activity line + waiting/pinned markers) and offer
 * ROLE-SCOPED in-row status moves. Read-only for everything else.
 *
 * ⚠ TWIN: keep the row line order/feel in visual sync with the admin list
 * (src/components/table-view.tsx). They are deliberately NOT a shared
 * component (the admin row pulls admin-only actions) — when you change one
 * row's layout, change the other to match (CLAUDE.md "Staff Portal Parity").
 *
 * The in-row status mover posts through the existing `portalAddUpdate`
 * action (the only portal status-move path) — it never touches the admin
 * `inlineUpdateTask`, so it can't widen a staff member's permissions. The
 * server re-checks the allowed set regardless of what the UI offers.
 * ------------------------------------------------------------------ */

export type PortalTaskRow = {
  id: number;
  code: string;
  actionItem: string;
  status: string;
  priority: string;
  deadline: string | null;
  companyName: string | null;
  ownerName: string | null;
  teamSize: number;
  mine: boolean;
  raisedByMe: boolean;
  /* --- Optional Aurora preview enrichment (graceful when absent) ---
   * The host can populate these to light up the rich preview. When they're
   * undefined the row still renders cleanly (waiting/markers derive from
   * the data we always have). */
  description?: string | null;
  latestActivity?: TaskRow["latestActivity"];
  updateCount?: number;
  pinned?: boolean;
  /** Newest signal of life (latest update, else a deadline anchor). Drives the
   *  "quiet for Nd" stale hint on line 4. Null/absent → no false stale hint. */
  lastActivityISO?: string | null;
};

/** A portal viewer's role. Drives the in-row status set offered. */
export type PortalViewerRole = "staff" | "manager" | "hr" | "director";

const OPEN_EXCLUDED = ["Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

// Mirrors the server rules in src/app/portal/actions.ts — staff signal "done"
// via Under Review; managers/HR/directors may complete outright. The server is
// the hard gate; this only keeps the UI honest.
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

type Scope = "all" | "mine" | "raised";

/** Shape a lean PortalTaskRow into the TaskRow fields the shared Aurora preview
 *  components read. `waiting` is derived from status so the chip works even when
 *  the host hasn't sent the richer fields yet. */
function asPreview(t: PortalTaskRow): TaskRow {
  return {
    comments: t.description ?? null,
    latestActivity: t.latestActivity ?? null,
    updateCount: t.updateCount ?? 0,
    pinned: t.pinned ?? false,
    waiting: t.status === "Blocked" || t.status === "Waiting External",
    status: t.status,
    // Real signal of life when the host sent it; otherwise "now" so the stale
    // hint shows "No updates yet" with no bogus "quiet for ~20000d" from epoch 0.
    lastActivityISO: t.lastActivityISO ?? new Date().toISOString(),
  } as unknown as TaskRow;
}

/* ------------------------------------------------------------------ *
 * Role-scoped in-row status mover. Glass FluidSelect; posts via the portal
 * action with a small recorded note. Optimistic-feel (transition + refresh)
 * with a toast.
 *
 * T-PORTAL-UNDO (deferred — no in-row undo): `portalAddUpdate` is the shared
 * portal status-move path (also used by the conversation view) and returns
 * void. Adding an undo token would mean reverting the status AND soft-deleting
 * the auto "Moved to X." update + threading a token back through every caller —
 * non-trivial and touches a shared write path, so it's intentionally left out.
 * Mitigation: a follow-up move is one tap away and the change is fully audited.
 * ------------------------------------------------------------------ */
function PortalInlineStatus({
  row,
  allowed,
}: {
  row: PortalTaskRow;
  allowed: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  // The viewer's allowed moves, minus the current status, in canonical order.
  const options: FluidOption[] = useMemo(
    () =>
      allowed
        .filter((s) => s !== row.status)
        .map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] })),
    [allowed, row.status],
  );

  // The current status is always shown as the trigger value — but it might not
  // be in `allowed` (e.g. "Not Started"), so include it as a non-selectable head.
  const display: FluidOption[] = useMemo(() => {
    const head: FluidOption = { value: row.status, label: row.status, dot: STATUS_DOT[row.status] };
    return [head, ...options];
  }, [row.status, options]);

  function move(next: string) {
    if (next === row.status || !allowed.includes(next)) return;
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", String(row.id));
      fd.set("code", row.code);
      fd.set("body", `Moved to ${next}.`);
      fd.set("newStatus", next);
      try {
        await portalAddUpdate(fd);
        toast(`Moved to ${next}.`, { tone: "success" });
        router.refresh();
      } catch {
        toast("Couldn't change the status. Try again.", { tone: "danger" });
      }
    });
  }

  return (
    <span
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className={pending ? "opacity-60 pointer-events-none" : undefined}
    >
      <FluidSelect
        value={row.status}
        options={display}
        onSelect={move}
        align="right"
        buttonClassName="px-2.5 py-1 text-xs"
      />
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Portal-safe trailing "…" menu. Strictly read/navigate plus, for managers+,
 * a Complete shortcut — NEVER delete/escalate/pin (those are admin-only and
 * would widen a staff member's reach). The Complete item posts through the
 * same audited `portalAddUpdate` path as the in-row mover; the server re-checks
 * the role regardless of what we offer here.
 * ------------------------------------------------------------------ */
function PortalRowMenu({ row, canComplete }: { row: PortalTaskRow; canComplete: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closed = OPEN_EXCLUDED.includes(row.status);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 200;
      let left = r.right - w;
      if (left < 8) left = 8;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      setPos({ top: r.bottom + 6, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function complete() {
    setOpen(false);
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", String(row.id));
      fd.set("code", row.code);
      fd.set("body", "Moved to Completed.");
      fd.set("newStatus", "Completed");
      try {
        await portalAddUpdate(fd);
        toast(`${row.code} completed.`, { tone: "success" });
        router.refresh();
      } catch {
        toast("Couldn't complete the task. Try again.", { tone: "danger" });
      }
    });
  }

  return (
    <div
      className="inline-flex items-center"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <IconButton
        ref={btnRef}
        size="sm"
        variant="ghost"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={15} />
      </IconButton>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              role="menu"
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -2 }}
              transition={spring}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
              className="fixed z-[120] w-[200px] glass glass-menu elevated rounded-xl shadow-lg p-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {canComplete && !closed && (
                <>
                  <PortalMenuButton icon={<Check size={14} />} onClick={complete}>Mark complete</PortalMenuButton>
                  <div className="my-1 h-px bg-border/60" />
                </>
              )}
              <PortalMenuLink href={`/portal/task/${row.code}`} icon={<ExternalLink size={14} />} onNavigate={() => setOpen(false)}>Open</PortalMenuLink>
              <PortalMenuLink href={`/portal/task/${row.code}#conversation`} icon={<MessageSquare size={14} />} onNavigate={() => setOpen(false)}>Open conversation</PortalMenuLink>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function PortalMenuButton({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 text-left text-sm px-2.5 py-2 rounded-lg transition-colors text-fg-muted hover:bg-bg-muted hover:text-fg"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

function PortalMenuLink({ href, icon, children, onNavigate }: { href: string; icon: React.ReactNode; children: React.ReactNode; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="w-full flex items-center gap-2.5 text-left text-sm px-2.5 py-2 rounded-lg transition-colors text-fg-muted hover:bg-bg-muted hover:text-fg"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
    </Link>
  );
}

export function PortalTasksTable({
  rows,
  canRaise,
  viewerRole = "staff",
}: {
  rows: PortalTaskRow[];
  canRaise: boolean;
  /** The signed-in person's role — gates the in-row status set. Defaults to the
   *  most restrictive (staff); the server enforces the real limit regardless. */
  viewerRole?: PortalViewerRole;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState("open");
  const [company, setCompany] = useState("");
  const [priority, setPriority] = useState("");
  // Quick-filter chips set the dropdowns underneath; `overdueOnly` is the one
  // axis the status dropdown can't express (overdue is derived from deadline).
  const [overdueOnly, setOverdueOnly] = useState(false);

  const allowedStatuses = viewerRole === "staff" ? STAFF_STATUSES : MANAGER_STATUSES;
  // Managers / HR / directors may complete a task outright (the server is the
  // hard gate). Staff never get a Complete shortcut anywhere.
  const canComplete = viewerRole !== "staff";

  const companies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.companyName).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const now = new Date();
  const nowMs = now.getTime();
  const isOverdue = (r: PortalTaskRow) =>
    !!r.deadline && new Date(r.deadline).getTime() < nowMs && !OPEN_EXCLUDED.includes(r.status);

  // Counts for the quick-filter chips — always over the scoped (not chip-filtered)
  // set so the numbers stay stable as you toggle chips.
  const counts = useMemo(() => {
    const inScope = rows.filter((r) => (scope === "mine" ? r.mine : scope === "raised" ? r.raisedByMe : true));
    let open = 0, overdue = 0, blocked = 0, done = 0;
    for (const r of inScope) {
      if (OPEN_EXCLUDED.includes(r.status)) { done++; continue; }
      open++;
      if (r.status === "Blocked" || r.status === "Escalated") blocked++;
      if (isOverdue(r)) overdue++;
    }
    return { open, overdue, blocked, done };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scope, nowMs]);

  // Attention rank for "needs you first" ordering: overdue, then blocked/
  // escalated, then everything else; ties broken by soonest deadline.
  const attentionRank = (r: PortalTaskRow) =>
    isOverdue(r) ? 0 : r.status === "Blocked" || r.status === "Escalated" ? 1 : 2;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (scope === "mine" && !r.mine) return false;
        if (scope === "raised" && !r.raisedByMe) return false;
        if (overdueOnly && !isOverdue(r)) return false;
        if (status === "open" && OPEN_EXCLUDED.includes(r.status)) return false;
        if (status === "done" && !OPEN_EXCLUDED.includes(r.status)) return false;
        if (status !== "open" && status !== "done" && status !== "all" && r.status !== status) return false;
        if (company && r.companyName !== company) return false;
        if (priority && r.priority !== priority) return false;
        if (term) {
          const hay = `${r.code} ${r.actionItem} ${r.ownerName ?? ""} ${r.companyName ?? ""}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ra = attentionRank(a), rb = attentionRank(b);
        if (ra !== rb) return ra - rb;
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return da - db;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, scope, status, company, priority, overdueOnly, nowMs]);

  // The quick chips: each sets the underlying dropdowns. `active` derives from
  // current state so the chip row and the dropdowns never disagree.
  const chips: Array<{ key: string; label: string; count: number; tone: "accent" | "danger" | "warn" | "muted"; active: boolean; apply: () => void }> = [
    { key: "open", label: "Open", count: counts.open, tone: "accent", active: status === "open" && !overdueOnly, apply: () => { setStatus("open"); setOverdueOnly(false); } },
    { key: "overdue", label: "Overdue", count: counts.overdue, tone: "danger", active: overdueOnly, apply: () => { setStatus("open"); setOverdueOnly(true); } },
    { key: "blocked", label: "Blocked", count: counts.blocked, tone: "warn", active: status === "Blocked" && !overdueOnly, apply: () => { setStatus("Blocked"); setOverdueOnly(false); } },
    { key: "done", label: "Done", count: counts.done, tone: "muted", active: status === "done" && !overdueOnly, apply: () => { setStatus("done"); setOverdueOnly(false); } },
  ];
  const CHIP_TONE: Record<string, { on: string; off: string }> = {
    accent: { on: "bg-accent text-white ring-accent", off: "text-accent ring-accent/30 hover:bg-accent-soft/40" },
    danger: { on: "bg-danger text-white ring-danger", off: "text-danger ring-danger/30 hover:bg-danger-soft/40" },
    warn: { on: "bg-warn text-white ring-warn", off: "text-warn ring-warn/30 hover:bg-warn-soft/40" },
    muted: { on: "bg-fg-muted text-white ring-fg-muted", off: "text-fg-muted ring-border hover:bg-bg-muted" },
  };

  const scopeTabs: SegmentOption<Scope>[] = [
    { value: "all", label: "All" },
    { value: "mine", label: "Assigned to me" },
    ...(canRaise ? [{ value: "raised" as Scope, label: "I raised" }] : []),
  ];

  // Aurora dropdown options. Status carries the same status dots as the in-row
  // mover so the filter reads at a glance.
  const statusOptions: FluidOption[] = [
    { value: "open", label: "Open" },
    { value: "all", label: "All statuses" },
    { value: "done", label: "Completed / Closed" },
    { value: "In Progress", label: "In Progress", dot: STATUS_DOT["In Progress"] },
    { value: "Under Review", label: "Under Review", dot: STATUS_DOT["Under Review"] },
    { value: "Blocked", label: "Blocked", dot: STATUS_DOT.Blocked },
    { value: "Waiting External", label: "Waiting External", dot: STATUS_DOT["Waiting External"] },
    { value: "Escalated", label: "Escalated", dot: STATUS_DOT.Escalated },
    { value: "Not Started", label: "Not Started", dot: STATUS_DOT["Not Started"] },
  ];
  const companyOptions: FluidOption[] = [
    { value: "", label: "All companies" },
    ...companies.map((c) => ({ value: c, label: c })),
  ];
  const priorityOptions: FluidOption[] = [
    { value: "", label: "Any priority" },
    ...PRIORITIES.map((p) => ({ value: p, label: p })),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Quick-filter chips — one-tap presets with live counts. */}
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => {
          const t = CHIP_TONE[c.tone];
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.apply}
              aria-pressed={c.active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
                c.active ? t.on : `bg-bg-elev ${t.off}`,
              )}
            >
              {c.label}
              <span className={cn("tabular", c.active ? "opacity-90" : "opacity-70")}>{c.count}</span>
            </button>
          );
        })}
      </div>

      {/* Scope tabs — Aurora segmented control */}
      <Segmented value={scope} onChange={setScope} options={scopeTabs} className="self-start" />

      {/* Filters — Aurora search + glass dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code, task, person…"
          aria-label="Search tasks"
          wrapperClassName="flex-1 min-w-[12rem]"
        />
        <FluidSelect value={status} options={statusOptions} onSelect={setStatus} buttonClassName="text-xs" />
        {companies.length > 1 && (
          <FluidSelect value={company} options={companyOptions} onSelect={setCompany} buttonClassName="text-xs" />
        )}
        <FluidSelect value={priority} options={priorityOptions} onSelect={setPriority} buttonClassName="text-xs" />
      </div>

      <p className="text-[11px] text-fg-subtle">{filtered.length} task{filtered.length === 1 ? "" : "s"}</p>

      {filtered.length === 0 ? (
        <Panel className="p-6 text-center text-sm text-fg-muted">No tasks match these filters.</Panel>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
          {filtered.map((t, i) => {
            const closed = OPEN_EXCLUDED.includes(t.status);
            const od = t.deadline && new Date(t.deadline) < now && !closed;
            const preview = asPreview(t);
            // Only offer an in-row move when there's somewhere this viewer may go.
            const canMove = !closed && allowedStatuses.some((s) => s !== t.status);
            return (
              <Reveal key={t.id} delay={Math.min(i, 8) * 0.02}>
                <Panel className={cn("p-3.5 transition-shadow hover:ring-accent/40", closed && "opacity-70")}>
                  {/* Line 1: code · company · markers — status (editable for some) + priority */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/portal/task/${t.code}`} className="inline-flex items-center gap-1.5 min-w-0 group">
                      <span className="text-xs font-semibold tabular text-fg-muted group-hover:text-fg transition-colors">{t.code}</span>
                      {t.companyName && <span className="text-xs text-fg-subtle truncate">· {t.companyName}</span>}
                    </Link>
                    <PinnedMarker task={preview} />
                    {t.raisedByMe && <Badge tone="default">Raised by me</Badge>}
                    <span className="grow" />
                    {canMove ? (
                      <PortalInlineStatus row={t} allowed={allowedStatuses} />
                    ) : (
                      <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    )}
                    <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                    {/* Portal-safe trailing menu — Open / conversation, plus a
                        Complete shortcut for managers+ (never delete/escalate). */}
                    <PortalRowMenu row={t} canComplete={canComplete} />
                  </div>

                  {/* Line 2: the task title — taps through to the detail page */}
                  <Link href={`/portal/task/${t.code}`} className="block group">
                    <p className="mt-1.5 text-sm font-medium leading-snug group-hover:text-accent transition-colors">{t.actionItem}</p>
                  </Link>

                  {/* Line 3: the "About" description (when present) */}
                  <TaskMetaLine task={preview} className="mt-1.5" />

                  {/* Line 4: latest-activity line → taps to the conversation */}
                  <Link href={`/portal/task/${t.code}#conversation`} className="mt-1.5 block w-fit max-w-full">
                    <TaskUpdateLine task={preview} />
                  </Link>

                  {/* Line 5: owner / team / deadline / waiting */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                    {/* No `on=` — the owner isn't the blocker; let the chip
                        use its neutral "a blocker" / "an external party" copy. */}
                    <WaitingOnChip task={preview} />
                    {t.ownerName && <span>Owner: {t.ownerName}</span>}
                    {t.teamSize > 1 && (
                      <span>
                        <Users size={12} className="mr-1 inline -mt-px" />
                        Team of {t.teamSize}
                      </span>
                    )}
                    {t.deadline && (
                      <span className={od ? "text-danger font-medium" : undefined}>
                        <CalendarDays size={12} className="mr-1 inline -mt-px" />
                        Due {new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {od ? " · overdue" : ""}
                      </span>
                    )}
                  </div>
                </Panel>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
