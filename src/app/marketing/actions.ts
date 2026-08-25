"use server";

import { revalidatePath } from "next/cache";
import {
  addPublication, archiveAccount, archiveCampaign, archiveClient, archivePost,
  createAccount, createCampaign, createClient, createPost,
  markNotOut, markPublished, reschedule,
  updateAccount, updateCampaign, updateClient, updatePost,
} from "@/lib/marketing";
import {
  archiveAsset, archiveShoot, createShoot, deleteAsset, updateAsset,
} from "@/lib/marketing-assets";
import {
  addResult, addSpend, deleteResult, deleteSpend,
} from "@/lib/marketing-results";

/* ------------------------------------------------------------------ *
 * ⚠️ THIN WRAPPERS ONLY. Every rule lives in `src/lib/marketing.ts`, which is
 * the one door. These take FormData, call it, and revalidate — nothing here
 * decides anything, so there is no second place for a rule to drift to.
 * ------------------------------------------------------------------ */

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const int = (f: FormData, k: string) => {
  const v = str(f, k);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
/** A checkbox: present means ticked. */
const on = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

/** Three-state, and it must stay three-state — "" means nobody has said. */
const tri = (f: FormData, k: string): boolean | null => {
  const v = str(f, k);
  return v === "yes" ? true : v === "no" ? false : null;
};

function refresh() {
  revalidatePath("/marketing");
  revalidatePath("/marketing/posts");
  revalidatePath("/marketing/calendar");
  revalidatePath("/marketing/accounts");
  revalidatePath("/marketing/clients");
  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing/shoots");
  revalidatePath("/marketing/library");
  revalidatePath("/marketing/results");
}

/* ── posts ───────────────────────────────────────────────────────────────── */

export async function createPostAction(f: FormData) {
  await createPost({
    title: str(f, "title") ?? "",
    caption: str(f, "caption"),
    kind: str(f, "kind") ?? "photo",
    campaignId: int(f, "campaignId"),
    companyId: int(f, "companyId"),
    clientId: int(f, "clientId"),
    notes: str(f, "notes"),
    accountIds: f.getAll("accountIds").map((v) => Number(v)).filter(Number.isFinite),
    plannedFor: str(f, "plannedFor"),
    alreadyPublished: on(f, "alreadyPublished"),
    url: str(f, "url"),
    assetIds: f.getAll("assetIds").map((v) => Number(v)).filter(Number.isFinite),
  });
  refresh();
}

export async function updatePostAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which post?");
  await updatePost(id, {
    title: str(f, "title"),
    caption: str(f, "caption"),
    kind: str(f, "kind") ?? "photo",
    campaign_id: int(f, "campaignId"),
    company_id: int(f, "companyId"),
    client_id: int(f, "clientId"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function archivePostAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which post?");
  await archivePost(id, !on(f, "restore"));
  refresh();
}

/* ── publications ────────────────────────────────────────────────────────── */

export async function addPublicationAction(f: FormData) {
  const postId = int(f, "postId");
  const accountId = int(f, "accountId");
  if (postId == null || accountId == null) throw new Error("Pick a post and an account.");
  await addPublication(postId, accountId, str(f, "plannedFor"));
  refresh();
}

export async function markPublishedAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which publication?");
  await markPublished(id, { publishedAt: str(f, "publishedAt") ?? undefined, url: str(f, "url") });
  refresh();
}

/** ⚠️ Never a delete — see the write door. The reason is required there. */
export async function markNotOutAction(f: FormData) {
  const id = int(f, "id");
  const status = str(f, "status");
  if (id == null || (status !== "failed" && status !== "removed")) {
    throw new Error("Say whether it failed or was taken down.");
  }
  await markNotOut(id, status, str(f, "reason") ?? "");
  refresh();
}

export async function rescheduleAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which publication?");
  await reschedule(id, str(f, "plannedFor"));
  refresh();
}

/* ── accounts ────────────────────────────────────────────────────────────── */

export async function createAccountAction(f: FormData) {
  await createAccount({
    platform: str(f, "platform") ?? "instagram",
    handle: str(f, "handle") ?? "",
    displayName: str(f, "displayName"),
    companyId: int(f, "companyId"),
    clientId: int(f, "clientId"),
    profileUrl: str(f, "profileUrl"),
    professional: tri(f, "professional"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function updateAccountAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which account?");
  await updateAccount(id, {
    display_name: str(f, "displayName"),
    profile_url: str(f, "profileUrl"),
    professional: tri(f, "professional"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function archiveAccountAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which account?");
  await archiveAccount(id, !on(f, "restore"));
  refresh();
}

/* ── clients ─────────────────────────────────────────────────────────────── */

export async function createClientAction(f: FormData) {
  await createClient({
    name: str(f, "name") ?? "",
    contactName: str(f, "contactName"),
    contactPhone: str(f, "contactPhone"),
    contactEmail: str(f, "contactEmail"),
    freeMonths: int(f, "freeMonths") ?? 3,
    freeStartsOn: str(f, "freeStartsOn"),
    adCapMonthly: int(f, "adCapMonthly"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function updateClientAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which client?");
  await updateClient(id, {
    name: str(f, "name"),
    contact_name: str(f, "contactName"),
    contact_phone: str(f, "contactPhone"),
    contact_email: str(f, "contactEmail"),
    free_months: int(f, "freeMonths") ?? 3,
    // ⚠️ Left null on purpose when empty: the clock then starts on the first
    // post, which is the whole design. Do not default this to today.
    free_starts_on: str(f, "freeStartsOn"),
    ad_cap_monthly: int(f, "adCapMonthly"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function archiveClientAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which client?");
  await archiveClient(id, !on(f, "restore"));
  refresh();
}

/* ── campaigns ───────────────────────────────────────────────────────────── */

export async function createCampaignAction(f: FormData) {
  await createCampaign({
    name: str(f, "name") ?? "",
    purpose: str(f, "purpose"),
    companyId: int(f, "companyId"),
    clientId: int(f, "clientId"),
    startsOn: str(f, "startsOn"),
    endsOn: str(f, "endsOn"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function updateCampaignAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which campaign?");
  await updateCampaign(id, {
    name: str(f, "name"),
    purpose: str(f, "purpose"),
    company_id: int(f, "companyId"),
    client_id: int(f, "clientId"),
    starts_on: str(f, "startsOn"),
    ends_on: str(f, "endsOn"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function archiveCampaignAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which campaign?");
  await archiveCampaign(id, !on(f, "restore"));
  refresh();
}

/* ── shoots and pictures (Phase 2) ───────────────────────────────────────── */

export async function createShootAction(f: FormData) {
  await createShoot({
    title: str(f, "title") ?? "",
    onDate: str(f, "onDate"),
    place: str(f, "place"),
    photographerId: int(f, "photographerId"),
    companyId: int(f, "companyId"),
    clientId: int(f, "clientId"),
    // ⚠️ Stays three-state: "" means nobody has said, which is not "no".
    consent: tri(f, "consent"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function archiveShootAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which shoot?");
  await archiveShoot(id, !on(f, "restore"));
  refresh();
}

export async function updateAssetAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which picture?");
  await updateAsset(id, {
    caption: str(f, "caption"),
    tags: str(f, "tags"),
    shoot_id: int(f, "shootId"),
    company_id: int(f, "companyId"),
    client_id: int(f, "clientId"),
  });
  refresh();
}

export async function archiveAssetAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which picture?");
  await archiveAsset(id, !on(f, "restore"));
  refresh();
}

/** ⚠️ Refused by the write door when a post was made from it. */
export async function deleteAssetAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which picture?");
  await deleteAsset(id);
  refresh();
}

/* ── results and money (Phase 3) ─────────────────────────────────────────── */

/** ⚠️ ADDS a reading; it never edits one. See the write door. */
export async function addResultAction(f: FormData) {
  const publicationId = int(f, "publicationId");
  if (publicationId == null) throw new Error("Which publication?");
  await addResult({
    publicationId,
    readAt: str(f, "readAt") ?? undefined,
    source: str(f, "source") ?? "typed",
    reach: str(f, "reach"),
    impressions: str(f, "impressions"),
    likes: str(f, "likes"),
    comments: str(f, "comments"),
    shares: str(f, "shares"),
    saves: str(f, "saves"),
    clicks: str(f, "clicks"),
    followers: str(f, "followers"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function deleteResultAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which reading?");
  await deleteResult(id);
  refresh();
}

export async function addSpendAction(f: FormData) {
  await addSpend({
    onDate: str(f, "onDate") ?? "",
    amount: str(f, "amount") ?? "",
    currency: str(f, "currency") ?? "TZS",
    // ⚠️ Anything but "client" is ours — under-counting our own spend is the
    // error nobody notices.
    borneBy: str(f, "borneBy") ?? "us",
    publicationId: int(f, "publicationId"),
    accountId: int(f, "accountId"),
    campaignId: int(f, "campaignId"),
    companyId: int(f, "companyId"),
    clientId: int(f, "clientId"),
    reference: str(f, "reference"),
    notes: str(f, "notes"),
  });
  refresh();
}

export async function deleteSpendAction(f: FormData) {
  const id = int(f, "id");
  if (id == null) throw new Error("Which entry?");
  await deleteSpend(id);
  refresh();
}
