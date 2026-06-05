import { deriveDocStatus, type DocumentRow } from "@/lib/documents-shared";

export type ComplianceOwnerType = "company" | "person";

export type ComplianceRequirement = {
  id: string;
  label: string;
  categories: string[];
  ownerType: ComplianceOwnerType;
  appliesTo: "all" | "expat";
  weight: number;
};

export type ComplianceGap = ComplianceRequirement & {
  ownerId: number;
  ownerName: string;
};

export type ComplianceScore = {
  ownerId: number;
  ownerName: string;
  ownerType: ComplianceOwnerType;
  score: number;
  required: number;
  present: number;
  missing: number;
  expired: number;
  expiring: number;
  status: "Good" | "Watch" | "Risk";
  gaps: ComplianceGap[];
};

export type CompliancePerson = {
  id: number;
  name: string;
  personType?: string | null;
};

export const COMPANY_REQUIREMENTS: ComplianceRequirement[] = [
  { id: "company-registration", label: "Company registration", categories: ["Registration"], ownerType: "company", appliesTo: "all", weight: 2 },
  { id: "tax-registration", label: "Tax / TIN document", categories: ["Tax"], ownerType: "company", appliesTo: "all", weight: 2 },
  { id: "business-licence", label: "Business licence", categories: ["Licence", "Permit"], ownerType: "company", appliesTo: "all", weight: 3 },
  { id: "insurance", label: "Insurance cover", categories: ["Insurance"], ownerType: "company", appliesTo: "all", weight: 2 },
  { id: "lease", label: "Office / site lease", categories: ["Lease"], ownerType: "company", appliesTo: "all", weight: 1 },
];

export const PERSON_REQUIREMENTS: ComplianceRequirement[] = [
  { id: "person-contract", label: "Employment / engagement contract", categories: ["Contract"], ownerType: "person", appliesTo: "all", weight: 2 },
  { id: "person-passport", label: "Passport", categories: ["Passport"], ownerType: "person", appliesTo: "expat", weight: 3 },
  { id: "person-permit", label: "Visa / work permit", categories: ["Immigration", "Permit"], ownerType: "person", appliesTo: "expat", weight: 3 },
];

function matchesRequirement(doc: DocumentRow, req: ComplianceRequirement) {
  const haystack = [doc.category, doc.docType, doc.title].filter(Boolean).join(" ").toLowerCase();
  return req.categories.some((category) => haystack.includes(category.toLowerCase()));
}

function requirementApplies(req: ComplianceRequirement, person?: CompliancePerson) {
  if (req.appliesTo === "all") return true;
  return person?.personType === "expat";
}

function scoreStatus(score: number, expired: number, missing: number): ComplianceScore["status"] {
  if (expired > 0 || missing >= 2 || score < 70) return "Risk";
  if (missing > 0 || score < 90) return "Watch";
  return "Good";
}

function calculateScore({
  ownerId,
  ownerName,
  ownerType,
  requirements,
  documents,
}: {
  ownerId: number;
  ownerName: string;
  ownerType: ComplianceOwnerType;
  requirements: ComplianceRequirement[];
  documents: DocumentRow[];
}): ComplianceScore {
  const liveDocs = documents.filter((doc) => !doc.archived);
  const totalWeight = requirements.reduce((sum, req) => sum + req.weight, 0);
  let earned = totalWeight;
  let present = 0;
  let expired = 0;
  let expiring = 0;
  const gaps: ComplianceGap[] = [];

  for (const req of requirements) {
    const matching = liveDocs.filter((doc) => matchesRequirement(doc, req));
    if (matching.length === 0) {
      earned -= req.weight;
      gaps.push({ ...req, ownerId, ownerName });
      continue;
    }
    present++;
    const statuses = matching.map((doc) => deriveDocStatus(doc));
    if (statuses.includes("Expired")) {
      expired++;
      earned -= req.weight;
    } else if (statuses.includes("Expiring")) {
      expiring++;
      earned -= req.weight * 0.4;
    }
  }

  const score = totalWeight > 0 ? Math.max(0, Math.round((earned / totalWeight) * 100)) : 100;
  const missing = gaps.length;

  return {
    ownerId,
    ownerName,
    ownerType,
    score,
    required: requirements.length,
    present,
    missing,
    expired,
    expiring,
    status: scoreStatus(score, expired, missing),
    gaps,
  };
}

export function buildCompanyComplianceScores(
  companies: Array<{ id: number; name: string }>,
  documents: DocumentRow[]
): ComplianceScore[] {
  return companies.map((company) =>
    calculateScore({
      ownerId: company.id,
      ownerName: company.name,
      ownerType: "company",
      requirements: COMPANY_REQUIREMENTS,
      documents: documents.filter((doc) => doc.companyId === company.id && doc.personId == null),
    })
  );
}

export function buildPersonComplianceScores(
  people: CompliancePerson[],
  documents: DocumentRow[]
): ComplianceScore[] {
  return people.map((person) => {
    const requirements = PERSON_REQUIREMENTS.filter((req) => requirementApplies(req, person));
    return calculateScore({
      ownerId: person.id,
      ownerName: person.name,
      ownerType: "person",
      requirements,
      documents: documents.filter((doc) => doc.personId === person.id),
    });
  });
}

export function worstComplianceScores(scores: ComplianceScore[], limit = 5): ComplianceScore[] {
  return scores
    .filter((score) => score.status !== "Good")
    .sort((a, b) => a.score - b.score || b.expired - a.expired || b.missing - a.missing)
    .slice(0, limit);
}
