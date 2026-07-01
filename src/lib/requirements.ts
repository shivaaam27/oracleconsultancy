import { sb } from "@/db/supabase";
import { deriveDocStatus, expiryLabel, worstDocStatus, DEFAULT_LEAD_DAYS, type DocStatus } from "@/lib/documents-shared";
import { normalizePersonType, type PersonType } from "@/lib/person-types";
import {
  complianceBand,
  type ComplianceBand,
  type EffectiveStatus,
  type RequirementStatus,
} from "@/lib/requirements-shared";
import type { ComplianceScore, ComplianceGap, ComplianceDocumentIssue } from "@/lib/compliance";
import { matchDocumentsToItems } from "@/lib/requirement-match";
import { logPersonRequirementEvent } from "@/lib/compliance-audit";

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
 * Verified/received rows and anything with a document are always preserved
 * UNLESS their requirement no longer belongs to the new profile (see below).
 *
 * Two type-change pitfalls are handled here:
 *  - Shared items (Employment contract, TIN, Passport photo, Bank details, CV…)
 *    exist as a separate requirement_items row per profile. Matching only on
 *    item_id would insert a duplicate of an item the person already holds. So we
 *    also skip-insert when a non-removed row carries the SAME case-insensitive
 *    label, and re-point that row's item_id to the new template item.
 *  - Old-type mandatory items (Visa, Work permit) would otherwise keep scoring
 *    after e.g. expat→local_staff even when verified/linked. So we soft-remove
 *    verified/linked rows whose item is no longer in the profile AND whose label
 *    isn't present in the new profile either.
 */
export async function ensurePersonRequirements(personId: number, personType: PersonType): Promise<void> {
  const [items, { data: rows }] = await Promise.all([
    getActiveProfileItems(personType),
    sb.from("person_requirements").select("id,item_id,label,status,document_id").eq("person_id", personId),
  ]);
  const targetItemIds = new Set(items.map((i) => i.id));
  const targetLabels = new Set(items.map((i) => i.label.trim().toLowerCase()));
  // Live (non-removed) rows keyed by their case-insensitive label, so a shared
  // item already on the checklist can be re-pointed instead of duplicated.
  const existing = rows ?? [];
  const liveByLabel = new Map<string, { id: number; itemId: number | null }>();
  for (const r of existing) {
    if ((r.status as string) === "removed") continue;
    const key = (r.label as string).trim().toLowerCase();
    if (!liveByLabel.has(key)) liveByLabel.set(key, { id: r.id as number, itemId: r.item_id as number | null });
  }
  const existingItemIds = new Set(existing.map((r) => r.item_id as number | null).filter((x): x is number => x != null));

  const now = new Date().toISOString();
  // Rows we re-point to a new profile item this run — exclude them from the
  // orphan/stale passes below, which read the pre-re-point `existing` snapshot.
  const repointedIds = new Set<number>();
  const toInsert: Array<Record<string, unknown>> = [];
  for (const it of items) {
    if (existingItemIds.has(it.id)) continue; // already pinned to this exact template row
    const match = liveByLabel.get(it.label.trim().toLowerCase());
    if (match) {
      // Same document by name already on the checklist from a previous profile —
      // re-point it to the new profile's item rather than inserting a duplicate.
      repointedIds.add(match.id);
      if (match.itemId !== it.id) {
        await sb.from("person_requirements").update({ item_id: it.id, updated_at: now }).eq("id", match.id);
      }
      continue;
    }
    toInsert.push({
      person_id: personId,
      item_id: it.id,
      label: it.label,
      category: it.category,
      mandatory: it.mandatory,
      expiry_tracked: it.expiryTracked,
      status: "missing",
      created_at: now,
      updated_at: now,
    });
  }
  if (toInsert.length) await sb.from("person_requirements").insert(toInsert);

  // Un-actioned orphans (no document, missing/requested) from a profile that no
  // longer applies are deleted outright.
  const orphanIds = existing
    .filter(
      (r) =>
        !repointedIds.has(r.id as number) &&
        r.item_id != null &&
        !targetItemIds.has(r.item_id as number) &&
        !r.document_id &&
        (r.status === "missing" || r.status === "requested")
    )
    .map((r) => r.id as number);
  if (orphanIds.length) await sb.from("person_requirements").delete().in("id", orphanIds);

  // Verified/linked rows whose item is no longer in the profile AND whose label
  // isn't in the new profile either (so it isn't a shared item we just re-pointed)
  // are soft-removed so an old-type requirement (Visa, Work permit) stops scoring.
  const staleVerifiedIds = existing
    .filter(
      (r) =>
        !repointedIds.has(r.id as number) &&
        r.item_id != null &&
        !targetItemIds.has(r.item_id as number) &&
        !targetLabels.has((r.label as string).trim().toLowerCase()) &&
        (r.status as string) !== "removed" &&
        (!!r.document_id || r.status === "received" || r.status === "verified" || r.status === "waived")
    )
    .map((r) => r.id as number);
  if (staleVerifiedIds.length) {
    await sb
      .from("person_requirements")
      .update({ status: "removed", updated_at: now })
      .in("id", staleVerifiedIds);
  }
}

