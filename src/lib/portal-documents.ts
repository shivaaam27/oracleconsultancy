import "server-only";
import { sb } from "@/db/supabase";
import { companyScope, companyIdsForPerson, type PortalPerson } from "@/lib/portal-auth";

/* Company document library for the portal (directors + managers). Scoped by
 * COMPANY through the standard scope helpers: a portfolio director / HR sees
 * every document; a manager or company-scoped director sees the documents of
 * THEIR companies PLUS the documents of the PEOPLE in those companies. Personal
 * files (a person's passport/contract) are therefore visible to the managers/
 * directors of that person's company — the owner's chosen rule. Archived docs
 * and task-conversation "Attachment" files are always excluded. */

export type PortalDocRow = {
  id: number;
  title: string;
  category: string;
  docType: string | null;
  fileName: string | null;
  /** True when there's an in-app stored file or an external link to open. */
  openable: boolean;
  expiry: string | null;
  companyName: string | null;
  personName: string | null;
};

/** Person ids belonging to any of the given companies (primary ∪ person_companies). */
async function personIdsInCompanies(companyIds: number[]): Promise<number[]> {
  if (companyIds.length === 0) return [];
  const [{ data: primary }, { data: links }] = await Promise.all([
    sb.from("people").select("id").in("company_id", companyIds),
    sb.from("person_companies").select("person_id").in("company_id", companyIds),
  ]);
  const set = new Set<number>();
  for (const p of primary ?? []) set.add(p.id as number);
  for (const l of links ?? []) set.add(l.person_id as number);
  return [...set];
}

type RawDoc = {
  id: number; title: string | null; category: string | null; doc_type: string | null;
  file_name: string | null; storage_path: string | null; file_url: string | null;
  expiry_date: string | null;
  companies: { name: string } | { name: string }[] | null;
  people: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function mapRow(d: RawDoc): PortalDocRow {
  return {
    id: d.id,
    title: (d.title as string | null) ?? "Untitled",
    category: (d.category as string | null) ?? "Other",
    docType: (d.doc_type as string | null) ?? null,
    fileName: (d.file_name as string | null) ?? null,
    openable: !!d.storage_path || !!d.file_url,
    expiry: (d.expiry_date as string | null) ?? null,
    companyName: one(d.companies)?.name ?? null,
    personName: one(d.people)?.name ?? null,
  };
}

const SELECT =
  "id,title,category,doc_type,file_name,storage_path,file_url,expiry_date,company_id,person_id,companies(name),people(name)";

/** Core: documents for a company-id set (null = every company). Includes each
 *  company's own documents PLUS the documents of the PEOPLE in those companies.
 *  Archived + task "Attachment" files are excluded. */
export async function listDocumentsForCompanies(scope: number[] | null): Promise<PortalDocRow[]> {
  let query = sb.from("documents").select(SELECT).eq("archived", false);

  if (scope !== null) {
    if (scope.length === 0) return []; // no company scope → nothing
    const personIds = await personIdsInCompanies(scope);
    const orParts = [`company_id.in.(${scope.join(",")})`];
    if (personIds.length) orParts.push(`person_id.in.(${personIds.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const { data } = await query.order("expiry_date", { ascending: true, nullsFirst: false });
  // Drop task-conversation attachments in JS (a `.neq` would also drop the many
  // rows whose category is null).
  return (data as RawDoc[] | null ?? []).filter((d) => d.category !== "Attachment").map(mapRow);
}

/** Every document a portal viewer may browse (their whole company scope). */
export async function listPortalDocuments(me: PortalPerson): Promise<PortalDocRow[]> {
  return listDocumentsForCompanies(await companyScope(me)); // companyScope null = all
}

/** One company's documents (its own + its people's) — for the portal company page.
 *  The caller must have already checked `personCanSeeCompany`. */
export async function listCompanyDocuments(companyId: number): Promise<PortalDocRow[]> {
  return listDocumentsForCompanies([companyId]);
}

/** Authorise ONE document for the file-serving route (same rule as the list). */
export async function canPortalSeeDocument(
  me: PortalPerson,
  doc: { company_id: number | null; person_id: number | null },
): Promise<boolean> {
  const scope = await companyScope(me);
  if (scope === null) return true; // portfolio director / HR
  if (scope.length === 0) return false;
  if (doc.company_id != null && scope.includes(doc.company_id)) return true;
  if (doc.person_id != null) {
    const cids = await companyIdsForPerson(doc.person_id);
    return cids.some((c) => scope.includes(c));
  }
  return false;
}
