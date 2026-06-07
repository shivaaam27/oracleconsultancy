import { sb } from "@/db/supabase";
import { deriveDocStatus, expiryLabel, DEFAULT_LEAD_DAYS, type DocStatus } from "@/lib/documents-shared";
import { normalizePersonType, type PersonType } from "@/lib/person-types";
import {
  complianceBand,
  type ComplianceBand,
  type EffectiveStatus,
  type RequirementStatus,
} from "@/lib/requirements-shared";
import type { ComplianceScore, ComplianceGap, ComplianceDocumentIssue } from "@/lib/compliance";

/* ------------------------------------------------------------------ */
/* Default seed profiles — one per person type. Owner-confirmed lists: */
/* mandatory/optional only, all expiry-tracked. Lead days derive from  */
/* the category default. Categories map to DOC_CATEGORIES so saved      */
/* documents of a specific category auto-link to their requirement.     */
/* ------------------------------------------------------------------ */
type SeedItem = { label: string; category: string; mandatory: boolean };
type SeedProfile = { type: PersonType; name: string; description: string; items: SeedItem[] };

export const DEFAULT_PROFILES: SeedProfile[] = [
  {
    type: "local_staff",
    name: "Local Staff",
    description: "Documents required from an employed local team member.",
    items: [
      { label: "Employment contract", category: "Contract", mandatory: true },
      { label: "National ID (NIDA)", category: "Other", mandatory: true },
      { label: "TIN certificate", category: "Tax", mandatory: true },
      { label: "NSSF registration", category: "Other", mandatory: true },
      { label: "Academic / professional certificates", category: "Certificate", mandatory: true },
      { label: "Passport photo", category: "Other", mandatory: true },
      { label: "Bank details", category: "Other", mandatory: true },
      { label: "Emergency contact", category: "Other", mandatory: true },
      { label: "CV / résumé", category: "Other", mandatory: false },
      { label: "Reference letters", category: "Other", mandatory: false },
    ],
  },
  {
    type: "expat",
    name: "Expat Staff",
    description: "Documents required from expatriate staff, including immigration.",
    items: [
      { label: "Employment contract", category: "Contract", mandatory: true },
      { label: "Passport", category: "Passport", mandatory: true },
      { label: "Work / residence permit", category: "Permit", mandatory: true },
      { label: "Visa", category: "Immigration", mandatory: true },
      { label: "TIN certificate", category: "Tax", mandatory: true },
      { label: "NSSF registration", category: "Other", mandatory: true },
      { label: "Academic / professional certificates", category: "Certificate", mandatory: true },
      { label: "Medical / health certificate", category: "Certificate", mandatory: true },
      { label: "Passport photo", category: "Other", mandatory: true },
      { label: "Bank details", category: "Other", mandatory: true },
      { label: "Emergency contact", category: "Other", mandatory: true },
      { label: "CV / résumé", category: "Other", mandatory: false },
      { label: "Reference letters", category: "Other", mandatory: false },
    ],
  },
  {
    type: "outsider",
    name: "Outsider",
    description: "Monitored documents for brokers, agents, vendors and lawyers.",
    items: [
      { label: "Service contract", category: "Contract", mandatory: false },
      { label: "National ID", category: "Other", mandatory: false },
      { label: "TIN certificate", category: "Tax", mandatory: false },
      { label: "Bank details", category: "Other", mandatory: false },
    ],
  },
  {
    type: "candidate",
    name: "Candidate",
    description: "Documents required from a recruitment candidate.",
    items: [
      { label: "CV / résumé", category: "Other", mandatory: true },
      { label: "Academic / professional certificates", category: "Certificate", mandatory: true },
      { label: "National ID", category: "Other", mandatory: true },
      { label: "Passport photo", category: "Other", mandatory: true },
      { label: "Reference letters", category: "Other", mandatory: false },
      { label: "Passport", category: "Passport", mandatory: false },
    ],
  },
];

