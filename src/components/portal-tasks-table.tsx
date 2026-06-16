"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Search, Users } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { TaskMetaLine, WaitingOnChip, PinnedMarker } from "@/components/task-meta-line";
import { TaskUpdateLine } from "@/components/task-update-line";
import { portalAddUpdate } from "@/app/portal/actions";
import { taskStatusTone as statusTone, priorityTone } from "@/lib/badge-tones";
import type { TaskRow } from "@/lib/queries";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Portal Tasks table — the staff/manager/director twin of the admin
 * Aurora task list. Rows carry the same rich preview as the admin redesign
 * (description + latest-activity line + waiting/pinned markers) and offer
 * ROLE-SCOPED in-row status moves. Read-only for everything else.
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
};

/** A portal viewer's role. Drives the in-row status set offered. */
export type PortalViewerRole = "staff" | "manager" | "hr" | "director";

const OPEN_EXCLUDED = ["Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const selectCls =
  "rounded-xl bg-bg-subtle ring-1 ring-border px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-accent/50";

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
    lastActivityISO: new Date(0).toISOString(),
  } as unknown as TaskRow;
}

/* ------------------------------------------------------------------ *
 * Role-scoped in-row status mover. Glass FluidSelect; posts via the portal
 * action with a small recorded note. Optimistic-feel (transition + refresh)
 * with a toast. No undo token (the portal action doesn't issue one) — but a
 * follow-up move is one tap away, and the change is fully audited.
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

  const allowedStatuses = viewerRole === "staff" ? STAFF_STATUSES : MANAGER_STATUSES;

  const companies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.companyName).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const now = new Date();
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope === "mine" && !r.mine) return false;
      if (scope === "raised" && !r.raisedByMe) return false;
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
    });
  }, [rows, q, scope, status, company, priority]);

  const scopeTabs: Array<{ key: Scope; label: string }> = [
    { key: "all", label: "All" },
    { key: "mine", label: "Assigned to me" },
    ...(canRaise ? [{ key: "raised" as Scope, label: "I raised" }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Scope tabs */}
      <div className="flex flex-wrap gap-1.5">
        {scopeTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              scope === t.key
                ? "bg-accent text-accent-fg"
                : "bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, task, person…"
            className="w-full rounded-xl bg-bg-subtle ring-1 ring-border pl-8 pr-3 py-1.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-accent/50"
          />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Status">
          <option value="open">Open</option>
          <option value="all">All statuses</option>
          <option value="done">Completed / Closed</option>
          <option value="In Progress">In Progress</option>
          <option value="Under Review">Under Review</option>
          <option value="Blocked">Blocked</option>
          <option value="Waiting External">Waiting External</option>
          <option value="Escalated">Escalated</option>
          <option value="Not Started">Not Started</option>
        </select>
        {companies.length > 1 && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={selectCls} aria-label="Company">
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-fg-subtle">{filtered.length} task{filtered.length === 1 ? "" : "s"}</p>

      {filtered.length === 0 ? (
        <Panel className="p-6 text-center text-sm text-fg-muted">No tasks match these filters.</Panel>
      ) : (
        <div className="flex flex-col gap-2">
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
                    <WaitingOnChip task={preview} on={t.ownerName} />
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
