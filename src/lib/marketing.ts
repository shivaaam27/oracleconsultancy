import { sb } from "@/db/supabase";
import {
  freePeriod, postState, tidyHandle,
  type FreePeriod, type MktAccount, type MktClient, type MktPublication, type PostState,
} from "@/lib/marketing-shared";

/* ------------------------------------------------------------------ *
 * MARKETING — the SERVER half. Phase 1: the record and the calendar.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`). They import
 * `marketing-shared.ts`, which is pure.
 *
 * ⚠️ ONE DOOR FOR WRITES. Every create/update/publish goes through a function
 * here; the server actions in `src/app/marketing/actions.ts` are thin wrappers
 * that take FormData and revalidate. A second write path is a second set of
 * records, exactly as a second insert into gl_entries would be a second set of
 * books.
 *
 * ⚠️ NOTHING TALKS TO A PLATFORM. Every figure in Phase 1 is typed by a person.
 * That is not a shortcut — Instagram, TikTok and LinkedIn each need an
 * application that takes weeks and can be refused, and a module that cannot be
 * used until one is granted is a module that cannot be used.
 *
 * ⚠️ NOTHING DERIVED IS STORED. No post status, no free-period end date, no
 * counts. They are worked out on read by `marketing-shared.ts`.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();

/**
 * Guard a required text column against being blanked.
 *
 * ⚠️ A FORM HELPER THAT RETURNS null FOR AN EMPTY FIELD WILL HAPPILY WRITE THAT
 * null INTO A NOT NULL COLUMN. Postgres then throws something no one can act on
 * — and a field simply MISSING from the form would silently wipe the record's
 * name. So a patch that carries the key must carry a real value.
 */
