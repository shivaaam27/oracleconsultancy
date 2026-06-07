// Canonical person types for the HR system. Client-safe (no server imports).
// V3 Phase 1 replaced the old internal/external/expat slugs with explicit HR
// types. Legacy values are mapped via normalizePersonType so old rows and any
// un-migrated data still resolve cleanly.

export type PersonType = "local_staff" | "expat" | "outsider" | "candidate";

export const PERSON_TYPES: PersonType[] = ["local_staff", "expat", "outsider", "candidate"];

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  local_staff: "Local Staff",
  expat: "Expat Staff",
  outsider: "Outsider",
  candidate: "Candidate",
};

export const PERSON_TYPE_HINTS: Record<PersonType, string> = {
  local_staff: "Employed local team member",
  expat: "Expatriate staff — visa/permit tracked",
  outsider: "Broker, agent, vendor, lawyer",
  candidate: "Recruitment candidate",
};

/** Map any stored value (incl. legacy internal/external) to a canonical type. */
export function normalizePersonType(value: string | null | undefined): PersonType {
  switch (value) {
    case "expat":
      return "expat";
    case "external":
    case "outsider":
      return "outsider";
    case "candidate":
      return "candidate";
    case "local_staff":
    case "internal":
    default:
      return "local_staff";
  }
}

/** Human label for any stored value, normalising legacy slugs first. */
export function personTypeLabel(value: string | null | undefined): string {
  return PERSON_TYPE_LABELS[normalizePersonType(value)];
}

export function isPersonType(value: string | null | undefined): value is PersonType {
  return !!value && (PERSON_TYPES as string[]).includes(value);
}
