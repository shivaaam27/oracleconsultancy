// Document Health Check — a zero-AI, egress-light audit of the whole library that
// answers "which uploads failed / need a look" WITHOUT re-reading or re-uploading
// anything, and WITHOUT trusting AI naming (it keys off structural columns only).
//
// Buckets, all over the active (non-archived, non-trash) set:
//   • noFile      — a row with no stored file: an upload that didn't complete (came
//                   through an intake path) or a details-only entry. Re-upload.
//   • noText      — a file IS stored but no searchable text layer was ever captured
//                   (text_source null / "ocr-empty"). Re-READ these (the only AI cost).
//   • needsReview — read fine but flagged: review_status="needs_review" or low
//                   confidence. Human glance, no AI.
//   • duplicates  — byte-identical copies (grouped by file_hash), name-independent.
//
// Reads only small columns (never extracted_text) so it's cheap on Supabase egress,
// and runs on demand (a button), never on every page load.

import { sb } from "@/db/supabase";
import { deriveFiling } from "./doc-catalog";

export type HealthItem = {
  id: number;
  title: string;
  owner: string | null;
  companyId: number | null; // for the company filter
  personId: number | null;
  createdBy: string | null;
  createdAt: string | null; // ISO
  reason: string;
  hasFile: boolean;
  intakePath: boolean; // came through an upload/intake path (vs a manual details-only entry)
};

export type DocumentHealth = {
  total: number; // active, not trashed
  healthy: number; // has file + text + not flagged
  noFile: HealthItem[];
  noText: HealthItem[];
  needsReview: HealthItem[];
  /** Personal papers (passport/visa/permit/ID…) tagged to a COMPANY — should be a person. */
  personMistagged: HealthItem[];
  duplicates: Array<{ hash: string; items: HealthItem[] }>;
};

type Row = {
  id: number;
  title: string | null;
  file_name: string | null;
  created_by: string | null;
  storage_path: string | null;
  file_url: string | null;
  file_hash: string | null;
  text_source: string | null;
  review_status: string | null;
  confidence: number | null;
  company_id: number | null;
  person_id: number | null;
  intake_state: string | null;
  archived: boolean | null;
  created_at: string | null;
};

const LIGHT =
  "id,title,file_name,created_by,storage_path,file_url,file_hash,text_source,review_status,confidence,company_id,person_id,intake_state,archived,created_at";

const isIntakePath = (createdBy: string | null) =>
  createdBy === "ai-intake" || createdBy === "meeting-mode" || (createdBy ?? "").startsWith("portal:");

export async function getDocumentHealth(): Promise<DocumentHealth> {
  const [rows, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    (async () => {
      const out: Row[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from("documents")
          .select(LIGHT)
          .order("id", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as unknown as Row[];
        out.push(...batch);
        if (batch.length < PAGE) break;
      }
      return out;
    })(),
    sb.from("companies").select("id,name"),
    sb.from("people").select("id,name"),
  ]);

  const coName = new Map((companiesRaw ?? []).map((c) => [c.id as number, c.name as string]));
  const peName = new Map((peopleRaw ?? []).map((p) => [p.id as number, p.name as string]));
  const ownerOf = (r: Row) =>
    (r.company_id ? coName.get(r.company_id) : null) ?? (r.person_id ? peName.get(r.person_id) : null) ?? null;

  const active = rows.filter((r) => !r.archived && r.intake_state !== "trash");

  const toItem = (r: Row, reason: string): HealthItem => ({
    id: r.id,
    title: r.title ?? r.file_name ?? "(untitled)",
    owner: ownerOf(r),
    companyId: r.company_id,
    personId: r.person_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    reason,
    hasFile: !!r.storage_path || !!r.file_url,
    intakePath: isIntakePath(r.created_by),
  });

  const noFile: HealthItem[] = [];
  const noText: HealthItem[] = [];
  const needsReview: HealthItem[] = [];
  const personMistagged: HealthItem[] = [];
  const byHash = new Map<string, Row[]>();
  let healthy = 0;

  for (const r of active) {
    const hasFile = !!r.storage_path || !!r.file_url;
    const hasStored = !!r.storage_path;
    const unread = !r.text_source || r.text_source === "ocr-empty";
    const flagged = r.review_status === "needs_review" || (r.confidence != null && r.confidence < 0.75);

    // A personal-paper TYPE (passport/visa/permit/ID/CV…) tagged to a company but no
    // person → the owner is wrong (name-based catalogue lookup, no AI). Surfaced so a
    // visa filed under "PES Ltd" can be re-pointed to the individual it belongs to.
    if (r.company_id && !r.person_id) {
      const filing = deriveFiling(r.file_name, r.title);
      if (filing.ownerType === "person") {
        personMistagged.push(toItem(r, `Looks like a personal ${filing.typeLabel ?? "document"} — tag the person`));
      }
    }

    if (!hasFile) {
      noFile.push(
        toItem(r, isIntakePath(r.created_by) ? "Upload didn’t complete — re-upload this file" : "Details-only entry (no file attached)"),
      );
    } else if (hasStored && unread) {
      noText.push(toItem(r, "No searchable text — re-read to index it"));
    }

    if (flagged) {
      needsReview.push(
        toItem(
          r,
          r.review_status === "needs_review"
            ? "Flagged for review"
            : `Low confidence (${Math.round((r.confidence ?? 0) * 100)}%)`,
        ),
      );
    }

    if (hasFile && !unread && !flagged) healthy++;

    if (r.file_hash) {
      const g = byHash.get(r.file_hash) ?? [];
      g.push(r);
      byHash.set(r.file_hash, g);
    }
  }

  const duplicates = [...byHash.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([hash, g]) => ({ hash, items: g.map((r) => toItem(r, "Byte-identical copy")) }));

  return { total: active.length, healthy, noFile, noText, needsReview, personMistagged, duplicates };
}
