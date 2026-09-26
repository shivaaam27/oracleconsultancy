import "server-only";
import { getBrief, type BriefData } from "@/lib/reports/director-brief";

/**
 * getBrief, kept for a minute (26 Sept 2026: "the report loads very slowly").
 *
 * Opening the Report builds the whole brief to show four numbers, and the PDF
 * then built it AGAIN — a second or more each, on every open and every change
 * of filter. The same filters within a minute now reuse the first build, so
 * the PDF straight after the sheet is only the drawing.
 *
 * The key is the RESOLVED filters (after a director's scope is applied) plus
 * the Dar calendar day, so one person's cut can never be handed to another
 * whose scope differs. Per server instance; a minute old at most.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; brief: Promise<BriefData> }>();

type Args = Parameters<typeof getBrief>;

export function getBriefCached(period: Args[1], companyId: Args[2], opts: Args[3] = {}): Promise<BriefData> {
  const now = new Date();
  const day = now.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  const key = JSON.stringify([day, period, companyId ?? null, opts ?? {}]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brief;
  const brief = getBrief(now, period, companyId, opts);
  cache.set(key, { at: Date.now(), brief });
  brief.catch(() => cache.delete(key)); // a failed build is not kept
  if (cache.size > 50) {
    for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k);
  }
  return brief;
}
