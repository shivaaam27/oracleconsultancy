// Client-safe types + label helpers for the cockpit. No server imports (no `sb`),
// so client components can use it. The DB read layer lives in lib/cockpit.ts.

// One row in the cockpit, whichever engine it came from. `key` is prefixed so the
// dispatcher knows which engine to act on: "ps:<id>" = profile suggestion,
// "ae:<id>" = automation event.
export type CockpitItem = {
  key: string;
  source: "record" | "process";
  kind: string;
  summary: string;
  detail: string | null;
  createdAt: string;
  /** Applied items can be reversed; pending ones are accept/dismiss. */
  canUndo: boolean;
};

const RECORD_KIND_LABEL: Record<string, string> = {
  "company-field": "Profile",
  "person-field": "Profile",
  fact: "Fact",
  "new-shelf": "New shelf",
  "new-structure": "New department",
};
const PROCESS_KIND_LABEL: Record<string, string> = {
  "compliance-verify": "Compliance",
  "task-complete": "Task",
  "pipeline-advance": "Pipeline",
  "onboarding-tick": "Onboarding",
  "task-create": "Renewal",
  "pipeline-create": "New application",
};

export function cockpitKindLabel(item: CockpitItem): string {
  return (item.source === "record" ? RECORD_KIND_LABEL : PROCESS_KIND_LABEL)[item.kind] ?? item.kind;
}
