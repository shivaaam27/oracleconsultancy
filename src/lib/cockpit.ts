// The cockpit (Phase 1 of the self-running system). ONE place that gathers every
// "waiting for your tap" proposal and every "done automatically" action from
// across the system, so the owner verifies in a single pass instead of hunting
// page to page. This is a UNIFYING read layer over two existing engines:
//   • profile_suggestions  → record changes (fields, facts, new shelves)
//   • automation_events     → process moves (compliance, pipeline, onboarding…)
// Both already have apply/dismiss/undo; the cockpit just presents them together.

import { listProfileSuggestions } from "@/lib/profile-suggestions";
import { listAutomationFeed } from "@/app/automations/actions";
import type { CockpitItem } from "@/lib/cockpit-shared";

export type { CockpitItem } from "@/lib/cockpit-shared";

const byNewest = (a: CockpitItem, b: CockpitItem) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

/** Everything awaiting a one-tap decision, both engines, newest first. */
export async function listApprovals(): Promise<CockpitItem[]> {
  const [records, feed] = await Promise.all([
    listProfileSuggestions({ status: "pending" }),
    listAutomationFeed(),
  ]);
  const fromRecords: CockpitItem[] = records.map((s) => ({
    key: `ps:${s.id}`, source: "record", kind: s.kind, summary: s.summary, detail: s.detail, createdAt: s.createdAt, canUndo: false,
  }));
  const fromProcess: CockpitItem[] = feed.suggestions.map((a) => ({
    key: `ae:${a.id}`, source: "process", kind: a.kind, summary: a.summary, detail: a.detail, createdAt: a.createdAt, canUndo: false,
  }));
  return [...fromRecords, ...fromProcess].sort(byNewest);
}

/** What the system did on its own and can still be reversed — the safety net. */
export async function listCockpitActivity(limit = 40): Promise<CockpitItem[]> {
  const [appliedRecords, feed] = await Promise.all([
    listProfileSuggestions({ status: "applied" }),
    listAutomationFeed(),
  ]);
  const fromRecords: CockpitItem[] = appliedRecords.map((s) => ({
    key: `ps:${s.id}`, source: "record", kind: s.kind, summary: s.summary, detail: s.detail, createdAt: s.createdAt, canUndo: true,
  }));
  const fromProcess: CockpitItem[] = feed.applied.map((a) => ({
    key: `ae:${a.id}`, source: "process", kind: a.kind, summary: a.summary, detail: a.detail, createdAt: a.createdAt, canUndo: true,
  }));
  return [...fromRecords, ...fromProcess].sort(byNewest).slice(0, limit);
}

/** The "While you were away" band counts (Step 1 surfaces two live bands; the
 *  scheduled 3-band brief builds on these in Step 2). */
export async function cockpitCounts(): Promise<{ waiting: number; doneAutomatically: number }> {
  const [approvals, activity] = await Promise.all([listApprovals(), listCockpitActivity()]);
  return { waiting: approvals.length, doneAutomatically: activity.length };
}
