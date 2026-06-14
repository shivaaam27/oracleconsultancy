import { sb } from "@/db/supabase";
import type { Commitment, CommitmentKind } from "@/lib/commitments-shared";

export type { Commitment } from "@/lib/commitments-shared";

const COLS = "id,kind,company_id,title,counterparty,reference,start_date,end_date,notice_days,amount,status,note";

function mapRow(r: Record<string, unknown>, nameById: Map<number, string>): Commitment {
  const companyId = (r.company_id as number | null) ?? null;
  return {
    id: r.id as number,
    kind: (r.kind as CommitmentKind) ?? "contract",
    companyId,
    companyName: companyId ? nameById.get(companyId) ?? null : null,
    title: r.title as string,
    counterparty: (r.counterparty as string | null) ?? null,
    reference: (r.reference as string | null) ?? null,
    startDate: (r.start_date as string | null) ?? null,
    endDate: (r.end_date as string | null) ?? null,
    noticeDays: (r.notice_days as number | null) ?? null,
    amount: (r.amount as string | null) ?? null,
    status: (r.status as string | null) ?? "active",
    note: (r.note as string | null) ?? null,
  };
}

/** All live commitments (not archived). */
export async function listCommitments(): Promise<Commitment[]> {
  const [{ data }, { data: companies }] = await Promise.all([
    sb.from("commitments").select(COLS).eq("archived", false).order("end_date", { ascending: true, nullsFirst: false }),
    sb.from("companies").select("id,name"),
  ]);
  const nameById = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));
  return (data ?? []).map((r) => mapRow(r, nameById));
}

export type CommitmentInput = {
  kind: CommitmentKind;
  companyId?: number | null;
  title: string;
  counterparty?: string | null;
  reference?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  noticeDays?: number | null;
  amount?: string | null;
  status?: string | null;
  note?: string | null;
};

const toIso = (v: Date | string | null | undefined) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString());

export async function createCommitment(input: CommitmentInput, createdBy = "web-ui"): Promise<number | null> {
  const now = new Date().toISOString();
  const { data, error } = await sb.from("commitments").insert({
    kind: input.kind,
    company_id: input.companyId ?? null,
    title: input.title,
    counterparty: input.counterparty ?? null,
    reference: input.reference ?? null,
    start_date: toIso(input.startDate),
    end_date: toIso(input.endDate),
    notice_days: input.noticeDays ?? null,
    amount: input.amount ?? null,
    status: input.status ?? "active",
    note: input.note ?? null,
    created_at: now,
    updated_at: now,
    created_by: createdBy,
  }).select("id").single();
  if (error || !data) return null;
  return data.id as number;
}

export async function updateCommitment(id: number, patch: Partial<CommitmentInput>): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.kind !== undefined) payload.kind = patch.kind;
  if (patch.companyId !== undefined) payload.company_id = patch.companyId;
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.counterparty !== undefined) payload.counterparty = patch.counterparty;
  if (patch.reference !== undefined) payload.reference = patch.reference;
  if (patch.startDate !== undefined) payload.start_date = toIso(patch.startDate);
  if (patch.endDate !== undefined) payload.end_date = toIso(patch.endDate);
  if (patch.noticeDays !== undefined) payload.notice_days = patch.noticeDays;
  if (patch.amount !== undefined) payload.amount = patch.amount;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.note !== undefined) payload.note = patch.note;
  await sb.from("commitments").update(payload).eq("id", id);
}

export async function archiveCommitment(id: number, archived = true): Promise<void> {
  await sb.from("commitments").update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
}
