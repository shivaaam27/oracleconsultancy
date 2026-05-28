/**
 * Shared types + helpers for the per-task and per-company timeline surfaces.
 *
 * - `mergeStatusIntoUpdates` (Tier 1 A) eliminates the visual duplication when
 *   an update post triggers a status change. The audit row is folded into the
 *   update item as `statusChange` metadata.
 * - `sortTimeline` (Tier 1 B) sorts descending by time with a stable tiebreak:
 *   updates come before audit rows when timestamps match, which keeps the
 *   merge predictable.
 * - `groupBulkRuns` (Tier 1 D) collapses adjacent audit rows that share a
 *   bulk-style changeReason within the same minute into a single summary item.
 * - `applyTimelineFilter` (Tier 1 C) narrows by item kind.
 */

export type TimelineUpdate = {
  kind: "update";
  id: number;
  taskId: number;
  taskCode?: string | null;
  body: string;
  createdAt: Date;
  createdBy: string | null;
  /** Set by mergeStatusIntoUpdates when this update also moved status. */
  statusChange?: { from: string | null; to: string | null };
  /** Edit metadata (Tier 2 F). */
  editedAt?: Date | null;
  originalBody?: string | null;
  /** Pin metadata (Tier 2 L). Pinned updates sort to the top in per-task timelines. */
  pinnedAt?: Date | null;
};

export type TimelineAudit = {
  kind: "audit";
  id: number;
  taskId: number | null;
  taskCode: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  changeReason: string | null;
  entryType: string | null;
  createdAt: Date;
  createdBy: string | null;
};

/** A bulk-run row produced by groupBulkRuns — represents N collapsed audit rows. */
export type TimelineBulk = {
  kind: "bulk";
  /** Stable synthetic id so React keys work. */
  id: string;
  createdAt: Date;
  createdBy: string | null;
  changeReason: string;
  /** The first field/newValue is reused as the summary; full list below. */
  field: string | null;
  newValue: string | null;
  /** The audit rows folded into this group, in their original order. */
  items: TimelineAudit[];
};

export type TimelineItem = TimelineUpdate | TimelineAudit | TimelineBulk;

/* ----------------------------------------------------------------------
 * Sort
 * ---------------------------------------------------------------------- */

export function sortTimeline<T extends { kind: string; createdAt: Date }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const d = b.createdAt.getTime() - a.createdAt.getTime();
    if (d !== 0) return d;
    // Tiebreak: updates before audits, audits before bulks (so a status-change
    // audit appears immediately after its triggering update and gets merged).
    const rank = (k: string) => (k === "update" ? 0 : k === "audit" ? 1 : 2);
    return rank(a.kind) - rank(b.kind);
  });
}

/**
 * Tier 2 B: hide redundant audit rows about update meta (edited / deleted /
 * pinned / unpinned). Those changes are already represented inline on the
 * update bubble itself; surfacing them as separate audit rows in the timeline
 * just creates strikethrough noise. The rows still exist in DB and on /audit
 * for governance.
 */
const SUPPRESSED_AUDIT_FIELDS = new Set([
  "Update edited",
  "Update deleted",
  "Update pinned",
  "Update unpinned",
]);

export function suppressUpdateMetaAudits(items: TimelineItem[]): TimelineItem[] {
  return items.filter((i) => !(i.kind === "audit" && i.field && SUPPRESSED_AUDIT_FIELDS.has(i.field)));
}

/**
 * Tier 2 N: hide noisy field-change audits that have no human-authored reason.
 * The xlsx import generated many such rows ("NO REASON PROVIDED" spam). They
 * stay in DB and on /audit (governance), just not on timelines.
 *
 * Preserves: CREATE entries, Status changes (signal-rich on their own),
 * Escalation changes, and any entry that DOES have a change_reason.
 */
/** Meta-events that must always remain visible even without a reason. */
const ALWAYS_VISIBLE_AUDIT_FIELDS = new Set(["Task deleted", "Task created"]);

export function suppressNoReasonAudits(items: TimelineItem[]): TimelineItem[] {
  return items.filter((i) => {
    if (i.kind !== "audit") return true;
    if (i.entryType === "CREATE") return true;
    if (i.entryType === "ESCALATION") return true;
    if (i.field === "Status") return true;
    if (i.field === "Escalation") return true;
    if (i.field && ALWAYS_VISIBLE_AUDIT_FIELDS.has(i.field)) return true;
    if (i.changeReason && i.changeReason.trim().length > 0) return true;
    return false; // field-change CHANGE entry with no reason → suppress
  });
}

/**
 * Tier 2 L: hoist pinned updates to the top of a per-task timeline.
 * Multiple pinned updates among themselves sort by pin time desc (most recently
 * pinned first). Used after sortTimeline + mergeStatusIntoUpdates.
 */
export function liftPinnedUpdates(items: TimelineItem[]): TimelineItem[] {
  const pinned: TimelineItem[] = [];
  const rest: TimelineItem[] = [];
  for (const i of items) {
    if (i.kind === "update" && i.pinnedAt) pinned.push(i);
    else rest.push(i);
  }
  if (pinned.length === 0) return items;
  pinned.sort((a, b) => {
    const ap = a.kind === "update" && a.pinnedAt ? a.pinnedAt.getTime() : 0;
    const bp = b.kind === "update" && b.pinnedAt ? b.pinnedAt.getTime() : 0;
    return bp - ap;
  });
  return [...pinned, ...rest];
}

