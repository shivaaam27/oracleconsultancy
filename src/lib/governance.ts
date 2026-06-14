import { sb } from "@/db/supabase";
import {
  riskScore,
  type CompanyGovernance,
  type Ubo,
  type KeyPerson,
  type Risk,
  type Decision,
  type Holder,
  type Signatory,
  type Resolution,
} from "@/lib/governance-shared";

// Server reads for the board-level Governance & Risk layer. Board-only — these
// are surfaced on company profiles and the monthly board pack, never in the
// daily/weekly routine (transfer-pack 02 §8).

export type { CompanyGovernance, Ubo, KeyPerson, Risk, Decision } from "@/lib/governance-shared";

/** Cap table, signatories and resolutions for one company. */
export async function getCompanyGovernance(companyId: number): Promise<CompanyGovernance> {
  const [{ data: company }, { data: capRows }, { data: sigRows }, { data: resRows }] = await Promise.all([
    sb.from("companies").select("authorised_shares,issued_shares").eq("id", companyId).maybeSingle(),
    sb.from("cap_table").select("holder,shares,pct,holder_type,note").eq("company_id", companyId).order("shares", { ascending: false }),
    sb.from("signatories").select("id,name,scope,note").eq("company_id", companyId).order("name"),
    sb.from("resolutions").select("id,date,type,summary,document_id").eq("company_id", companyId).order("date", { ascending: false }),
  ]);
  const holders: Holder[] = (capRows ?? []).map((r) => ({
    holder: r.holder as string,
    shares: (r.shares as number | null) ?? null,
    pct: (r.pct as number | null) ?? null,
    holderType: (r.holder_type as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  }));
  const issued = (company?.issued_shares as number | null) ?? (holders.length ? holders.reduce((s, h) => s + (h.shares ?? 0), 0) : null);
  const signatories: Signatory[] = (sigRows ?? []).map((r) => ({ id: r.id as number, name: r.name as string, scope: (r.scope as string | null) ?? null, note: (r.note as string | null) ?? null }));
  const resolutions: Resolution[] = (resRows ?? []).map((r) => ({
    id: r.id as number,
    date: (r.date as string | null) ?? null,
    type: (r.type as string | null) ?? null,
    summary: r.summary as string,
    documentId: (r.document_id as number | null) ?? null,
  }));
  return {
    capTable: { authorised: (company?.authorised_shares as number | null) ?? null, issued, holders },
    signatories,
    resolutions,
  };
}

/** Has this company any governance data at all (so the UI can hide an empty panel)? */
export async function hasCompanyGovernance(companyId: number): Promise<boolean> {
  const { count } = await sb.from("cap_table").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (count && count > 0) return true;
  const { count: sc } = await sb.from("signatories").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  return !!sc && sc > 0;
}

/** Ultimate beneficial owners (portfolio-wide). */
export async function getBeneficialOwners(): Promise<Ubo[]> {
  const { data } = await sb.from("beneficial_owners").select("id,person_name,interests,flag,complete").order("person_name");
  return (data ?? []).map((r) => ({
    id: r.id as number,
    personName: r.person_name as string,
    interests: (r.interests as string | null) ?? null,
    flag: (r.flag as string | null) ?? null,
    complete: Boolean(r.complete),
  }));
}

/** Key-person concentration register. */
export async function getKeyPersons(): Promise<KeyPerson[]> {
  const { data } = await sb.from("key_persons").select("id,name,director_of,secretary_of,shareholder_of,signatory_of,risk,note").order("name");
  return (data ?? []).map((r) => ({
    id: r.id as number,
    name: r.name as string,
    directorOf: (r.director_of as number | null) ?? null,
    secretaryOf: (r.secretary_of as number | null) ?? null,
    shareholderOf: (r.shareholder_of as number | null) ?? null,
    signatoryOf: (r.signatory_of as number | null) ?? null,
    risk: (r.risk as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  }));
}

/** The structural risk register, scored + banded, worst first. */
export async function getRiskRegister(): Promise<Risk[]> {
  const { data } = await sb.from("risks").select("id,code,category,title,description,likelihood,impact,owner,mitigation,status,linked");
  const risks: Risk[] = (data ?? []).map((r) => {
    const likelihood = (r.likelihood as number | null) ?? null;
    const impact = (r.impact as number | null) ?? null;
    const { score, band } = riskScore(likelihood, impact);
    return {
      id: r.id as number,
      code: r.code as string,
      category: (r.category as string | null) ?? null,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      likelihood, impact, score, band,
      owner: (r.owner as string | null) ?? null,
      mitigation: (r.mitigation as string | null) ?? null,
      status: (r.status as string | null) ?? "Open",
      linked: (r.linked as string | null) ?? null,
    };
  });
  return risks.sort((a, b) => b.score - a.score);
}

/** The board decisions / approvals log, soonest-due first. */
export async function getDecisions(): Promise<Decision[]> {
  const [{ data }, { data: companies }] = await Promise.all([
    sb.from("decisions").select("id,code,title,company_id,type,raised_by,due,status,context,decision,decided_on"),
    sb.from("companies").select("id,name"),
  ]);
  const nameById = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));
  const decisions: Decision[] = (data ?? []).map((r) => ({
    id: r.id as number,
    code: r.code as string,
    title: r.title as string,
    companyId: (r.company_id as number | null) ?? null,
    companyName: r.company_id ? nameById.get(r.company_id as number) ?? null : null,
    type: (r.type as string | null) ?? null,
    raisedBy: (r.raised_by as string | null) ?? null,
    due: (r.due as string | null) ?? null,
    status: (r.status as string | null) ?? "Pending",
    context: (r.context as string | null) ?? null,
    decision: (r.decision as string | null) ?? null,
    decidedOn: (r.decided_on as string | null) ?? null,
  }));
  // Pending first, then soonest due.
  return decisions.sort((a, b) => {
    if ((a.status === "Pending") !== (b.status === "Pending")) return a.status === "Pending" ? -1 : 1;
    return (a.due ?? "9999").localeCompare(b.due ?? "9999");
  });
}
