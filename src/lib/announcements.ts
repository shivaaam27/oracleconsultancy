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
  "id,title,body,type,audience_kind,audience_values,pinned,require_ack,deliver_channels,takeover,status,publish_at,expires_at,created_by,author_person_id,created_at,published_at";

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
    deliverChannels: (r.deliver_channels as string[] | null) ?? [],
    takeover: Boolean(r.takeover),
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
  const liveIds = live.map((a) => a.id);
  const [{ data: receipts }, { data: reactions }, { data: comments }] = await Promise.all([
    sb.from("announcement_receipts").select("announcement_id,seen_at,ack_at").eq("recipient", `person:${attrs.id}`).in("announcement_id", liveIds),
    sb.from("announcement_reactions").select("announcement_id,person_id,emoji").in("announcement_id", liveIds),
    sb.from("announcement_comments").select("announcement_id").in("announcement_id", liveIds),
  ]);
  const byId = new Map((receipts ?? []).map((r) => [r.announcement_id as number, r]));
  const rxSummary = new Map<number, Record<string, number>>();
  const rxMine = new Map<number, string[]>();
  for (const r of reactions ?? []) {
    const aid = r.announcement_id as number;
    const emoji = r.emoji as string;
    const s = rxSummary.get(aid) ?? {};
    s[emoji] = (s[emoji] ?? 0) + 1;
    rxSummary.set(aid, s);
    if ((r.person_id as number) === attrs.id) rxMine.set(aid, [...(rxMine.get(aid) ?? []), emoji]);
  }
  const commentCount = new Map<number, number>();
  for (const c of comments ?? []) {
    const aid = c.announcement_id as number;
    commentCount.set(aid, (commentCount.get(aid) ?? 0) + 1);
  }
  return live.map((a) => {
    const r = byId.get(a.id);
    return {
      ...a,
      seenAt: (r?.seen_at as string | null) ?? null,
      ackAt: (r?.ack_at as string | null) ?? null,
      reactions: rxSummary.get(a.id) ?? {},
      myReactions: rxMine.get(a.id) ?? [],
      commentCount: commentCount.get(a.id) ?? 0,
    };
  });
}

/* --------------------------- reactions & questions (A6) --------------------------- */

/** Toggle an emoji reaction for a person; returns whether it's now on. */
export async function toggleReaction(announcementId: number, personId: number, emoji: string): Promise<boolean> {
  const { data: existing } = await sb
    .from("announcement_reactions")
    .select("emoji")
    .eq("announcement_id", announcementId)
    .eq("person_id", personId)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existing) {
    await sb.from("announcement_reactions").delete().eq("announcement_id", announcementId).eq("person_id", personId).eq("emoji", emoji);
    return false;
  }
  await sb.from("announcement_reactions").insert({ announcement_id: announcementId, person_id: personId, emoji, created_at: new Date().toISOString() });
  return true;
}

export async function listComments(announcementId: number) {
  const { data } = await sb
    .from("announcement_comments")
    .select("id,person_id,author_name,body,is_answer,created_at")
    .eq("announcement_id", announcementId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id as number,
    personId: (c.person_id as number | null) ?? null,
    authorName: c.author_name as string,
    body: c.body as string,
    isAnswer: Boolean(c.is_answer),
    createdAt: c.created_at as string,
  }));
}

export async function addComment(input: {
  announcementId: number;
  personId: number | null;
  authorName: string;
  body: string;
  isAnswer: boolean;
}): Promise<number | null> {
  const { data } = await sb
    .from("announcement_comments")
    .insert({
      announcement_id: input.announcementId,
      person_id: input.personId,
      author_name: input.authorName,
      body: input.body,
      is_answer: input.isAnswer,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return (data?.id as number | undefined) ?? null;
}

/** Live "takeover" announcements targeting this person that they must still
 *  acknowledge — drives the full-screen blocking card on portal landing. */
export async function takeoverFeedForPerson(attrs: PersonAudienceAttrs): Promise<FeedAnnouncement[]> {
  const feed = await feedForPerson(attrs);
  return feed.filter((a) => a.takeover && a.requireAck && !a.ackAt);
}

/* --------------------------- delivery (A4) --------------------------- */

/** For an announcement's selected channels, create Outbox drafts to the audience
 *  (one per person with that contact). Push fires separately via notifications.
 *  Best-effort — a delivery hiccup never blocks publishing. */
export async function createDeliveryDrafts(a: Announcement): Promise<void> {
  const channels = (a.deliverChannels ?? []).map((c) => c.toLowerCase());
  const wantEmail = channels.includes("email");
  const wantWhatsapp = channels.includes("whatsapp");
  if (!wantEmail && !wantWhatsapp) return;
  try {
    const ids = await resolveAudiencePersonIds(a);
    if (ids.length === 0) return;
    const { data } = await sb
      .from("people")
      .select("id,name,email,whatsapp,phone,companies(name)")
      .in("id", ids);
    const nowIso = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    for (const p of data ?? []) {
      const company = (Array.isArray(p.companies) ? p.companies[0] : p.companies) as { name: string } | null;
      const base = {
        company: company?.name ?? null,
        subject: a.title,
        body: a.body || a.title,
        message_type: "ANNOUNCEMENT",
        status: "Draft",
        source: "announcement",
        person_id: p.id as number,
        created_at: nowIso,
      };
      if (wantEmail && p.email) rows.push({ ...base, channel: "EMAIL", recipient_name: p.name, recipient_contact: p.email });
      const wa = (p.whatsapp as string | null) ?? (p.phone as string | null);
      if (wantWhatsapp && wa) rows.push({ ...base, channel: "WHATSAPP", recipient_name: p.name, recipient_contact: wa });
    }
    if (rows.length > 0) await sb.from("outbox").insert(rows);
  } catch {
    /* best-effort */
  }
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