function requireText(patch: Record<string, unknown>, key: string, what: string) {
  if (!(key in patch)) return;                       // not being changed — fine
  const v = patch[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(what);
}

/** ⚠️ ONE STRING LITERAL per select list — split across a `+` and the Supabase
 *  client stops reading it at type level, every row degrades to an error type,
 *  and the file stops compiling for a reason that looks unrelated. */
const CLIENT_COLS = "id,name,contact_name,contact_phone,contact_email,free_months,free_starts_on,ad_cap_monthly,notes,archived,created_by,created_at,updated_at";
const ACCOUNT_COLS = "id,platform,handle,display_name,company_id,client_id,profile_url,professional,notes,archived,created_by,created_at,updated_at";
const CAMPAIGN_COLS = "id,name,purpose,company_id,client_id,starts_on,ends_on,notes,archived,created_by,created_at,updated_at";
const POST_COLS = "id,title,caption,kind,campaign_id,company_id,client_id,notes,archived,created_by,created_at,updated_at";
const PUB_COLS = "id,post_id,account_id,status,planned_for,published_at,url,reason,created_by,created_at,updated_at";

/* ── row shapes as they come back ────────────────────────────────────────── */

type ClientRow = {
  id: number; name: string; contact_name: string | null; contact_phone: string | null;
  contact_email: string | null; free_months: number; free_starts_on: string | null;
  ad_cap_monthly: string | null; notes: string | null; archived: boolean;
  created_by: string; created_at: string; updated_at: string;
};
type AccountRow = {
  id: number; platform: string; handle: string; display_name: string | null;
  company_id: number | null; client_id: number | null; profile_url: string | null;
  professional: boolean | null; notes: string | null; archived: boolean;
  created_by: string; created_at: string; updated_at: string;
};
type CampaignRow = {
  id: number; name: string; purpose: string | null; company_id: number | null;
  client_id: number | null; starts_on: string | null; ends_on: string | null;
  notes: string | null; archived: boolean; created_by: string; created_at: string; updated_at: string;
};
type PostRow = {
  id: number; title: string; caption: string | null; kind: string;
  campaign_id: number | null; company_id: number | null; client_id: number | null;
  notes: string | null; archived: boolean; created_by: string; created_at: string; updated_at: string;
};
type PubRow = {
  id: number; post_id: number; account_id: number; status: string;
  planned_for: string | null; published_at: string | null; url: string | null;
  reason: string | null; created_by: string; created_at: string; updated_at: string;
};

const toAccount = (r: AccountRow): MktAccount => ({
  id: r.id, platform: r.platform, handle: r.handle, displayName: r.display_name,
  companyId: r.company_id, clientId: r.client_id, profileUrl: r.profile_url,
  professional: r.professional, archived: r.archived,
});
const toPub = (r: PubRow): MktPublication => ({
  id: r.id, postId: r.post_id, accountId: r.account_id, status: r.status,
  plannedFor: r.planned_for, publishedAt: r.published_at, url: r.url, reason: r.reason,
});
const toClient = (r: ClientRow): MktClient => ({
  id: r.id, name: r.name, freeMonths: r.free_months, freeStartsOn: r.free_starts_on,
  adCapMonthly: r.ad_cap_monthly, archived: r.archived,
});

/* ── reading ─────────────────────────────────────────────────────────────── */

export async function listClients(includeArchived = false): Promise<ClientRow[]> {
  let q = sb.from("mkt_clients").select(CLIENT_COLS).order("name");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as ClientRow[];
}

export async function listAccounts(includeArchived = false): Promise<AccountRow[]> {
  let q = sb.from("mkt_accounts").select(ACCOUNT_COLS).order("platform").order("handle");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as AccountRow[];
}

export async function listCampaigns(includeArchived = false): Promise<CampaignRow[]> {
  let q = sb.from("mkt_campaigns").select(CAMPAIGN_COLS).order("name");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as CampaignRow[];
}

export async function listPosts(includeArchived = false): Promise<PostRow[]> {
  let q = sb.from("mkt_posts").select(POST_COLS).order("created_at", { ascending: false });
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as PostRow[];
}

export async function listPublications(postIds?: number[]): Promise<PubRow[]> {
  let q = sb.from("mkt_publications").select(PUB_COLS);
  if (postIds) {
    if (postIds.length === 0) return [];
    q = q.in("post_id", postIds);
  }
  const { data } = await q;
  return (data ?? []) as PubRow[];
}

export async function getPost(id: number) {
  const { data } = await sb.from("mkt_posts").select(POST_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const pubs = await listPublications([id]);
  return { post: data as PostRow, publications: pubs.map(toPub) };
}

/** A post plus the state worked out from its publications. */
export type PostWithState = PostRow & { publications: MktPublication[]; state: PostState };

export async function listPostsWithState(includeArchived = false): Promise<PostWithState[]> {
  const posts = await listPosts(includeArchived);
  const pubs = await listPublications(posts.map((p) => p.id));
  const byPost = new Map<number, MktPublication[]>();
  for (const r of pubs) {
    const p = toPub(r);
    const list = byPost.get(p.postId) ?? [];
    list.push(p);
    byPost.set(p.postId, list);
  }
  return posts.map((p) => {
    const publications = byPost.get(p.id) ?? [];
    return { ...p, publications, state: postState(publications) };
  });
}

/**
 * When each client's free advertising started and how it stands.
 *
 * ⚠️ THE CLOCK STARTS ON THE FIRST POST THAT ACTUALLY WENT OUT — the owner had
 * set no start date because posting had not begun, so the module works it out
 * rather than asking. Only publications on THAT client's own accounts count.
 */
export async function clientFreePeriods(today = new Date()): Promise<Map<number, FreePeriod>> {
  const [clients, accounts, pubs] = await Promise.all([
    listClients(true), listAccounts(true), listPublications(),
  ]);

  const clientOfAccount = new Map<number, number>();
  for (const a of accounts) if (a.client_id != null) clientOfAccount.set(a.id, a.client_id);

  // Earliest moment anything actually went out, per client.
  const firstOut = new Map<number, string>();
  for (const p of pubs) {
    if (p.status !== "published" || !p.published_at) continue;
    const clientId = clientOfAccount.get(p.account_id);
    if (clientId == null) continue;
    const seen = firstOut.get(clientId);
    if (!seen || p.published_at < seen) firstOut.set(clientId, p.published_at);
  }

  const out = new Map<number, FreePeriod>();
  for (const c of clients) {
    out.set(c.id, freePeriod(toClient(c), firstOut.get(c.id) ?? null, today));
  }
  return out;
}

/* ── writing — the one door ──────────────────────────────────────────────── */

export type Actor = string; // "web-ui", or "portal:Name" later

export async function createClient(input: {
  name: string; contactName?: string | null; contactPhone?: string | null;
  contactEmail?: string | null; freeMonths?: number; freeStartsOn?: string | null;
  adCapMonthly?: number | null; notes?: string | null;
}, by: Actor = "web-ui") {
  const name = input.name.trim();
  if (!name) throw new Error("A client needs a name.");
  const { data, error } = await sb.from("mkt_clients").insert({
    name,
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    contact_email: input.contactEmail?.trim() || null,
    free_months: input.freeMonths ?? 3,
    free_starts_on: input.freeStartsOn || null,
    ad_cap_monthly: input.adCapMonthly ?? null,
    notes: input.notes?.trim() || null,
    created_by: by,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as number;
}

export async function updateClient(id: number, patch: Record<string, unknown>) {
  requireText(patch, "name", "A client needs a name.");
  const { error } = await sb.from("mkt_clients")
    .update({ ...patch, updated_at: NOW() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Archive, never delete — the same habit as everywhere else in COS. */
export async function archiveClient(id: number, archived = true) {
  await updateClient(id, { archived });
}

export async function createAccount(input: {
  platform: string; handle: string; displayName?: string | null;
  companyId?: number | null; clientId?: number | null;
  profileUrl?: string | null; professional?: boolean | null; notes?: string | null;
}, by: Actor = "web-ui") {
  const handle = tidyHandle(input.handle ?? "");
  if (handle === "@") throw new Error("An account needs a handle.");

  // ⚠️ EXACTLY ONE OWNER. The database enforces this too, but a clear message
  // here beats a constraint violation surfacing as a wall of Postgres.
  const hasCompany = input.companyId != null;
  const hasClient = input.clientId != null;
  if (hasCompany === hasClient) {
    throw new Error("An account belongs either to one of our companies or to a client — not both, and not neither.");
  }

  const { data, error } = await sb.from("mkt_accounts").insert({
    platform: input.platform,
    handle,
    display_name: input.displayName?.trim() || null,
    company_id: input.companyId ?? null,
    client_id: input.clientId ?? null,
    profile_url: input.profileUrl?.trim() || null,
    // ⚠️ Left as null unless somebody actually said. "Nobody has checked" and
    // "it is a personal account" are different facts.
    professional: input.professional ?? null,
    notes: input.notes?.trim() || null,
    created_by: by,
  }).select("id").single();
  if (error) {
    if (error.message.includes("mkt_accounts_handle_idx")) {
      throw new Error(`${handle} is already recorded on ${input.platform}.`);
    }
    throw new Error(error.message);
  }
  return data!.id as number;
}

export async function updateAccount(id: number, patch: Record<string, unknown>) {
  const { error } = await sb.from("mkt_accounts")
    .update({ ...patch, updated_at: NOW() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveAccount(id: number, archived = true) {
  await updateAccount(id, { archived });
}

export async function createCampaign(input: {
  name: string; purpose?: string | null; companyId?: number | null;
  clientId?: number | null; startsOn?: string | null; endsOn?: string | null; notes?: string | null;
}, by: Actor = "web-ui") {
  const name = input.name.trim();
  if (!name) throw new Error("A campaign needs a name.");
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    throw new Error("A campaign cannot end before it starts.");
  }
  const { data, error } = await sb.from("mkt_campaigns").insert({
    name,
    purpose: input.purpose?.trim() || null,
    company_id: input.companyId ?? null,
    client_id: input.clientId ?? null,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    notes: input.notes?.trim() || null,
    created_by: by,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as number;
}

export async function updateCampaign(id: number, patch: Record<string, unknown>) {
  requireText(patch, "name", "A campaign needs a name.");
  const { error } = await sb.from("mkt_campaigns")
    .update({ ...patch, updated_at: NOW() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveCampaign(id: number, archived = true) {
  await updateCampaign(id, { archived });
}

/**
 * Write down a post — and, in the same breath, where it is going.
 *
 * ⚠️ THIS IS THE QUICK LOG, AND SPEED IS THE WHOLE POINT. One person does the
 * posting; if writing it down takes more than a few seconds it stops happening
 * in week three, and a half-filled record is worse than none because it still
 * gets half-trusted. So only a title is required. Accounts, caption, campaign,
 * times and links are all optional and can be filled in afterwards.
 */
export async function createPost(input: {
  title: string; caption?: string | null; kind?: string;
  campaignId?: number | null; companyId?: number | null; clientId?: number | null;
  notes?: string | null;
  /** Where it is going. Empty is fine — that is an idea, not a mistake. */
  accountIds?: number[];
  /** When it is due. Null with accounts named means "out already", see below. */
  plannedFor?: string | null;
  /** Tick when you are logging something you have JUST posted by hand. */
  alreadyPublished?: boolean;
  url?: string | null;
  /** Which pictures it was made from. Optional — a text post uses none. */
  assetIds?: number[];
}, by: Actor = "web-ui") {
  const title = input.title.trim();
  if (!title) throw new Error("Give it a short name so you can find it again.");

  const { data, error } = await sb.from("mkt_posts").insert({
    title,
    caption: input.caption?.trim() || null,
    kind: input.kind || "photo",
    campaign_id: input.campaignId ?? null,
    company_id: input.companyId ?? null,
    client_id: input.clientId ?? null,
    notes: input.notes?.trim() || null,
    created_by: by,
  }).select("id").single();
  if (error) throw new Error(error.message);
  const postId = data!.id as number;

  const accounts = input.accountIds ?? [];
  if (accounts.length) {
    const when = NOW();
    const rows = accounts.map((accountId) => ({
      post_id: postId,
      account_id: accountId,
      status: input.alreadyPublished ? "published" : "planned",
      planned_for: input.alreadyPublished ? null : (input.plannedFor || null),
      published_at: input.alreadyPublished ? when : null,
      url: input.url?.trim() || null,
      created_by: by,
    }));
    const { error: pubErr } = await sb.from("mkt_publications").insert(rows);
    if (pubErr) {
      // ⚠️ Roll the post back rather than leaving one with no destinations and
      // no explanation. There is no transaction to fall back on here.
      await sb.from("mkt_posts").delete().eq("id", postId);
      throw new Error(pubErr.message);
    }
  }

  // ⚠️ WITHOUT THIS, NOTHING EVER WRITES `mkt_post_assets` — and the library's
  // "never used" pile, which is the reason that table exists, would read 100%
  // for ever. Attached last: a picture that fails to link is worth reporting,
  // but it must not lose the post itself.
  const assetIds = input.assetIds ?? [];
  if (assetIds.length) {
    const { error: linkErr } = await sb.from("mkt_post_assets").upsert(
      assetIds.map((assetId, i) => ({ post_id: postId, asset_id: assetId, sort_order: i })),
      { onConflict: "post_id,asset_id" },
    );
    if (linkErr) throw new Error(`The post saved, but the pictures did not attach: ${linkErr.message}`);
  }
  return postId;
}

export async function updatePost(id: number, patch: Record<string, unknown>) {
  requireText(patch, "title", "Give it a short name so you can find it again.");
  const { error } = await sb.from("mkt_posts")
    .update({ ...patch, updated_at: NOW() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archivePost(id: number, archived = true) {
  await updatePost(id, { archived });
}

/** Send a post somewhere else as well. Idempotent — the index refuses a repeat. */
export async function addPublication(postId: number, accountId: number, plannedFor: string | null, by: Actor = "web-ui") {
  const { error } = await sb.from("mkt_publications").insert({
    post_id: postId, account_id: accountId, status: "planned",
    planned_for: plannedFor || null, created_by: by,
  });
  if (error) {
    if (error.message.includes("mkt_publications_once_idx")) {
      throw new Error("That post is already going to that account.");
    }
    throw new Error(error.message);
  }
}

/**
 * Say it went out.
 *
 * ⚠️ `publishedAt` IS THE REAL MOMENT, and it is what starts a client's free
 * three months — so it is never guessed. Recording it a day late is normal and
 * allowed; recording it in the FUTURE is refused, because that would leave the
 * post absent from this week's count until the date came round.
 */
export async function markPublished(id: number, opts: { publishedAt?: string; url?: string | null } = {}) {
  const when = opts.publishedAt || NOW();
  if (Date.parse(when) > Date.now() + 60_000) {
    throw new Error("That is in the future. If it has not gone out yet, schedule it instead.");
  }
  const { error } = await sb.from("mkt_publications").update({
    status: "published",
    published_at: when,
    url: opts.url?.trim() || null,
    reason: null,
    updated_at: NOW(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * It did not go out, or it has been taken down.
 *
 * ⚠️ NEVER A DELETE. A post taken down from Instagram still happened, and last
 * quarter's report must not change because somebody tidied a feed. And the
 * reason is REQUIRED — "removed" with no explanation is the row nobody can act
 * on six months later.
 */
export async function markNotOut(id: number, status: "failed" | "removed", reason: string) {
  const why = reason.trim();
  if (!why) {
    throw new Error(status === "failed"
      ? "Say what went wrong — a failure with no reason cannot be fixed."
      : "Say why it was taken down.");
  }
  const { error } = await sb.from("mkt_publications").update({
    status, reason: why, updated_at: NOW(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Move a planned publication to another time. */
export async function reschedule(id: number, plannedFor: string | null) {
  const { error } = await sb.from("mkt_publications").update({
    status: "planned", planned_for: plannedFor || null, published_at: null, updated_at: NOW(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
}
