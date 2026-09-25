// The cockpit (Phase 1 of the self-running system). ONE place that gathers every
// "waiting for your tap" proposal and every "done automatically" action from
// across the system, so the owner verifies in a single pass instead of hunting
// page to page. This is a UNIFYING read layer over two existing engines:
//   • automation_events → process moves (pipeline, onboarding, task completion…)
// It already has apply/dismiss/undo; the cockpit just presents it in one place.
// (The profile-suggestion engine was removed with the document intake brain.)

import { listAutomationFeed } from "@/app/automations/actions";
import type { CockpitItem } from "@/lib/automation/cockpit-shared";

export type { CockpitItem } from "@/lib/automation/cockpit-shared";

const byNewest = (a: CockpitItem, b: CockpitItem) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

// Proposals from features that no longer exist — Applications (removed 26 Sept
// 2026) and the document-compliance engine (removed Aug 2026). Approving one can
// do nothing, so they never count as waiting (Home, the morning push, Approvals);
// the logbook still lists them.
const RETIRED_KINDS = new Set(["pipeline-advance", "pipeline-create", "compliance-verify"]);

/** Everything awaiting a one-tap decision, both engines, newest first. */
export async function listApprovals(): Promise<CockpitItem[]> {
  const feed = await listAutomationFeed();
  const fromProcess: CockpitItem[] = feed.suggestions.filter((a) => !RETIRED_KINDS.has(a.kind)).map((a) => ({
    key: `ae:${a.id}`, source: "process", kind: a.kind, summary: a.summary, detail: a.detail, createdAt: a.createdAt, canUndo: false,
  }));
  return fromProcess.sort(byNewest);
}

/** What the system did on its own and can still be reversed — the safety net. */
export async function listCockpitActivity(limit = 40): Promise<CockpitItem[]> {
  const feed = await listAutomationFeed();
  const fromProcess: CockpitItem[] = feed.applied.map((a) => ({
    key: `ae:${a.id}`, source: "process", kind: a.kind, summary: a.summary, detail: a.detail, createdAt: a.createdAt, canUndo: true,
  }));
  return fromProcess.sort(byNewest).slice(0, limit);
}
