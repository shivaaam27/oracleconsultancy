import { sb } from "@/db/supabase";
import type { MktResult, MktSpendRow } from "@/lib/marketing-results-shared";

/* ------------------------------------------------------------------ *
 * MARKETING, Phase 3 — results and money. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 * ⚠️ ONE DOOR FOR WRITES, as everywhere else here.
 *
 * ⚠️ NOTHING TALKS TO A PLATFORM YET. Every figure is typed. `source` already
 * says where a reading came from, so the later phase that reads Instagram adds
 * rows with `source: "platform"` and changes nothing else — the reports, the
 * screens and the arithmetic all stay exactly as they are.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();

/** ⚠️ ONE STRING LITERAL — see the note in `marketing.ts`. */
const RESULT_COLS = "id,publication_id,read_at,source,reach,impressions,likes,comments,shares,saves,clicks,followers,notes,created_by,created_at";
const SPEND_COLS = "id,on_date,amount,currency,borne_by,publication_id,account_id,campaign_id,company_id,client_id,reference,notes,created_by,created_at,updated_at";

type ResultDbRow = {
  id: number; publication_id: number; read_at: string; source: string;
  reach: number | null; impressions: number | null; likes: number | null;
  comments: number | null; shares: number | null; saves: number | null;
  clicks: number | null; followers: number | null; notes: string | null;
  created_by: string; created_at: string;
};

export type SpendDbRow = {
  id: number; on_date: string; amount: string; currency: string; borne_by: string;
  publication_id: number | null; account_id: number | null; campaign_id: number | null;
  company_id: number | null; client_id: number | null; reference: string | null;
  notes: string | null; created_by: string; created_at: string; updated_at: string;
};

const toResult = (r: ResultDbRow): MktResult => ({
  id: r.id, publicationId: r.publication_id, readAt: r.read_at, source: r.source,
  reach: r.reach, impressions: r.impressions, likes: r.likes, comments: r.comments,
  shares: r.shares, saves: r.saves, clicks: r.clicks, followers: r.followers,
});

export const toSpend = (r: SpendDbRow): MktSpendRow => ({
  id: r.id, onDate: r.on_date, amount: Number(r.amount), borneBy: r.borne_by,
  clientId: r.client_id, companyId: r.company_id, campaignId: r.campaign_id,
  publicationId: r.publication_id,
});

/* ── reading ─────────────────────────────────────────────────────────────── */

export async function listResults(publicationIds?: number[]): Promise<MktResult[]> {
  let q = sb.from("mkt_results").select(RESULT_COLS).order("read_at", { ascending: true });
  if (publicationIds) {
    if (publicationIds.length === 0) return [];
    q = q.in("publication_id", publicationIds);
  }
  const { data } = await q;
  return ((data ?? []) as ResultDbRow[]).map(toResult);
}

export async function listSpend(): Promise<SpendDbRow[]> {
  const { data } = await sb.from("mkt_spend").select(SPEND_COLS).order("on_date", { ascending: false });
  return (data ?? []) as SpendDbRow[];
}

/** Every reading, grouped by the publication it belongs to. */
export async function resultsByPublication(publicationIds?: number[]): Promise<Map<number, MktResult[]>> {
  const rows = await listResults(publicationIds);
  const m = new Map<number, MktResult[]>();
  for (const r of rows) {
    const list = m.get(r.publicationId) ?? [];
    list.push(r);
    m.set(r.publicationId, list);
  }
  return m;
}

/* ── writing — the one door ──────────────────────────────────────────────── */

/** Turn "" into null, and a number into a number. A blank box is not a zero. */
function figure(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Write down how a publication is doing.
 *
 * ⚠️ THIS ADDS A READING, IT NEVER EDITS ONE. Yesterday's figure and today's are
 * both true, and the difference between them is the only thing that shows
 * whether a post kept working.
 *
 * ⚠️ A READING WITH NO FIGURES AT ALL IS REFUSED — an empty row would count as
 * a measurement that found nothing, which is not what happened.
 */
export async function addResult(input: {
  publicationId: number;
  readAt?: string;
  source?: string;
  reach?: number | string | null;
  impressions?: number | string | null;
  likes?: number | string | null;
  comments?: number | string | null;
  shares?: number | string | null;
  saves?: number | string | null;
  clicks?: number | string | null;
  followers?: number | string | null;
  notes?: string | null;
}, by = "web-ui") {
  const figures = {
    reach: figure(input.reach),
    impressions: figure(input.impressions),
    likes: figure(input.likes),
    comments: figure(input.comments),
    shares: figure(input.shares),
    saves: figure(input.saves),
    clicks: figure(input.clicks),
    followers: figure(input.followers),
  };
  if (Object.values(figures).every((v) => v == null)) {
    throw new Error("Put at least one figure in — an empty reading says nothing.");
  }

  const readAt = input.readAt || NOW();
  if (Date.parse(readAt) > Date.now() + 60_000) {
    throw new Error("That is in the future. A reading is what was true at a moment that has happened.");
  }

  const { error } = await sb.from("mkt_results").insert({
    publication_id: input.publicationId,
    read_at: readAt,
    source: input.source === "platform" ? "platform" : "typed",
    ...figures,
    notes: input.notes?.trim() || null,
    created_by: by,
  });
  if (error) {
    if (error.message.includes("mkt_results_once_idx")) {
      throw new Error("That reading is already recorded for this moment.");
    }
    throw new Error(error.message);
  }
}

/** Take back a reading that was typed wrongly. The only correction there is. */
export async function deleteResult(id: number) {
  const { error } = await sb.from("mkt_results").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Record money put behind advertising.
 *
 * ⚠️ `borneBy` DECIDES WHETHER IT COST US ANYTHING. Design and posting are free
 * for a client and the advert money is ours, so this is what answers "what has
 * the offer cost us". Anything but "client" is treated as ours — the safe
 * direction, because under-counting our own spend is the error nobody notices.
 */
export async function addSpend(input: {
  onDate: string;
  amount: number | string;
  currency?: string;
  borneBy?: string;
  publicationId?: number | null;
  accountId?: number | null;
  campaignId?: number | null;
  companyId?: number | null;
  clientId?: number | null;
  reference?: string | null;
  notes?: string | null;
}, by = "web-ui") {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Put in what it cost. Money coming back is a refund, which has nowhere to go yet.");
  }
  if (!input.onDate) throw new Error("Say which day it was spent.");

  const { error } = await sb.from("mkt_spend").insert({
    on_date: input.onDate,
    amount,
    currency: input.currency || "TZS",
    borne_by: input.borneBy === "client" ? "client" : "us",
    publication_id: input.publicationId ?? null,
    account_id: input.accountId ?? null,
    campaign_id: input.campaignId ?? null,
    company_id: input.companyId ?? null,
    client_id: input.clientId ?? null,
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: by,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSpend(id: number) {
  const { error } = await sb.from("mkt_spend").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
