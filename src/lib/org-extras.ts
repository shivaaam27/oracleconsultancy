import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "./queries";
import { isOpen } from "./derive";
import { buildPersonRequirementScores } from "./requirements";
import { listAssets } from "./assets";
import { listLeaveRequests } from "./leave";

/**
 * Per-person signals for the organogram cards, integrating data from across the
 * system (tasks, document compliance, assets, leave, onboarding). Computed in a
 * handful of bulk queries and keyed by person id; the chart looks each node up.
 */
export type OrgPersonExtras = {
  open: number;
  overdue: number;
  notStarted: number;
  closed: number;
  /** The single most pressing open task (by flag), for the hover summary. */
  topTask: { code: string; title: string; flag: string | null } | null;
  /** Document-compliance score 0–100, or null if the person has no requirements. */
  compliancePct: number | null;
  complianceStatus: "Good" | "Watch" | "Risk" | null;
  assetsHeld: number;
  onLeaveToday: boolean;
  onboarding: boolean;
};

// Flag priority for picking the "top" open task (most urgent first).
const FLAG_RANK = ["escalate-now", "overdue", "due-soon", "blocked"];

function involves(t: TaskRow, personId: number): boolean {
  return t.ownerId === personId || t.assigneeIds.includes(personId);
}

export async function getOrgExtras(): Promise<Record<number, OrgPersonExtras>> {
  const [tasks, scores, assets, leave, { data: onbRows }] = await Promise.all([
    getAllTasks(),
    buildPersonRequirementScores(),
    listAssets(),
    listLeaveRequests({ status: "Approved" }),
    sb.from("todos").select("person_id").eq("kind", "onboarding").eq("done", false),
  ]);

  // Compliance by person.
  const complianceById = new Map<number, { pct: number; status: "Good" | "Watch" | "Risk" }>();
  for (const s of scores) {
    if (s.ownerType === "person" && s.required > 0) {
      complianceById.set(s.ownerId, { pct: s.score, status: s.status });
    }
  }

  // Assets currently held by each person.
  const assetsById = new Map<number, number>();
  for (const a of assets) {
    if (a.assignedToPersonId != null && a.status === "assigned") {
      assetsById.set(a.assignedToPersonId, (assetsById.get(a.assignedToPersonId) ?? 0) + 1);
    }
  }

  // On leave today.
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveIds = new Set<number>();
  for (const r of leave) {
    if ((r.startDate ?? "").slice(0, 10) <= today && (r.endDate ?? "").slice(0, 10) >= today) {
      onLeaveIds.add(r.personId);
    }
  }

  // Active onboarding journeys.
  const onboardingIds = new Set<number>();
  for (const r of onbRows ?? []) {
    if (r.person_id != null) onboardingIds.add(r.person_id as number);
  }

  // Task breakdown per involved person.
  const taskStats = new Map<number, { open: number; overdue: number; notStarted: number; closed: number; top: TaskRow | null }>();
  const bump = (id: number, t: TaskRow) => {
    const e = taskStats.get(id) ?? { open: 0, overdue: 0, notStarted: 0, closed: 0, top: null };
    if (isOpen(t.status)) {
      e.open++;
      // Track the most urgent open task for the hover summary.
      const rank = (x: TaskRow | null) => (x ? (FLAG_RANK.indexOf(x.flag ?? "") + 1 || 99) : 100);
      if (rank(t) < rank(e.top)) e.top = t;
    }
    if (t.flag === "overdue" || t.flag === "escalate-now") e.overdue++;
    if (t.status === "Not Started") e.notStarted++;
    if (t.status === "Completed" || t.status === "Closed") e.closed++;
    taskStats.set(id, e);
  };
  for (const t of tasks) {
    const ids = new Set<number>();
    if (t.ownerId != null) ids.add(t.ownerId);
    for (const a of t.assigneeIds) ids.add(a);
    for (const id of ids) if (involves(t, id)) bump(id, t);
  }

  // Merge everyone who appears in any source.
  const ids = new Set<number>([
    ...taskStats.keys(), ...complianceById.keys(), ...assetsById.keys(), ...onLeaveIds, ...onboardingIds,
  ]);
  const out: Record<number, OrgPersonExtras> = {};
  for (const id of ids) {
    const ts = taskStats.get(id);
    const comp = complianceById.get(id);
    out[id] = {
      open: ts?.open ?? 0,
      overdue: ts?.overdue ?? 0,
      notStarted: ts?.notStarted ?? 0,
      closed: ts?.closed ?? 0,
      topTask: ts?.top ? { code: ts.top.code, title: ts.top.actionItem, flag: ts.top.flag } : null,
      compliancePct: comp?.pct ?? null,
      complianceStatus: comp?.status ?? null,
      assetsHeld: assetsById.get(id) ?? 0,
      onLeaveToday: onLeaveIds.has(id),
      onboarding: onboardingIds.has(id),
    };
  }
  return out;
}
