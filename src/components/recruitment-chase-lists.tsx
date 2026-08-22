"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The three cross-cutting screens: what is sitting with a client, what is in the
// diary, and who is inside their first month.
//
// These are VIEWS OVER RELATIONSHIPS, not record types — none of them has a page
// of its own to open, because the thing you open is always the job order. That
// is why they build their `RecordList` columns here rather than earning an
// `ENTITY_VIEWS` entry: the metadata layer describes records with screens.
// They still get the column chooser, export and saved views through `listKey`.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { RecordList, type RecordFilter } from "./record-list";
import { useUrlFilters } from "@/lib/use-url-filters";
import {
  fmtDate, bothClocks, daysBetween, seniorityLabel,
  expectedCheckIns, checkInTally, guaranteeState, guaranteeDaysLeft,
  INTERVIEW_OUTCOMES,
} from "@/lib/recruitment-shared";
import { tzs, feeFor } from "@/lib/recruitment-money";

/* ═══════════════════════════════════════════════ sitting with the client ══ */

export type ChaseRow = {
  id: number;
  orderRef: string;
  orderTitle: string;
  clientName: string | null;
  candidateName: string;
  candidateSeniority: string | null;
  stage: string;
  sentToClientOn: string | null;
  matchNote: string | null;
};

export function ShortlistChaseList({ rows }: { rows: ChaseRow[] }) {
  const { values: f, set } = useUrlFilters({ stage: "all", q: "" }, { debounceKeys: ["q"] });
  const today = new Date();

  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (f.stage !== "all" && r.stage !== f.stage) return false;
      if (needle) {
        const hay = [r.candidateName, r.orderTitle, r.orderRef, r.clientName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, f]);

  // Longest wait first. A shortlist nobody has come back on is the thing this
  // screen exists to surface (DESIGN_SYSTEM.md §12 — worst first).
  const ranked = useMemo(
    () => [...shown].sort((a, b) => {
      const aw = a.sentToClientOn ? daysBetween(new Date(a.sentToClientOn), today) : -1;
      const bw = b.sentToClientOn ? daysBetween(new Date(b.sentToClientOn), today) : -1;
      return bw - aw;
    }),
    [shown], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rail: RecordFilter[] = useMemo(() => {
    const href = (patch: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...f, ...patch })) if (v && v !== "all" && v !== "") sp.set(k, v);
      const qs = sp.toString();
      return qs ? `/recruitment/shortlists?${qs}` : "/recruitment/shortlists";
    };
    return [
      { key: "all", label: "Everything", group: "Stage", count: rows.length, href: href({ stage: "all" }), active: f.stage === "all" },
      ...["Shortlisted", "Interviewing", "Offered"].map((s) => ({
        key: s, label: s, group: "Stage",
        count: rows.filter((r) => r.stage === s).length,
        href: href({ stage: s }), active: f.stage === s,
      })),
    ];
  }, [rows, f]);

  return (
    <div className="space-y-3">
      <input
        value={f.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder="Search candidates, roles, clients…"
        className="h-8 w-full rounded-md border border-border bg-bg-elev px-2.5 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
      />
      <RecordList
        rows={ranked}
        rowKey={(r) => r.id}
        rowHref={(r) => `/recruitment/orders/${encodeURIComponent(r.orderRef)}`}
        listKey="rec_shortlist_chase"
        filters={rail}
        total={rows.length}
        shown={ranked.length}
        empty={
          <div className="py-6 text-center">
            <p className="text-base font-medium">Nothing is sitting with a client</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Shortlists appear here the moment a candidate reaches &ldquo;Shortlisted&rdquo;.
            </p>
          </div>
        }
        columns={[
          {
            key: "candidate", label: "Candidate", width: "minmax(0,1fr)",
            render: (r) => (
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{r.candidateName}</span>
                <span className="block truncate text-xs text-fg-muted">
                  <span className="font-mono">{r.orderRef}</span> · {r.orderTitle}
                  {r.clientName ? ` · ${r.clientName}` : ""}
                </span>
              </span>
            ),
            csv: (r) => r.candidateName,
          },
          {
            key: "stage", label: "Stage", width: "130px", hideBelow: "sm",
            render: (r) => <span className="truncate text-sm">{r.stage}</span>,
            csv: (r) => r.stage,
          },
          {
            key: "waiting", label: "Waiting", width: "110px", align: "right",
            render: (r) => {
              if (!r.sentToClientOn) {
                return <span className="text-xs text-fg-subtle" title="Not marked as sent to the client yet">—</span>;
              }
              const days = daysBetween(new Date(r.sentToClientOn), new Date());
              return (
                <span
                  className={cn("tabular text-sm", days >= 14 ? "font-medium text-warn" : "")}
                  title={`Sent ${fmtDate(r.sentToClientOn)}`}
                >
                  {days} day{days === 1 ? "" : "s"}
                </span>
              );
            },
            csv: (r) => (r.sentToClientOn ? daysBetween(new Date(r.sentToClientOn), new Date()) : ""),
          },
          {
            key: "reasoning", label: "Reasoning", width: "96px", align: "right", hideBelow: "md",
            render: (r) => (r.matchNote
              ? <span className="text-xs text-success">Written</span>
              : <span className="text-xs font-medium text-warn">Missing</span>),
            csv: (r) => (r.matchNote ? "written" : "missing"),
          },
        ]}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ the diary ════ */

export type InterviewListRow = {
  id: number;
  orderRef: string;
  orderTitle: string;
  clientName: string | null;
  candidateName: string;
  kind: string;
  scheduledFor: string;
  outcome: string;
};

export function InterviewsList({ rows }: { rows: InterviewListRow[] }) {
  const { values: f, set } = useUrlFilters({ view: "upcoming", q: "" }, { debounceKeys: ["q"] });
  const now = new Date();

  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return rows.filter((r) => {
      const when = new Date(r.scheduledFor);
      if (f.view === "upcoming" && (when < now || r.outcome !== "Pending")) return false;
      if (f.view === "awaiting" && !(when < now && r.outcome === "Pending")) return false;
      if (f.view !== "all" && f.view !== "upcoming" && f.view !== "awaiting" && r.outcome !== f.view) return false;
      if (needle) {
        const hay = [r.candidateName, r.orderTitle, r.orderRef, r.clientName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const rail: RecordFilter[] = useMemo(() => {
    const href = (patch: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...f, ...patch })) if (v && v !== "all" && v !== "") sp.set(k, v);
      const qs = sp.toString();
      return qs ? `/recruitment/interviews?${qs}` : "/recruitment/interviews";
    };
    const awaiting = rows.filter((r) => new Date(r.scheduledFor) < now && r.outcome === "Pending").length;
    return [
      { key: "upcoming", label: "Coming up", group: "Diary", count: rows.filter((r) => new Date(r.scheduledFor) >= now && r.outcome === "Pending").length, href: href({ view: "upcoming" }), active: f.view === "upcoming" },
      { key: "awaiting", label: "Happened, no outcome", group: "Diary", count: awaiting, href: href({ view: "awaiting" }), active: f.view === "awaiting", tone: "warn" as const },
      { key: "all", label: "Everything", group: "Diary", count: rows.length, href: href({ view: "all" }), active: f.view === "all" },
      ...INTERVIEW_OUTCOMES.filter((o) => o !== "Pending").map((o) => ({
        key: o, label: o, group: "Outcome",
        count: rows.filter((r) => r.outcome === o).length,
        href: href({ view: o }), active: f.view === o,
      })),
    ];
  }, [rows, f]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <input
        value={f.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder="Search candidates, roles, clients…"
        className="h-8 w-full rounded-md border border-border bg-bg-elev px-2.5 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
      />
      <RecordList
        rows={shown}
        rowKey={(r) => r.id}
        rowHref={(r) => `/recruitment/orders/${encodeURIComponent(r.orderRef)}`}
        listKey="rec_interviews"
        filters={rail}
        total={rows.length}
        shown={shown.length}
        empty={
          <div className="py-6 text-center">
            <p className="text-base font-medium">Nothing in the diary</p>
            <p className="mt-1 text-sm text-fg-subtle">Book interviews from a job order&rsquo;s shortlist.</p>
          </div>
        }
        columns={[
          {
            key: "who", label: "Interview", width: "minmax(0,1fr)",
            render: (r) => (
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{r.candidateName}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {r.kind} · <span className="font-mono">{r.orderRef}</span> · {r.orderTitle}
                </span>
              </span>
            ),
            csv: (r) => r.candidateName,
          },
          {
            key: "when", label: "When", width: "200px",
            render: (r) => (
              <span className="min-w-0">
                <span className="block truncate text-sm">{fmtDate(r.scheduledFor)}</span>
                {/* Both clocks: coordinating across the time difference IS the job. */}
                <span className="block truncate text-xs text-fg-muted">{bothClocks(r.scheduledFor)}</span>
              </span>
            ),
            csv: (r) => r.scheduledFor,
          },
          {
            key: "outcome", label: "Outcome", width: "110px", align: "right", hideBelow: "sm",
            render: (r) => {
              const late = r.outcome === "Pending" && new Date(r.scheduledFor) < new Date();
              return (
                <span className={cn("text-sm", late && "font-medium text-warn")}>
                  {late ? "No outcome" : r.outcome}
                </span>
              );
            },
            csv: (r) => r.outcome,
          },
        ]}
      />
    </div>
  );
}

/* ═════════════════════════════════════════════════════ the first month ═══ */

export type PlacementListRow = {
  id: number;
  orderRef: string;
  orderTitle: string;
  clientName: string | null;
  candidateName: string;
  acceptedOn: string;
  startedOn: string | null;
  endedOn: string | null;
  monthlyGrossUsd: string | null;
  checkIns: { day: number; party: string }[];
};

export function PlacementsList({ rows }: { rows: PlacementListRow[] }) {
  const { values: f, set } = useUrlFilters({ view: "all", q: "" }, { debounceKeys: ["q"] });

  const enriched = useMemo(
    () => rows.map((r) => {
      const state = guaranteeState(r.startedOn, r.endedOn);
      const tally = checkInTally(expectedCheckIns(r.startedOn, r.checkIns));
      return { ...r, state, tally };
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return enriched.filter((r) => {
      if (f.view === "live" && r.state !== "live") return false;
      if (f.view === "notStarted" && r.state !== "notStarted") return false;
      if (f.view === "failed" && r.state !== "failed") return false;
      if (f.view === "owed" && r.tally.overdue === 0) return false;
      if (needle) {
        const hay = [r.candidateName, r.orderTitle, r.orderRef, r.clientName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [enriched, f]);

  // Whoever is owed the most conversations, first.
  const ranked = useMemo(
    () => [...shown].sort((a, b) => b.tally.overdue - a.tally.overdue || b.tally.owed - a.tally.owed),
    [shown],
  );

  const rail: RecordFilter[] = useMemo(() => {
    const href = (patch: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...f, ...patch })) if (v && v !== "all" && v !== "") sp.set(k, v);
      const qs = sp.toString();
      return qs ? `/recruitment/placements?${qs}` : "/recruitment/placements";
    };
    return [
      { key: "all", label: "Everyone placed", group: "Guarantee", count: enriched.length, href: href({ view: "all" }), active: f.view === "all" },
      { key: "live", label: "Inside the first month", group: "Guarantee", count: enriched.filter((r) => r.state === "live").length, href: href({ view: "live" }), active: f.view === "live" },
      { key: "notStarted", label: "Accepted, not started", group: "Guarantee", count: enriched.filter((r) => r.state === "notStarted").length, href: href({ view: "notStarted" }), active: f.view === "notStarted" },
      { key: "failed", label: "Ended early", group: "Guarantee", count: enriched.filter((r) => r.state === "failed").length, href: href({ view: "failed" }), active: f.view === "failed", tone: "danger" as const },
      { key: "owed", label: "Check-ins overdue", group: "Attention", count: enriched.filter((r) => r.tally.overdue > 0).length, href: href({ view: "owed" }), active: f.view === "owed", tone: "warn" as const },
    ];
  }, [enriched, f]);

  return (
    <div className="space-y-3">
      <input
        value={f.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder="Search placements…"
        className="h-8 w-full rounded-md border border-border bg-bg-elev px-2.5 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
      />
      <RecordList
        rows={ranked}
        rowKey={(r) => r.id}
        rowHref={(r) => `/recruitment/orders/${encodeURIComponent(r.orderRef)}`}
        listKey="rec_placements"
        filters={rail}
        total={enriched.length}
        shown={ranked.length}
        empty={
          <div className="py-6 text-center">
            <p className="text-base font-medium">Nobody placed yet</p>
            <p className="mt-1 text-sm text-fg-subtle">
              A placement appears here the moment an offer is accepted on a job order.
            </p>
          </div>
        }
        columns={[
          {
            key: "who", label: "Placement", width: "minmax(0,1fr)",
            render: (r) => (
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{r.candidateName}</span>
                <span className="block truncate text-xs text-fg-muted">
                  <span className="font-mono">{r.orderRef}</span> · {r.orderTitle}
                  {r.clientName ? ` · ${r.clientName}` : ""}
                </span>
              </span>
            ),
            csv: (r) => r.candidateName,
          },
          {
            key: "state", label: "Guarantee", width: "150px", hideBelow: "sm",
            render: (r) => {
              if (r.state === "failed") return <span className="text-sm font-medium text-danger">Ended early</span>;
              if (r.state === "notStarted") return <span className="text-sm text-fg-muted">Not started</span>;
              if (r.state === "lapsed") return <span className="text-sm text-success">Ran clean</span>;
              const left = guaranteeDaysLeft(r.startedOn);
              return <span className="text-sm text-warn">{left} day{left === 1 ? "" : "s"} left</span>;
            },
            csv: (r) => r.state,
          },
          {
            key: "checkins", label: "Check-ins", width: "110px", align: "right",
            render: (r) => {
              if (!r.startedOn) return <span className="text-xs text-fg-subtle">—</span>;
              return (
                <span
                  className={cn("tabular text-sm", r.tally.overdue > 0 && "font-medium text-warn")}
                  title={r.tally.overdue > 0 ? `${r.tally.overdue} overdue` : "Nothing overdue"}
                >
                  {r.tally.done}/6
                </span>
              );
            },
            csv: (r) => `${r.tally.done}/6`,
          },
          {
            key: "fee", label: "Fee (TZS)", width: "116px", align: "right", hideBelow: "md",
            render: (r) => {
              const fee = feeFor(r.monthlyGrossUsd);
              return <span className="tabular text-sm">{fee ? tzs(fee.netTZS) : "—"}</span>;
            },
            csv: (r) => feeFor(r.monthlyGrossUsd)?.netTZS ?? "",
          },
        ]}
      />
    </div>
  );
}