/**
 * Explicit "Sync with template" — pull the person's checklist back in line with
 * the current requirement profile after the templates were edited in Documents
 * compliance. Adds brand-new template items AND restores any standard items the
 * operator had removed earlier but that still belong to the active template.
 * Verified/linked rows and custom (person-specific) items are left untouched.
 */
export async function syncPersonRequirementsToTemplate(
  personId: number,
  personType: PersonType
): Promise<{ added: number; restored: number }> {
  const [items, { data: rows }] = await Promise.all([
    getActiveProfileItems(personType),
    sb.from("person_requirements").select("id,item_id,status").eq("person_id", personId),
  ]);
  const targetItemIds = new Set(items.map((i) => i.id));
  const existing = rows ?? [];
  const existingItemIds = new Set(
    existing.map((r) => r.item_id as number | null).filter((x): x is number => x != null)
  );

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

  // Bring back previously-removed standard items that are still in the template.
  const restoreIds = existing
    .filter((r) => (r.status as string) === "removed" && r.item_id != null && targetItemIds.has(r.item_id as number))
    .map((r) => r.id as number);
  if (restoreIds.length) {
    await sb.from("person_requirements").update({ status: "missing", updated_at: now }).in("id", restoreIds);
  }

  return { added: toInsert.length, restored: restoreIds.length };
}

/**
 * Propagate template edits to EVERYONE: reconcile each active person's checklist
 * to their type's current profile (adds new items, cleans un-actioned orphans
 * whose item was removed). Verified/linked/removed rows are preserved. This is
 * what makes a "Manage requirements" save show up in the Documents compliance
 * scores and every person drawer without opening each one. Returns # of people.
 */
export async function syncAllPersonRequirements(): Promise<{ people: number }> {
  const { data: people } = await sb.from("people").select("id,person_type").eq("active", true);
  let count = 0;
  for (const p of people ?? []) {
    const type = normalizePersonType(p.person_type as string | null);
    await ensurePersonRequirements(p.id as number, type);
    count++;
  }
  return { people: count };
}

/** Convenience: resolve the person's type, then sync to its template. */
export async function syncPersonRequirements(personId: number): Promise<{ added: number; restored: number }> {
  const { data: person } = await sb.from("people").select("person_type").eq("id", personId).maybeSingle();
  if (!person) return { added: 0, restored: 0 };
  const type = normalizePersonType(person.person_type as string | null);
  return syncPersonRequirementsToTemplate(personId, type);
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
  /** Optional "valid until / review by" date for the requirement itself (ISO). */
  reviewDate: string | null;
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
  docType: string | null;
  expiryDate: Date | null;
  reminderLeadDays: number;
  status: DocStatus;
};

