import { sb } from "@/db/supabase";
import { factStatus, type FactValue } from "@/lib/facts-shared";
import { commitmentUrgency, daysToNotice, KIND_LABEL, type CommitmentKind } from "@/lib/commitments-shared";
import type { Finding } from "@/lib/safety-net-shared";
import { sortFindings } from "@/lib/safety-net-shared";

// The Safety Net (transfer-pack 04): a read-only rules engine that flags what is
// MISSING or INCONSISTENT — duplicate tax numbers, photos standing in for
// originals, facts gone stale, equipment still out with someone who has left,
// companies missing core identifiers. Pure SQL/TS over the live tables; it never
// guesses and needs no AI. Compute-on-read (like signals.ts), no findings table.

// Document categories that are official records whose ORIGINAL matters — a phone
// photo standing in for one of these should be replaced by a clean scan
// (blueprint's `_NEEDORIG`). Deliberately excludes "Certificate" (vaccination
// cards, academic certificates etc. are legitimately held as photos/scans).
const OFFICIAL_CATEGORIES = new Set([
  "Licence", "Permit", "Passport", "Registration", "Tax", "Immigration", "Insurance", "Lease",
]);
const IMAGE_FILE = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i;

export async function gatherSafetyFindings(): Promise<Finding[]> {
  const findings: Finding[] = [];

  const [companies, documents, facts, openAssignments] = await Promise.all([
    sb.from("companies").select("id,name,tin,registration_no,active"),
    sb.from("documents").select("id,title,category,file_name,archived,company_id,person_id,needs_original"),
    sb.from("facts").select("id,entity_type,person_id,company_id,field,value,display,effective_date,verified,verified_at"),
    sb.from("asset_assignments").select("id,asset_id,person_id,returned_at").is("returned_at", null),
  ]);

  const companyRows = (companies.data ?? []) as Array<{ id: number; name: string; tin: string | null; registration_no: string | null; active: boolean }>;
  const activeCompanies = companyRows.filter((c) => c.active);

  // 1. Duplicate TIN across companies — a misfile or a data-entry error.
  const byTin = new Map<string, string[]>();
  for (const c of activeCompanies) {
    const tin = (c.tin ?? "").trim();
    if (!tin) continue;
    byTin.set(tin, [...(byTin.get(tin) ?? []), c.name]);
  }
  for (const [tin, names] of byTin) {
    if (names.length > 1) {
      findings.push({
        id: `duplicate-tin:${tin}`,
        severity: "medium",
        kind: "duplicate-tin",
        title: "Duplicate TIN",
        detail: `${names.join(", ")} all carry TIN ${tin}. A TIN should belong to one company — check for a misfile.`,
        href: "/companies",
      });
    }
  }

  // 2. Missing core identifiers on an active company.
  for (const c of activeCompanies) {
    const missing: string[] = [];
    if (!(c.tin ?? "").trim()) missing.push("TIN");
    if (!(c.registration_no ?? "").trim()) missing.push("registration no.");
    if (missing.length) {
      findings.push({
        id: `missing-company-id:${c.id}`,
        severity: "low",
        kind: "missing-company-id",
        title: `${c.name} is missing ${missing.join(" & ")}`,
        detail: "Add the company's core identifiers so letters, tax and compliance records are complete.",
        href: `/companies/${c.id}?tab=profile`,
      });
    }
  }

  // 3. Awaiting original — the AI/operator flagged it (`needs_original`), or a
  //    photo is standing in for an official document (heuristic, for legacy docs
  //    uploaded before the flag existed).
  const docRows = (documents.data ?? []) as Array<{ id: number; title: string; category: string | null; file_name: string | null; archived: boolean; needs_original: boolean | null }>;
  for (const d of docRows) {
    if (d.archived) continue;
    const flagged = d.needs_original === true;
    const heuristic = !!d.file_name && IMAGE_FILE.test(d.file_name) && !!d.category && OFFICIAL_CATEGORIES.has(d.category);
    if (!flagged && !heuristic) continue;
    const kindNote = d.file_name && IMAGE_FILE.test(d.file_name) ? ` (${d.file_name})` : "";
    findings.push({
      id: `awaiting-original:${d.id}`,
      severity: "medium",
      kind: "awaiting-original",
      title: `Awaiting original — ${d.title}`,
      detail: `On file only as a photo/scan${kindNote}. Get the official copy / clean scan.`,
      href: `/documents?doc=${d.id}`,
    });
  }

  // 4. Stale / incomplete facts (current value per entity+field, from the ledger).
  type FactRow = { id: number; entity_type: string; person_id: number | null; company_id: number | null; field: string; value: FactValue; display: string | null; effective_date: string; verified: boolean; verified_at: string | null };
  const factRows = (facts.data ?? []) as FactRow[];
  // Keep only the current row per entity+field (latest effective_date).
  const currentByKey = new Map<string, FactRow>();
  for (const f of factRows) {
    const key = `${f.entity_type}:${f.person_id ?? f.company_id}:${f.field}`;
    const seen = currentByKey.get(key);
    if (!seen || new Date(f.effective_date) > new Date(seen.effective_date)) currentByKey.set(key, f);
  }
  for (const f of currentByKey.values()) {
    const status = factStatus({ verified: f.verified, verifiedAt: f.verified_at, value: f.value, display: f.display });
    const isCompany = f.entity_type === "company";
    const href = isCompany && f.company_id ? `/companies/${f.company_id}?tab=profile` : "/people";
    if (status === "incomplete") {
      findings.push({
        id: `incomplete-fact:${f.id}`,
        severity: "medium",
        kind: "incomplete-fact",
        title: `Incomplete fact — ${f.field}`,
        detail: `“${f.display ?? "value"}” is a placeholder. Fill in the real ${f.field.toLowerCase()} and verify it against a document.`,
        href,
      });
    } else if (status === "stale") {
      findings.push({
        id: `stale-fact:${f.id}`,
        severity: "low",
        kind: "stale-fact",
        title: `Re-verify ${f.field}`,
        detail: `${f.field} was last verified over 180 days ago. Confirm it still holds against a current document.`,
        href,
      });
    }
  }

  // 5. Equipment still out with someone who has left. Skip assignments whose
  //    asset is archived/retired (those open rows are stale, not actionable).
  const assignments = (openAssignments.data ?? []) as Array<{ id: number; asset_id: number; person_id: number | null }>;
  const leaverIds = assignments.map((a) => a.person_id).filter((v): v is number => v != null);
  if (leaverIds.length) {
    const assetIds = [...new Set(assignments.map((a) => a.asset_id).filter((v) => v != null))];
    const [{ data: peopleRows }, { data: assetRows }] = await Promise.all([
      sb.from("people").select("id,name,active").in("id", leaverIds),
      sb.from("assets").select("id,archived").in("id", assetIds),
    ]);
    const inactive = new Map((peopleRows ?? []).filter((p) => !(p as { active: boolean }).active).map((p) => [(p as { id: number }).id, (p as { name: string }).name]));
    const liveAsset = new Set((assetRows ?? []).filter((a) => !(a as { archived: boolean }).archived).map((a) => (a as { id: number }).id));
    for (const a of assignments) {
      if (a.person_id != null && inactive.has(a.person_id) && liveAsset.has(a.asset_id)) {
        findings.push({
          id: `asset-on-leaver:${a.id}`,
          severity: "medium",
          kind: "asset-on-leaver",
          title: `Equipment still out with ${inactive.get(a.person_id)}`,
          detail: "This person has left but an asset is still assigned to them. Mark it returned or reassign it.",
          href: "/hrms/assets",
        });
      }
    }
  }

  // 6. Commitments needing notice soon (lease renewal / insurance lapse / contract).
  const { data: commitRows } = await sb
    .from("commitments")
    .select("id,kind,title,end_date,notice_days,status")
    .eq("archived", false);
  for (const c of (commitRows ?? []) as Array<{ id: number; kind: string; title: string; end_date: string | null; notice_days: number | null; status: string }>) {
    const com = { endDate: c.end_date, noticeDays: c.notice_days, status: c.status };
    const urg = commitmentUrgency(com);
    if (urg !== "overdue" && urg !== "soon") continue;
    const d = daysToNotice(com);
    findings.push({
      id: `commitment-notice:${c.id}`,
      severity: urg === "overdue" ? "high" : "medium",
      kind: "commitment-notice",
      title: `${KIND_LABEL[c.kind as CommitmentKind] ?? "Commitment"} notice ${urg === "overdue" ? "overdue" : "due soon"} — ${c.title}`,
      detail: urg === "overdue" ? "The notice window has passed — act now to renew or exit." : d === 0 ? "Give notice today (or it auto-renews / lapses)." : `Give notice within ${d} day${d === 1 ? "" : "s"} (or it auto-renews / lapses).`,
      href: "/hrms/registers",
    });
  }

  // 7. In-flight applications (pipeline) overdue or due soon by their deadline.
  const { data: pipeRows } = await sb
    .from("pipeline")
    .select("id,subject,type,stage,deadline")
    .eq("archived", false)
    .neq("stage", "Issued")
    .not("deadline", "is", null);
  const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
  for (const p of (pipeRows ?? []) as Array<{ id: number; subject: string; type: string; stage: string; deadline: string }>) {
    const days = Math.floor((new Date(p.deadline).getTime() - todayMid.getTime()) / 86_400_000);
    if (days > 14) continue;
    findings.push({
      id: `pipeline-deadline:${p.id}`,
      severity: days < 0 ? "high" : "medium",
      kind: "pipeline-deadline",
      title: `${p.type} for ${p.subject} — ${days < 0 ? "overdue" : "due soon"}`,
      detail: days < 0 ? `Deadline passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago (stage: ${p.stage}).` : `Due in ${days} day${days === 1 ? "" : "s"} (stage: ${p.stage}).`,
      href: "/hrms/pipeline",
    });
  }

  return sortFindings(findings);
}
