export type PersonPackPurpose =
  | "document-request"
  | "expat-onboarding"
  | "visa-permit"
  | "work-permit-renewal"
  | "recruitment"
  | "contract-signing"
  | "task-reminder"
  | "custom";

export const PERSON_PACK_PURPOSES: PersonPackPurpose[] = [
  "document-request",
  "expat-onboarding",
  "visa-permit",
  "work-permit-renewal",
  "recruitment",
  "contract-signing",
  "task-reminder",
  "custom",
];

export function isPersonPackPurpose(value: string | null | undefined): value is PersonPackPurpose {
  return !!value && PERSON_PACK_PURPOSES.includes(value as PersonPackPurpose);
}

export type PersonPackSectionKey =
  | "missingDocuments"
  | "documentIssues"
  | "linkedDocuments"
  | "openTasks"
  | "personalTodos"
  | "deadlines"
  | "latestUpdates"
  | "contactDetails"
  | "companyContext"
  | "fileLinks"
  | "complianceScore"
  | "internalNotes";

export const PERSON_PACK_SECTION_KEYS: PersonPackSectionKey[] = [
  "missingDocuments",
  "documentIssues",
  "linkedDocuments",
  "openTasks",
  "personalTodos",
  "deadlines",
  "latestUpdates",
  "contactDetails",
  "companyContext",
  "fileLinks",
  "complianceScore",
  "internalNotes",
];

export type PersonPackSectionSelection = Record<PersonPackSectionKey, boolean>;

export function blankPersonPackSelection(): PersonPackSectionSelection {
  return {
    missingDocuments: false,
    documentIssues: false,
    linkedDocuments: false,
    openTasks: false,
    personalTodos: false,
    deadlines: false,
    latestUpdates: false,
    contactDetails: false,
    companyContext: false,
    fileLinks: false,
    complianceScore: false,
    internalNotes: false,
  };
}

export function parsePersonPackSections(value?: string | null): PersonPackSectionSelection {
  const selected = new Set((value ?? "").split(",").filter(Boolean));
  const out = blankPersonPackSelection();
  for (const key of PERSON_PACK_SECTION_KEYS) out[key] = selected.has(key);
  return out;
}

export function serialisePersonPackSections(selection: PersonPackSectionSelection): string {
  return PERSON_PACK_SECTION_KEYS.filter((key) => selection[key]).join(",");
}
