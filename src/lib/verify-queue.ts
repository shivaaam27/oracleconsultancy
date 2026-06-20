// The Verify queue (review-by-exception): ONE worklist of the documents that need
// a human decision, pulled from flags the intake already sets. No new detection —
// it just gathers the exceptions so they can be cleared in bulk. Trash is NOT here
// (it's the already-decided bin); this is only "needs a decision".
//   • place  → quarantined (couldn't find an owner / unreadable / suspected dup)
//   • unsure → filed but a low-confidence read or flagged needs-review
//   • owner  → filed cleanly but no company/person attached yet

import { listDocuments } from "@/lib/documents";
import { getIntakeBucket } from "@/app/documents/actions";
import { sb } from "@/db/supabase";

export type VerifyGroup = "place" | "unsure" | "owner";

export type VerifyItem = {
  id: number;
  group: VerifyGroup;
  title: string;
  why: string | null;     // plain-language reason it's here
  owner: string | null;
  category: string | null;
  confidence: number | null;
};

const LOW_CONFIDENCE = 0.6;

export async function getVerifyQueue(): Promise<VerifyItem[]> {
  const [quarantine, filed, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    getIntakeBucket("quarantine"),
    listDocuments(), // archived=false → filed docs only
    sb.from("companies").select("id,name"),
    sb.from("people").select("id,name"),
  ]);
  const coName = new Map((companiesRaw ?? []).map((c) => [c.id as number, c.name as string]));
  const peName = new Map((peopleRaw ?? []).map((p) => [p.id as number, p.name as string]));

  const items: VerifyItem[] = [];

  // 1) Couldn't place — quarantine (suspected duplicates carry their reason here too).
  for (const q of quarantine) {
    items.push({ id: q.id, group: "place", title: q.title, why: q.reason, owner: q.owner, category: q.category, confidence: null });
  }

  // 2) Unsure reads + 3) No owner — filed docs only.
  for (const d of filed) {
    if (d.intakeState !== "filed") continue;
    const ownerName = (d.companyId ? coName.get(d.companyId) : null) ?? (d.personId ? peName.get(d.personId) : null) ?? null;
    const lowConf = d.confidence != null && d.confidence < LOW_CONFIDENCE;
    if (d.reviewStatus === "needs_review" || lowConf) {
      const why = d.confidence != null && lowConf
        ? `Unsure read — ${Math.round(d.confidence * 100)}% confidence`
        : d.needsOriginal ? "Awaiting the original" : "Flagged for a quick check";
      items.push({ id: d.id, group: "unsure", title: d.title, why, owner: ownerName, category: d.category, confidence: d.confidence });
    } else if (!d.companyId && !d.personId) {
      items.push({ id: d.id, group: "owner", title: d.title, why: "Filed with no owner yet", owner: null, category: d.category, confidence: d.confidence });
    }
  }

  return items;
}