/* ----------------------------------------------------------------------
 * Merge status-change audit into its triggering update (Tier 1 A)
 * ----------------------------------------------------------------------
 * Heuristic: an update and a Status-field audit row written within 2 seconds
 * of each other where the audit's changeReason equals the update body — that's
 * the addTaskUpdate path bundling the two together. We hide the audit and tag
 * the update with the status transition so the UI can render a compact chip.
 */
const MERGE_WINDOW_MS = 2000;

export function mergeStatusIntoUpdates(items: TimelineItem[]): TimelineItem[] {
  const updates = items.filter((i): i is TimelineUpdate => i.kind === "update");
  const consumed = new Set<number>(); // audit ids we'll drop

  for (const u of updates) {
    const candidate = items.find((i): i is TimelineAudit => {
      if (i.kind !== "audit") return false;
      if (consumed.has(i.id)) return false;
      if (i.field !== "Status") return false;
      if (i.taskCode && u.taskCode && i.taskCode !== u.taskCode) return false;
      if (i.taskId != null && i.taskId !== u.taskId) return false;
      if (Math.abs(i.createdAt.getTime() - u.createdAt.getTime()) > MERGE_WINDOW_MS) return false;
      // Reason should equal the update body (that's how addTaskUpdate writes it)
      if (i.changeReason && i.changeReason !== u.body) return false;
      return true;
    });
    if (candidate) {
      u.statusChange = { from: candidate.oldValue, to: candidate.newValue };
      consumed.add(candidate.id);
    }
  }

  return items.filter((i) => !(i.kind === "audit" && consumed.has(i.id)));
}

/* ----------------------------------------------------------------------
 * Group bulk-action runs (Tier 1 D)
 * ----------------------------------------------------------------------
 * Adjacent audit rows whose changeReason starts with "Bulk" and share the
 * same minute + same (field, newValue) → folded into one TimelineBulk row.
 * We only fold runs of length >= 2 — a single bulk write stays rendered
 * normally to avoid weird singletons.
 */
const BULK_MIN_RUN = 2;
const BULK_MERGE_WINDOW_MS = 60_000;

export function groupBulkRuns(items: TimelineItem[]): TimelineItem[] {
  // Items must already be sorted descending. We walk and produce a new list.
  const out: TimelineItem[] = [];
  let i = 0;
  while (i < items.length) {
    const cur = items[i];
    if (cur.kind !== "audit" || !cur.changeReason?.toLowerCase().startsWith("bulk")) {
      out.push(cur);
      i++;
      continue;
    }
    // Scan forward (= older entries) collecting matching audits
    const run: TimelineAudit[] = [cur];
    let j = i + 1;
    while (j < items.length) {
      const nxt = items[j];
      if (nxt.kind !== "audit") break;
      if (nxt.changeReason !== cur.changeReason) break;
      if (nxt.field !== cur.field) break;
      if (nxt.newValue !== cur.newValue) break;
      if (cur.createdAt.getTime() - nxt.createdAt.getTime() > BULK_MERGE_WINDOW_MS) break;
      run.push(nxt);
      j++;
    }
    if (run.length >= BULK_MIN_RUN) {
      out.push({
        kind: "bulk",
        id: `bulk-${cur.id}-${run.length}`,
        createdAt: cur.createdAt,
        createdBy: cur.createdBy,
        changeReason: cur.changeReason ?? "Bulk action",
        field: cur.field,
        newValue: cur.newValue,
        items: run,
      });
      i = j;
    } else {
      out.push(cur);
      i++;
    }
  }
  return out;
}

/* ----------------------------------------------------------------------
 * Filter (Tier 1 C)
 * ---------------------------------------------------------------------- */

export type TimelineFilter = "all" | "updates" | "status" | "field" | "escalation" | "bulk";

export const TIMELINE_FILTERS: TimelineFilter[] = ["all", "updates", "status", "field", "escalation", "bulk"];

export function parseTimelineFilter(v: string | undefined): TimelineFilter {
  return (TIMELINE_FILTERS as string[]).includes(v ?? "") ? (v as TimelineFilter) : "all";
}

export function applyTimelineFilter(items: TimelineItem[], filter: TimelineFilter): TimelineItem[] {
  if (filter === "all") return items;
  return items.filter((i) => {
    if (filter === "updates") return i.kind === "update";
    if (filter === "bulk") return i.kind === "bulk";
    if (filter === "status") {
      if (i.kind === "update") return !!i.statusChange;
      if (i.kind === "audit") return i.field === "Status" || i.entryType === "STATUS";
      return false;
    }
    if (filter === "escalation") {
      if (i.kind === "audit")
        return (
          i.entryType === "ESCALATION" ||
          i.field === "Escalation" ||
          i.newValue === "Escalated" ||
          i.newValue === "Yes"
        );
      return false;
    }
    if (filter === "field") {
      return i.kind === "audit" && i.field !== "Status" && i.entryType !== "CREATE";
    }
    return true;
  });
}

/**
 * Tier 1 E: extract COxx-NNN references from a string so the renderer can link them.
 * Returns a list of segments — alternating text and code tokens.
 */
export type Segment = { text: string; isCode: boolean };

const CODE_RE = /\b(CO\d{2}-\d{3})\b/g;

export function splitCodeRefs(text: string): Segment[] {
  if (!text) return [{ text: "", isCode: false }];
  const out: Segment[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(CODE_RE)) {
    const idx = m.index ?? 0;
    if (idx > lastIndex) out.push({ text: text.slice(lastIndex, idx), isCode: false });
    out.push({ text: m[1], isCode: true });
    lastIndex = idx + m[1].length;
  }
  if (lastIndex < text.length) out.push({ text: text.slice(lastIndex), isCode: false });
  return out;
}
