import "server-only";
import { sb } from "@/db/supabase";
import {
  type Announcement,
  type AudienceKind,
  type FeedAnnouncement,
  type PersonAudienceAttrs,
  type ReceiptStats,
  isLive,
  announcementTargetsPerson,
} from "./announcements-shared";

/* ------------------------------------------------------------------ *
 * Announcements — server-side reads/writes. Pure types, constants and
 * predicates live in announcements-shared.ts (client-safe).
 * ------------------------------------------------------------------ */

export * from "./announcements-shared";

const COLS =
  "id,title,body,type,audience_kind,audience_values,pinned,require_ack,status,publish_at,expires_at,created_by,author_person_id,created_at,published_at";

function mapRow(r: Record<string, unknown>): Announcement {
  return {
    id: r.id as number,
    title: r.title as string,
    body: (r.body as string | null) ?? "",
    type: (r.type as Announcement["type"]) ?? "operational",
    audienceKind: (r.audience_kind as AudienceKind) ?? "all",
    audienceValues: (r.audience_values as (number | string)[] | null) ?? [],
    pinned: Boolean(r.pinned),
    requireAck: Boolean(r.require_ack),
    status: (r.status as Announcement["status"]) ?? "draft",
    publishAt: (r.publish_at as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    createdBy: (r.created_by as string) ?? "web-ui",
    authorPersonId: (r.author_person_id as number | null) ?? null,
    createdAt: r.created_at as string,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

/* ----------------------------- reads ------------------------------ */

/** Admin: every announcement (drafts + published), newest first. */
export async function listAnnouncements(includeArchived = false): Promise<Announcement[]> {
  let q = sb.from("announcements").select(COLS).order("created_at", { ascending: false });
  if (!includeArchived) q = q.neq("status", "archived");
  const { data } = await q;
  return (data ?? []).map(mapRow);
}

export async function getAnnouncement(id: number): Promise<Announcement | null> {
  const { data } = await sb.from("announcements").select(COLS).eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
}

/* ------------------ audience ------------------ */

/** Pull the few attributes needed to decide which announcements reach a person. */
export async function getPersonAudienceAttrs(personId: number): Promise<PersonAudienceAttrs | null> {
  const { data } = await sb
    .from("people")
    .select("id,company_id,department_id,role,person_type,portal_role,work_site_id,residence_site_id")
    .eq("id", personId)
    .maybeSingle();
  if (!data) return null;
  const siteIds = [data.work_site_id as number | null, data.residence_site_id as number | null].filter(
    (v): v is number => typeof v === "number"
  );
  return {
    id: data.id as number,
    companyId: (data.company_id as number | null) ?? null,
    departmentId: (data.department_id as number | null) ?? null,
    role: (data.role as string | null) ?? null,
    personType: (data.person_type as string | null) ?? null,
    portalRole:
      data.portal_role === "manager" ? "manager" : data.portal_role === "director" ? "director" : "staff",
    siteIds,
  };
}

/** Resolve an audience to a concrete set of active person ids (for reach stats). */
export async function resolveAudiencePersonIds(a: Announcement): Promise<number[]> {
  const nums = a.audienceValues.filter((v): v is number => typeof v === "number");
  const strs = a.audienceValues.filter((v): v is string => typeof v === "string");
  const base = sb.from("people").select("id").eq("active", true);
  let q = base;
  switch (a.audienceKind) {
    case "all": break;
    case "company": q = base.in("company_id", nums.length ? nums : [-1]); break;
    case "department": q = base.in("department_id", nums.length ? nums : [-1]); break;
    case "site": {
      const list = nums.join(",") || "-1";
      const { data } = await base.or(`work_site_id.in.(${list}),residence_site_id.in.(${list})`);
      return (data ?? []).map((r) => r.id as number);
    }
    case "role": q = base.in("role", strs.length ? strs : ["__none__"]); break;
    case "person_type": q = base.in("person_type", strs.length ? strs : ["__none__"]); break;
    case "people": return nums;
    case "managers": q = base.in("portal_role", ["manager", "director"]); break;
    case "directors": q = base.eq("portal_role", "director"); break;
  }
  const { data } = await q;
  return (data ?? []).map((r) => r.id as number);
}

/** Number of people an announcement is aimed at — for "12 of 24 seen". */
export async function audienceCount(a: Announcement): Promise<number> {
  const ids = await resolveAudiencePersonIds(a);
  return ids.length;
}

/* ----------------------------- feed ------------------------------ */

/** Live announcements that target this person, with their own read/ack state.
 *  Pinned first, then newest. */
export async function feedForPerson(attrs: PersonAudienceAttrs): Promise<FeedAnnouncement[]> {
  const now = new Date();
  const { data } = await sb
    .from("announcements")
    .select(COLS)
    .eq("status", "published")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false });
  const live = (data ?? []).map(mapRow).filter((a) => isLive(a, now) && announcementTargetsPerson(a, attrs));
  if (live.length === 0) return [];
  const { data: receipts } = await sb
    .from("announcement_receipts")
    .select("announcement_id,seen_at,ack_at")
    .eq("recipient", `person:${attrs.id}`)
    .in("announcement_id", live.map((a) => a.id));
  const byId = new Map((receipts ?? []).map((r) => [r.announcement_id as number, r]));
  return live.map((a) => {
    const r = byId.get(a.id);
    return { ...a, seenAt: (r?.seen_at as string | null) ?? null, ackAt: (r?.ack_at as string | null) ?? null };
  });
}

/* --------------------------- receipts --------------------------- */

export async function markSeen(announcementId: number, recipient: string): Promise<void> {
  const { data: existing } = await sb
    .from("announcement_receipts")
    .select("seen_at")
    .eq("announcement_id", announcementId)
    .eq("recipient", recipient)
    .maybeSingle();
  if (existing?.seen_at) return;
  await sb
    .from("announcement_receipts")
    .upsert(
      { announcement_id: announcementId, recipient, seen_at: new Date().toISOString() },
      { onConflict: "announcement_id,recipient" }
    );
}

export async function acknowledge(announcementId: number, recipient: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await sb
    .from("announcement_receipts")
    .upsert(
      { announcement_id: announcementId, recipient, seen_at: nowIso, ack_at: nowIso },
      { onConflict: "announcement_id,recipient" }
    );
}

/** Reach/seen/acknowledged counts for an announcement (admin analytics). */
export async function receiptStats(a: Announcement): Promise<ReceiptStats> {
  const total = await audienceCount(a);
  const { data } = await sb.from("announcement_receipts").select("seen_at,ack_at").eq("announcement_id", a.id);
  const rows = data ?? [];
  return { total, seen: rows.filter((r) => r.seen_at).length, ack: rows.filter((r) => r.ack_at).length };
}

/** People who haven't yet seen a live announcement — for "chase the unseen". */
export async function unseenPersonIds(a: Announcement): Promise<number[]> {
  const targetIds = await resolveAudiencePersonIds(a);
  if (targetIds.length === 0) return [];
  const { data } = await sb
    .from("announcement_receipts")
    .select("recipient")
    .eq("announcement_id", a.id)
    .not("seen_at", "is", null);
  const seen = new Set(
    (data ?? [])
      .map((r) => ((r.recipient as string).startsWith("person:") ? Number((r.recipient as string).slice(7)) : null))
      .filter((v): v is number => v != null)
  );
  return targetIds.filter((id) => !seen.has(id));
}
