// Client-safe types + labels for the person-record audit trail. No server
// imports, so this can be used from the drawer (a client component).

export type PersonAction =
  | "created"
  | "updated"
  | "archived"
  | "restored"
  | "enriched"
  | "snoozed"
  | "unsnoozed";

export const PERSON_ACTION_LABEL: Record<PersonAction, string> = {
  created: "Created",
  updated: "Changed",
  archived: "Archived",
  restored: "Restored",
  enriched: "Profile enriched",
  snoozed: "Snoozed reminders",
  unsnoozed: "Cleared snooze",
};

export type PersonEvent = {
  id: number;
  action: PersonAction;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  detail: string | null;
  createdAt: string;
  createdBy: string | null;
};

/** Friendly actor name from a stored createdBy token. */
export function personActor(createdBy: string | null): string {
  if (!createdBy || createdBy === "web-ui") return "You";
  if (createdBy === "intake") return "Smart intake";
  if (createdBy.startsWith("portal:")) return createdBy.slice("portal:".length);
  return createdBy;
}