/** Categories specific enough to auto-link a saved document to its requirement. */
const SPECIFIC_CATEGORIES = new Set([
  "Contract", "Passport", "Permit", "Immigration", "Tax", "Certificate",
  "Insurance", "Registration", "Licence", "Lease",
]);

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */
/** Create any missing default profiles + items. Idempotent (keyed by type). */
export async function seedRequirementProfiles(): Promise<{ created: number }> {
  const now = new Date().toISOString();
  const { data: existing } = await sb.from("requirement_profiles").select("id,applies_to_type");
  const haveTypes = new Set((existing ?? []).map((p) => p.applies_to_type as string));
  let created = 0;

  for (let i = 0; i < DEFAULT_PROFILES.length; i++) {
    const profile = DEFAULT_PROFILES[i];
    if (haveTypes.has(profile.type)) continue;
    const { data: prof } = await sb
      .from("requirement_profiles")
      .insert({
        name: profile.name,
        applies_to_type: profile.type,
        description: profile.description,
        active: true,
        sort_order: i,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (!prof) continue;
    const rows = profile.items.map((item, idx) => ({
      profile_id: prof.id as number,
      label: item.label,
      category: item.category,
      mandatory: item.mandatory,
      expiry_tracked: true,
      default_lead_days: DEFAULT_LEAD_DAYS[item.category] ?? 30,
      sort_order: idx,
    }));
    if (rows.length) await sb.from("requirement_items").insert(rows);
    created++;
  }
  return { created };
}

/* ------------------------------------------------------------------ */
/* Profile resolution + per-person checklist generation               */
/* ------------------------------------------------------------------ */
type ProfileItem = {
  id: number;
  label: string;
  category: string | null;
  mandatory: boolean;
  expiryTracked: boolean;
  sortOrder: number;
};

async function getActiveProfileItems(type: PersonType): Promise<ProfileItem[]> {
  const { data: prof } = await sb
    .from("requirement_profiles")
    .select("id")
    .eq("applies_to_type", type)
    .eq("active", true)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!prof) return [];
  const { data: items } = await sb
    .from("requirement_items")
    .select("id,label,category,mandatory,expiry_tracked,sort_order")
    .eq("profile_id", prof.id as number)
    .order("sort_order", { ascending: true });
  return (items ?? []).map((it) => ({
    id: it.id as number,
    label: it.label as string,
    category: (it.category as string | null) ?? null,
    mandatory: (it.mandatory as boolean | null) ?? true,
    expiryTracked: (it.expiry_tracked as boolean | null) ?? true,
    sortOrder: (it.sort_order as number | null) ?? 0,
  }));
}

/**
 * Reconcile a person's checklist to their current type's profile:
 * insert snapshot rows for any missing items; remove un-actioned orphan rows
 * (no document, status missing/requested) whose item is no longer applicable.
 * Verified/received rows and anything with a document are always preserved.
 */
export async function ensurePersonRequirements(personId: number, personType: PersonType): Promise<void> {
  const [items, { data: rows }] = await Promise.all([
    getActiveProfileItems(personType),
    sb.from("person_requirements").select("id,item_id,status,document_id").eq("person_id", personId),
  ]);
  const targetItemIds = new Set(items.map((i) => i.id));
  const existing = rows ?? [];
  const existingItemIds = new Set(existing.map((r) => r.item_id as number | null).filter((x): x is number => x != null));

  const now = new Date().toISOString();
  const toInsert = items
    .filter((it) => !existingItemIds.has(it.id))
    .map((it) => ({
      person_id: personId,
      item_id: it.id,
      label: it.label,
      category: it.category,
      mandatory: it.mandatory,
      expiry_tracked: it.expiryTracked,
      status: "missing",
      created_at: now,
      updated_at: now,
    }));
  if (toInsert.length) await sb.from("person_requirements").insert(toInsert);

  const orphanIds = existing
    .filter(
      (r) =>
        r.item_id != null &&
        !targetItemIds.has(r.item_id as number) &&
        !r.document_id &&
        (r.status === "missing" || r.status === "requested")
    )
    .map((r) => r.id as number);
  if (orphanIds.length) await sb.from("person_requirements").delete().in("id", orphanIds);
}

/* ------------------------------------------------------------------ */
/* Reading the checklist + scoring                                     */
/* ------------------------------------------------------------------ */
export type ChecklistItem = {
  id: number;
  label: string;
  category: string | null;
  mandatory: boolean;
  expiryTracked: boolean;
  status: RequirementStatus;
  effectiveStatus: EffectiveStatus;
  documentId: number | null;
  documentTitle: string | null;
  docStatus: DocStatus | null;
  expiryLabel: string | null;
  verifiedAt: string | null;
};

export type ChecklistDocument = {
  id: number;
  title: string;
  category: string | null;
  status: DocStatus;
};

export type PersonChecklist = {
  personId: number;
  profileName: string | null;
  score: number;
  band: ComplianceBand;
  mandatoryTotal: number;
  mandatoryVerified: number;
  missingMandatory: number;
  expiredMandatory: number;
  items: ChecklistItem[];
  documents: ChecklistDocument[];
};

type PersonDocRow = {
  id: number;
  title: string;
  category: string | null;
  expiryDate: Date | null;
  reminderLeadDays: number;
  status: DocStatus;
};

async function loadPersonDocuments(personId: number): Promise<PersonDocRow[]> {
  const { data } = await sb
    .from("documents")
    .select("id,title,category,expiry_date,reminder_lead_days,archived")
    .eq("person_id", personId)
    .eq("archived", false);
  return (data ?? []).map((d) => {
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    return {
      id: d.id as number,
      title: d.title as string,
      category: (d.category as string | null) ?? null,
      expiryDate,
      reminderLeadDays,
      status: deriveDocStatus({ expiryDate, reminderLeadDays, archived: false }),
    };
  });
}

function effectiveStatus(status: RequirementStatus, docStatus: DocStatus | null): EffectiveStatus {
  if (status === "waived") return "waived";
  if (status === "verified") {
    if (docStatus === "Expired") return "expired";
    if (docStatus === "Expiring") return "expiring";
    return "verified";
  }
  return status;
}

/** Generate (if needed), auto-link saved documents, derive status, and score. */
export async function getPersonChecklist(personId: number): Promise<PersonChecklist | null> {
  const { data: person } = await sb
    .from("people")
    .select("person_type")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return null;
  const type = normalizePersonType(person.person_type as string | null);

  await ensurePersonRequirements(personId, type);

  const [{ data: rows }, docs, { data: prof }] = await Promise.all([
    sb
      .from("person_requirements")
      .select("id,item_id,label,category,mandatory,expiry_tracked,status,document_id,verified_at")
      .eq("person_id", personId),
    loadPersonDocuments(personId),
    sb.from("requirement_profiles").select("name").eq("applies_to_type", type).eq("active", true).maybeSingle(),
  ]);

  const docById = new Map(docs.map((d) => [d.id, d]));
  const linkedDocIds = new Set(
    (rows ?? []).map((r) => r.document_id as number | null).filter((x): x is number => x != null)
  );

  // Auto-link: an un-actioned item with a specific category gets matched to a
  // saved document of the same category that isn't already linked elsewhere.
  const now = new Date().toISOString();
  for (const r of rows ?? []) {
    if (r.document_id) continue;
    if (r.status !== "missing" && r.status !== "requested") continue;
    const cat = r.category as string | null;
    if (!cat || !SPECIFIC_CATEGORIES.has(cat)) continue;
    const match = docs.find((d) => d.category === cat && !linkedDocIds.has(d.id));
    if (!match) continue;
    linkedDocIds.add(match.id);
    r.document_id = match.id;
    r.status = "received";
    await sb
      .from("person_requirements")
      .update({ document_id: match.id, status: "received", received_at: now, updated_at: now })
      .eq("id", r.id as number);
  }

  const items: ChecklistItem[] = (rows ?? [])
    .map((r) => {
      const status = (r.status as RequirementStatus) ?? "missing";
      const doc = r.document_id ? docById.get(r.document_id as number) ?? null : null;
      const docStatus = doc?.status ?? null;
      return {
        id: r.id as number,
        label: r.label as string,
        category: (r.category as string | null) ?? null,
        mandatory: (r.mandatory as boolean | null) ?? true,
        expiryTracked: (r.expiry_tracked as boolean | null) ?? true,
        status,
        effectiveStatus: effectiveStatus(status, docStatus),
        documentId: (r.document_id as number | null) ?? null,
        documentTitle: doc?.title ?? null,
        docStatus,
        expiryLabel: doc?.expiryDate ? expiryLabel({ expiryDate: doc.expiryDate, reminderLeadDays: doc.reminderLeadDays }) : null,
        verifiedAt: (r.verified_at as string | null) ?? null,
      };
    })
    .sort((a, b) => {
      // Mandatory first, then needs-attention before done.
      const rank = (it: ChecklistItem) =>
        (it.mandatory ? 0 : 100) +
        (it.effectiveStatus === "missing" ? 0 : it.effectiveStatus === "expired" ? 1 : it.effectiveStatus === "requested" ? 2 : it.effectiveStatus === "received" ? 3 : it.effectiveStatus === "expiring" ? 4 : it.effectiveStatus === "verified" ? 5 : 6);
      return rank(a) - rank(b);
    });

  const mandatory = items.filter((it) => it.mandatory && it.effectiveStatus !== "waived");
  const mandatoryVerified = mandatory.filter((it) => it.effectiveStatus === "verified" || it.effectiveStatus === "expiring").length;
  const missingMandatory = mandatory.filter((it) => it.effectiveStatus === "missing").length;
  const expiredMandatory = mandatory.filter((it) => it.effectiveStatus === "expired").length;
  const score = mandatory.length === 0 ? 100 : Math.round((mandatoryVerified / mandatory.length) * 100);

  return {
    personId,
    profileName: (prof?.name as string | null) ?? null,
    score,
    band: complianceBand(score, expiredMandatory > 0),
    mandatoryTotal: mandatory.length,
    mandatoryVerified,
    missingMandatory,
    expiredMandatory,
    items,
    documents: docs.map((d) => ({ id: d.id, title: d.title, category: d.category, status: d.status })),
  };
}

/* ------------------------------------------------------------------ */
/* Bulk read-only scoring — for People list, Home and Documents.       */
/* Computes from stored person_requirements rows + person documents,   */
/* WITHOUT writing (no ensure/auto-link). Returns ComplianceScore-      */
/* shaped objects so existing consumers/panels work unchanged.         */
/* ------------------------------------------------------------------ */
export async function buildPersonRequirementScores(): Promise<ComplianceScore[]> {
  const [{ data: people }, { data: reqRows }, { data: docRows }] = await Promise.all([
    sb.from("people").select("id,name").eq("active", true),
    sb.from("person_requirements").select("person_id,label,category,mandatory,status,document_id"),
    sb.from("documents").select("id,person_id,title,category,expiry_date,reminder_lead_days,archived"),
  ]);

  // Person documents → derived status, grouped by person.
  type Doc = { id: number; title: string; category: string | null; status: DocStatus; expiryLabel: string | null };
  const docsByPerson = new Map<number, Doc[]>();
  const docStatusById = new Map<number, DocStatus>();
  for (const d of docRows ?? []) {
    if (d.person_id == null || (d.archived as boolean)) continue;
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    const status = deriveDocStatus({ expiryDate, reminderLeadDays, archived: false });
    docStatusById.set(d.id as number, status);
    const list = docsByPerson.get(d.person_id as number) ?? [];
    list.push({ id: d.id as number, title: d.title as string, category: (d.category as string | null) ?? null, status, expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays }) : null });
    docsByPerson.set(d.person_id as number, list);
  }

  const reqsByPerson = new Map<number, typeof reqRows>();
  for (const r of reqRows ?? []) {
    const pid = r.person_id as number;
    const list = reqsByPerson.get(pid) ?? [];
    list!.push(r);
    reqsByPerson.set(pid, list);
  }

  return (people ?? []).map((p) => {
    const personId = p.id as number;
    const ownerName = p.name as string;
    const rows = reqsByPerson.get(personId) ?? [];
    const personDocs = docsByPerson.get(personId) ?? [];

    let mandatoryTotal = 0;
    let verified = 0;
    let expired = 0;
    let expiring = 0;
    const gaps: ComplianceGap[] = [];

    for (const r of rows ?? []) {
      const status = (r.status as RequirementStatus) ?? "missing";
      if (status === "waived") continue;
      const mandatory = (r.mandatory as boolean | null) ?? true;
      if (!mandatory) continue;
      mandatoryTotal++;
      const docStatus = r.document_id ? docStatusById.get(r.document_id as number) ?? null : null;
      const eff = effectiveStatus(status, docStatus);
      if (eff === "verified" || eff === "expiring") verified++;
      if (eff === "expiring") expiring++;
      if (eff === "expired") expired++;
      if (eff === "missing" || eff === "requested" || eff === "received" || eff === "expired") {
        gaps.push({
          id: `req-${r.person_id}-${(r.label as string)}`,
          label: r.label as string,
          categories: r.category ? [r.category as string] : [],
          ownerType: "person",
          appliesTo: "all",
          weight: 1,
          ownerId: personId,
          ownerName,
        });
      }
    }

    const documentIssues: ComplianceDocumentIssue[] = personDocs
      .filter((d) => d.status === "Expired" || d.status === "Expiring")
      .map((d) => ({ id: d.id, title: d.title, category: d.category, status: d.status as "Expired" | "Expiring", expiryLabel: d.expiryLabel }));

    const score = mandatoryTotal === 0 ? 100 : Math.round((verified / mandatoryTotal) * 100);
    const band = complianceBand(score, expired > 0);

    return {
      ownerId: personId,
      ownerName,
      ownerType: "person",
      score,
      required: mandatoryTotal,
      present: verified,
      missing: gaps.length,
      expired,
      expiring,
      monitoredDocuments: personDocs.length,
      status: band,
      gaps,
      documentIssues,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Mutations (called from server actions)                             */
/* ------------------------------------------------------------------ */
async function patch(id: number, fields: Record<string, unknown>) {
  const { error } = await sb
    .from("person_requirements")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markRequirementRequested(id: number) {
  await patch(id, { status: "requested", requested_at: new Date().toISOString() });
}

export async function linkRequirementDocument(id: number, documentId: number) {
  await patch(id, { document_id: documentId, status: "received", received_at: new Date().toISOString() });
}

export async function unlinkRequirementDocument(id: number) {
  await patch(id, { document_id: null, status: "missing", verified_at: null, verified_by: null });
}

export async function verifyRequirement(id: number) {
  await patch(id, { status: "verified", verified_at: new Date().toISOString(), verified_by: "web-ui" });
}

export async function unverifyRequirement(id: number) {
  await patch(id, { status: "received" });
}

export async function waiveRequirement(id: number, reason: string | null) {
  await patch(id, { status: "waived", waived_reason: reason });
}

export async function unwaiveRequirement(id: number) {
  await patch(id, { status: "missing", waived_reason: null });
}