async function loadPersonDocuments(personId: number): Promise<PersonDocRow[]> {
  const { data } = await sb
    .from("documents")
    .select("id,title,category,doc_type,expiry_date,reminder_lead_days,archived")
    .eq("person_id", personId)
    .eq("archived", false);
  return (data ?? []).map((d) => {
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    return {
      id: d.id as number,
      title: d.title as string,
      category: (d.category as string | null) ?? null,
      docType: (d.doc_type as string | null) ?? null,
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
      .select("id,item_id,label,category,mandatory,expiry_tracked,status,document_id,verified_at,auto_link,review_date")
      .eq("person_id", personId),
    loadPersonDocuments(personId),
    sb.from("requirement_profiles").select("name").eq("applies_to_type", type).eq("active", true).maybeSingle(),
  ]);

  // Hidden ("removed") items never show or score.
  const liveRows = (rows ?? []).filter((r) => (r.status as string) !== "removed");

  const docById = new Map(docs.map((d) => [d.id, d]));
  const linkedDocIds = new Set(
    liveRows.map((r) => r.document_id as number | null).filter((x): x is number => x != null)
  );

  // Auto-link: match un-actioned items to saved documents by label + title/type
  // (not just broad category), assigned globally best-first so each document and
  // item is used at most once. This is what lets a uploaded National ID / NSSF /
  // bank letter (all category "Other") actually tick their checklist item.
  const now = new Date().toISOString();
  const candidateItems = liveRows
    .filter(
      (r) =>
        !r.document_id &&
        (r.auto_link as boolean | null) !== false && // operator unlinked — don't re-attach
        (r.status === "missing" || r.status === "requested")
    )
    .map((r) => ({ id: r.id as number, label: r.label as string, category: (r.category as string | null) ?? null }));
  const candidateDocs = docs
    .filter((d) => !linkedDocIds.has(d.id))
    .map((d) => ({ id: d.id, title: d.title, category: d.category, docType: d.docType }));
  const matches = matchDocumentsToItems(candidateItems, candidateDocs);
  for (const r of liveRows) {
    const docId = matches.get(r.id as number);
    if (docId == null) continue;
    linkedDocIds.add(docId);
    r.document_id = docId;
    r.status = "received";
    await sb
      .from("person_requirements")
      .update({ document_id: docId, status: "received", received_at: now, updated_at: now })
      .eq("id", r.id as number);
    await logPersonRequirementEvent(r.id as number, "linked", {
      documentId: docId,
      detail: docById.get(docId)?.title ?? null,
      ownerId: personId,
      label: r.label as string,
      createdBy: "auto-link",
    });
  }

  const items: ChecklistItem[] = liveRows
    .map((r) => {
      const status = (r.status as RequirementStatus) ?? "missing";
      const doc = r.document_id ? docById.get(r.document_id as number) ?? null : null;
      const cat = (r.category as string | null) ?? null;
      const reviewDate = r.review_date ? new Date(r.review_date as string) : null;
      const reviewLead = (cat && DEFAULT_LEAD_DAYS[cat]) || 30;
      const reviewStatus = reviewDate ? deriveDocStatus({ expiryDate: reviewDate, reminderLeadDays: reviewLead }) : null;
      // The requirement lapses on whichever is sooner — the document's expiry or
      // the manual review date — so a verified item can't stay green forever.
      const combinedStatus = worstDocStatus(doc?.status ?? null, reviewStatus);
      // Prefer whichever expiry drives the lapse for the countdown label.
      const labelSource =
        reviewStatus && worstDocStatus(doc?.status ?? null, reviewStatus) === reviewStatus && reviewStatus !== "Valid" && reviewStatus !== "No expiry"
          ? { expiryDate: reviewDate!, reminderLeadDays: reviewLead }
          : doc?.expiryDate
          ? { expiryDate: doc.expiryDate, reminderLeadDays: doc.reminderLeadDays }
          : reviewDate
          ? { expiryDate: reviewDate, reminderLeadDays: reviewLead }
          : null;
      return {
        id: r.id as number,
        label: r.label as string,
        category: cat,
        mandatory: (r.mandatory as boolean | null) ?? true,
        expiryTracked: (r.expiry_tracked as boolean | null) ?? true,
        status,
        effectiveStatus: effectiveStatus(status, combinedStatus),
        documentId: (r.document_id as number | null) ?? null,
        documentTitle: doc?.title ?? null,
        docStatus: combinedStatus,
        expiryLabel: labelSource ? expiryLabel(labelSource) : null,
        verifiedAt: (r.verified_at as string | null) ?? null,
        reviewDate: reviewDate ? reviewDate.toISOString() : null,
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
  // "received" (a compulsory doc auto-linked on upload) counts toward the score
  // too — so filing a required document raises compliance on its own. The manual
  // "Verify" tick then becomes an optional audit confirmation, not a gate.
  const mandatoryVerified = mandatory.filter((it) => it.effectiveStatus === "verified" || it.effectiveStatus === "expiring" || it.effectiveStatus === "received").length;
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
export async function buildPersonRequirementScores(personIds?: number[]): Promise<ComplianceScore[]> {
  // Optional personIds scopes the scan (e.g. a manager's direct reports) so we
  // don't compute compliance for the whole portfolio just to show a few people.
  const scoped = personIds && personIds.length > 0 ? personIds : null;
  let peopleQ = sb.from("people").select("id,name").eq("active", true);
  let reqQ = sb.from("person_requirements").select("person_id,label,category,mandatory,status,document_id,review_date");
  let docQ = sb.from("documents").select("id,person_id,title,category,expiry_date,reminder_lead_days,archived");
  if (scoped) {
    peopleQ = peopleQ.in("id", scoped);
    reqQ = reqQ.in("person_id", scoped);
    docQ = docQ.in("person_id", scoped);
  }
  const [{ data: people }, { data: reqRows }, { data: docRows }] = await Promise.all([peopleQ, reqQ, docQ]);

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
    if ((r.status as string) === "removed") continue;
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
    let inProgress = 0;
    const gaps: ComplianceGap[] = [];

    for (const r of rows ?? []) {
      const status = (r.status as RequirementStatus) ?? "missing";
      if (status === "waived") continue;
      const mandatory = (r.mandatory as boolean | null) ?? true;
      if (!mandatory) continue;
      mandatoryTotal++;
      const docStatus = r.document_id ? docStatusById.get(r.document_id as number) ?? null : null;
      const cat = r.category as string | null;
      const reviewDate = r.review_date ? new Date(r.review_date as string) : null;
      const reviewStatus = reviewDate
        ? deriveDocStatus({ expiryDate: reviewDate, reminderLeadDays: (cat && DEFAULT_LEAD_DAYS[cat]) || 30 })
        : null;
      const eff = effectiveStatus(status, worstDocStatus(docStatus, reviewStatus));
      // "received" (auto-linked compulsory doc) counts as present — mirrors the
      // per-person scorer, so filing a required document raises compliance on its own.
      if (eff === "verified" || eff === "expiring" || eff === "received") verified++;
      if (eff === "expiring") expiring++;
      if (eff === "expired") expired++;
      if (eff === "requested") inProgress++;
      if (eff === "missing" || eff === "requested" || eff === "expired") {
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
      // Genuinely absent only — expired is shown separately, so don't double-count.
      missing: Math.max(0, gaps.length - inProgress - expired),
      inProgress,
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
/* Single-person score — for the Person Pack. Runs the live checklist  */
/* (ensure + auto-link) so "Documents needed" reflects the real        */
/* per-person requirements, then maps to a ComplianceScore.            */
/* ------------------------------------------------------------------ */
export async function getPersonRequirementScore(
  personId: number,
  ownerName: string
): Promise<ComplianceScore | null> {
  const checklist = await getPersonChecklist(personId);
  if (!checklist) return null;

  // Request list = anything outstanding (not yet received/verified/waived),
  // mandatory or optional, so the draft covers every document still owed.
  const gaps: ComplianceGap[] = checklist.items
    .filter((it) => it.effectiveStatus === "missing" || it.effectiveStatus === "requested" || it.effectiveStatus === "expired")
    .map((it) => ({
      id: `req-${personId}-${it.label}`,
      label: it.label,
      categories: it.category ? [it.category] : [],
      ownerType: "person",
      appliesTo: "all",
      weight: it.mandatory ? 1 : 0,
      ownerId: personId,
      ownerName,
    }));

  const documentIssues: ComplianceDocumentIssue[] = checklist.items
    .filter((it) => it.documentId != null && (it.docStatus === "Expired" || it.docStatus === "Expiring"))
    .map((it) => ({
      id: it.documentId as number,
      title: it.documentTitle ?? it.label,
      category: it.category,
      status: it.docStatus as "Expired" | "Expiring",
      expiryLabel: it.expiryLabel,
    }));

  const expired = checklist.items.filter((it) => it.effectiveStatus === "expired").length;
  const expiring = checklist.items.filter((it) => it.effectiveStatus === "expiring").length;
  const inProgress = checklist.items.filter(
    (it) => it.mandatory && (it.effectiveStatus === "requested" || it.effectiveStatus === "received")
  ).length;

  return {
    ownerId: personId,
    ownerName,
    ownerType: "person",
    score: checklist.score,
    required: checklist.mandatoryTotal,
    present: checklist.mandatoryVerified,
    missing: gaps.length,
    inProgress,
    expired,
    expiring,
    monitoredDocuments: checklist.documents.length,
    status: checklist.band,
    gaps,
    documentIssues,
  };
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
  await logPersonRequirementEvent(id, "requested");
}

export async function linkRequirementDocument(id: number, documentId: number) {
  await patch(id, { document_id: documentId, status: "received", received_at: new Date().toISOString() });
  const { data: doc } = await sb.from("documents").select("title").eq("id", documentId).maybeSingle();
  await logPersonRequirementEvent(id, "linked", { documentId, detail: (doc?.title as string | null) ?? null });
}

export async function unlinkRequirementDocument(id: number) {
  // Turn off auto-linking for this item so the same document isn't silently
  // re-attached on the next load. Manual linking remains available.
  await patch(id, { document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: false });
  await logPersonRequirementEvent(id, "unlinked");
}

export async function verifyRequirement(id: number) {
  await patch(id, { status: "verified", verified_at: new Date().toISOString(), verified_by: "web-ui" });
  await logPersonRequirementEvent(id, "verified");
}

export async function unverifyRequirement(id: number) {
  await patch(id, { status: "received" });
  await logPersonRequirementEvent(id, "unverified");
}

export async function waiveRequirement(id: number, reason: string | null) {
  await patch(id, { status: "waived", waived_reason: reason });
  await logPersonRequirementEvent(id, "waived", { detail: reason });
}

export async function unwaiveRequirement(id: number) {
  await patch(id, { status: "missing", waived_reason: null });
  await logPersonRequirementEvent(id, "unwaived");
}

/** Set or clear the requirement's own "valid until / review by" date (ISO or null). */
export async function setRequirementReviewDate(id: number, reviewDate: string | null) {
  await patch(id, { review_date: reviewDate });
  await logPersonRequirementEvent(id, "edited", {
    detail: reviewDate ? `Review date set to ${reviewDate.slice(0, 10)}` : "Review date cleared",
  });
}

/* ------------------------------------------------------------------ */
/* Per-person custom items (add / edit / remove).                      */
/* A custom item has item_id = null. Removing a custom item hard-       */
/* deletes it; removing a STANDARD (profile-derived) item hides it with */
/* status "removed" so ensurePersonRequirements never recreates it.     */
/* ------------------------------------------------------------------ */
export async function addPersonRequirement(
  personId: number,
  input: { label: string; category: string | null; mandatory: boolean }
) {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");
  const now = new Date().toISOString();

  // De-duplicate against the person's existing checklist (incl. template items)
  // so manual adds never double up. A case-insensitive label match wins.
  const { data: rows } = await sb
    .from("person_requirements")
    .select("id,label,status")
    .eq("person_id", personId);
  const match = (rows ?? []).find(
    (r) => (r.label as string).trim().toLowerCase() === label.toLowerCase()
  );
  if (match) {
    // Re-adding something removed earlier just un-hides it — minimal, no dupe.
    if ((match.status as string) === "removed") {
      await patch(match.id as number, { status: "missing" });
      await logPersonRequirementEvent(match.id as number, "added", { ownerId: personId, label });
      return;
    }
    throw new Error("That document is already on this person's checklist.");
  }

  // If no category was given, inherit it from a matching template item so saved
  // documents of that category still auto-link to the requirement.
  let category = input.category;
  if (!category) {
    const { data: tmpl } = await sb
      .from("requirement_items")
      .select("category")
      .ilike("label", label)
      .limit(1)
      .maybeSingle();
    category = (tmpl?.category as string | null) ?? null;
  }

  const { data: inserted, error } = await sb
    .from("person_requirements")
    .insert({
      person_id: personId,
      item_id: null,
      label,
      category,
      mandatory: input.mandatory,
      expiry_tracked: true,
      status: "missing",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logPersonRequirementEvent(inserted.id as number, "added", { ownerId: personId, label });
}

export async function editPersonRequirement(
  id: number,
  input: { label: string; category: string | null; mandatory: boolean }
) {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");
  await patch(id, { label, category: input.category, mandatory: input.mandatory });
  await logPersonRequirementEvent(id, "edited", { label });
}

/* ------------------------------------------------------------------ */
/* Per-TYPE template editing (requirement_profiles / requirement_items).*/
/* Edits affect FUTURE checklists: adds propagate to existing people on  */
/* their next sync; relabels/deletes do NOT rewrite existing snapshots.  */
/* ------------------------------------------------------------------ */
export type TemplateItem = { id: number; label: string; category: string | null; mandatory: boolean; sortOrder: number };
export type TemplateProfile = {
  id: number;
  name: string;
  appliesToType: PersonType;
  description: string | null;
  items: TemplateItem[];
};

export async function listRequirementProfilesWithItems(): Promise<TemplateProfile[]> {
  const [{ data: profs }, { data: items }] = await Promise.all([
    sb.from("requirement_profiles").select("id,name,applies_to_type,description,sort_order").eq("active", true).order("sort_order", { ascending: true }),
    sb.from("requirement_items").select("id,profile_id,label,category,mandatory,sort_order").order("sort_order", { ascending: true }),
  ]);
  const byProfile = new Map<number, TemplateItem[]>();
  for (const it of items ?? []) {
    const list = byProfile.get(it.profile_id as number) ?? [];
    list.push({
      id: it.id as number,
      label: it.label as string,
      category: (it.category as string | null) ?? null,
      mandatory: (it.mandatory as boolean | null) ?? true,
      sortOrder: (it.sort_order as number | null) ?? 0,
    });
    byProfile.set(it.profile_id as number, list);
  }
  return (profs ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    appliesToType: normalizePersonType(p.applies_to_type as string | null),
    description: (p.description as string | null) ?? null,
    items: byProfile.get(p.id as number) ?? [],
  }));
}

export async function addRequirementItem(
  profileId: number,
  input: { label: string; category: string | null; mandatory: boolean }
) {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");
  const { data: last } = await sb
    .from("requirement_items")
    .select("sort_order")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | null) ?? -1) + 1;
  const { error } = await sb.from("requirement_items").insert({
    profile_id: profileId,
    label,
    category: input.category,
    mandatory: input.mandatory,
    expiry_tracked: true,
    default_lead_days: (input.category && DEFAULT_LEAD_DAYS[input.category]) || 30,
    sort_order: nextOrder,
  });
  if (error) throw new Error(error.message);
}

export async function editRequirementItem(
  id: number,
  input: { label: string; category: string | null; mandatory: boolean }
) {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");
  const { error } = await sb
    .from("requirement_items")
    .update({
      label,
      category: input.category,
      mandatory: input.mandatory,
      default_lead_days: (input.category && DEFAULT_LEAD_DAYS[input.category]) || 30,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Propagate the rename/recategorisation to every existing person's snapshot of
  // this template item (rows keep item_id), so a reworded requirement updates on
  // the person drawer AND their staff portal without a manual "Sync". Custom
  // (item_id null) rows are untouched. Status/links are preserved.
  await sb
    .from("person_requirements")
    .update({ label, category: input.category, mandatory: input.mandatory, updated_at: new Date().toISOString() })
    .eq("item_id", id);
}

export async function deleteRequirementItem(id: number) {
  // Soft-remove every person's snapshot of this template item FIRST. Without
  // this, the FK set-null on delete would turn each snapshot into an
  // item_id=null "custom" orphan that no future sync can clean (and a
  // delete-then-re-add would then duplicate it). Marking them "removed" hides
  // them from scoring and lets reconciliation leave them be.
  await sb
    .from("person_requirements")
    .update({ status: "removed", document_id: null, updated_at: new Date().toISOString() })
    .eq("item_id", id);
  const { error } = await sb.from("requirement_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removePersonRequirement(id: number) {
  const { data: row } = await sb
    .from("person_requirements")
    .select("item_id,person_id,label")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;
  // Log before deletion so the label survives in the trail.
  await logPersonRequirementEvent(id, "removed", {
    ownerId: (row.person_id as number | null) ?? undefined,
    label: (row.label as string | null) ?? undefined,
  });
  if (row.item_id == null) {
    const { error } = await sb.from("person_requirements").delete().eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    // Standard item — hide it (kept so reconciliation won't resurrect it).
    await patch(id, { status: "removed", document_id: null });
  }
}
