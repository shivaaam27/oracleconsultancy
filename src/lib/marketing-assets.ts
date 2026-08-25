import { sb } from "@/db/supabase";

/* ------------------------------------------------------------------ *
 * MARKETING, Phase 2 — photography and the library. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ ONE DOOR FOR WRITES, as everywhere else here.
 *
 * ⚠️ THE BYTES NEVER PASS THROUGH THE SERVER. The browser uploads straight to
 * storage on a short-lived signed URL and this file only ever handles the PATH.
 * A serverless request body caps at 4.5 MB and a phone photo is bigger, so any
 * route that carried the file itself would reject exactly the pictures somebody
 * actually took.
 * ------------------------------------------------------------------ */

export const MARKETING_BUCKET = "marketing";

/** Where a file lands before it belongs to an asset row. Anything left here is
 *  an upload somebody abandoned, and safe to bin. */
export const STAGING = "uploads";

const NOW = () => new Date().toISOString();

/** ⚠️ ONE STRING LITERAL — see the note in `marketing.ts`. */
const SHOOT_COLS = "id,title,on_date,place,photographer_id,company_id,client_id,consent,notes,archived,created_by,created_at,updated_at";
const ASSET_COLS = "id,storage_path,file_name,mime,bytes,kind,shoot_id,company_id,client_id,caption,tags,taken_on,archived,created_by,created_at,updated_at";

export type ShootRow = {
  id: number; title: string; on_date: string | null; place: string | null;
  photographer_id: number | null; company_id: number | null; client_id: number | null;
  consent: boolean | null; notes: string | null; archived: boolean;
  created_by: string; created_at: string; updated_at: string;
};

export type AssetRow = {
  id: number; storage_path: string; file_name: string; mime: string | null;
  bytes: number | null; kind: string; shoot_id: number | null;
  company_id: number | null; client_id: number | null; caption: string | null;
  tags: string | null; taken_on: string | null; archived: boolean;
  created_by: string; created_at: string; updated_at: string;
};

/* ── reading ─────────────────────────────────────────────────────────────── */

export async function listShoots(includeArchived = false): Promise<ShootRow[]> {
  let q = sb.from("mkt_shoots").select(SHOOT_COLS).order("on_date", { ascending: false, nullsFirst: false });
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as ShootRow[];
}

export async function listAssets(includeArchived = false): Promise<AssetRow[]> {
  let q = sb.from("mkt_assets").select(ASSET_COLS).order("created_at", { ascending: false });
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as AssetRow[];
}

/** How many times each asset has been used. 0 = it is in the excess pile. */
export async function assetUseCounts(): Promise<Map<number, number>> {
  const { data } = await sb.from("mkt_post_assets").select("asset_id");
  const m = new Map<number, number>();
  for (const r of (data ?? []) as { asset_id: number }[]) {
    m.set(r.asset_id, (m.get(r.asset_id) ?? 0) + 1);
  }
  return m;
}

/**
 * Short-lived links for looking at pictures.
 *
 * ⚠️ MINTED ON READ, NEVER STORED. The bucket is private on purpose; a saved URL
 * would either expire in the record or, if it did not, be a permanent address
 * anybody could pass around.
 */
export async function signAssets(paths: string[], seconds = 60 * 60): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await sb.storage.from(MARKETING_BUCKET).createSignedUrls(paths, seconds);
  for (const r of data ?? []) {
    if (r.signedUrl && r.path) out.set(r.path, r.signedUrl);
  }
  return out;
}

/* ── writing — the one door ──────────────────────────────────────────────── */

export async function createShoot(input: {
  title: string; onDate?: string | null; place?: string | null;
  photographerId?: number | null; companyId?: number | null; clientId?: number | null;
  consent?: boolean | null; notes?: string | null;
}, by = "web-ui") {
  const title = input.title.trim();
  if (!title) throw new Error("A shoot needs a name.");
  const { data, error } = await sb.from("mkt_shoots").insert({
    title,
    on_date: input.onDate || null,
    place: input.place?.trim() || null,
    photographer_id: input.photographerId ?? null,
    company_id: input.companyId ?? null,
    client_id: input.clientId ?? null,
    // ⚠️ null unless somebody actually said. Defaulting consent to true would
    // answer a data-protection question wrongly and silently.
    consent: input.consent ?? null,
    notes: input.notes?.trim() || null,
    created_by: by,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as number;
}

export async function updateShoot(id: number, patch: Record<string, unknown>) {
  const { error } = await sb.from("mkt_shoots").update({ ...patch, updated_at: NOW() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveShoot(id: number, archived = true) {
  await updateShoot(id, { archived });
}

/**
 * Record a file that has already landed in storage.
 *
 * ⚠️ IT MOVES THE FILE OUT OF `uploads/` FIRST. A staged path is where anything
 * abandoned gets binned, so leaving a real asset there would put it in the way
 * of a tidy-up. The row is only written once the move succeeded.
 */
export async function recordAsset(input: {
  stagedPath: string; fileName: string; mime?: string | null; bytes?: number | null;
  kind?: string; shootId?: number | null; companyId?: number | null; clientId?: number | null;
  caption?: string | null; tags?: string | null; takenOn?: string | null;
}, by = "web-ui") {
  if (!input.stagedPath.startsWith(`${STAGING}/`)) {
    throw new Error("That file is not a staged upload.");
  }
  const target = `assets/${input.stagedPath.slice(STAGING.length + 1)}`;

  const { error: moveErr } = await sb.storage.from(MARKETING_BUCKET).move(input.stagedPath, target);
  if (moveErr) throw new Error(`The picture did not save: ${moveErr.message}`);

  const { data, error } = await sb.from("mkt_assets").insert({
    storage_path: target,
    file_name: input.fileName,
    mime: input.mime ?? null,
    bytes: input.bytes ?? null,
    kind: input.kind || (input.mime?.startsWith("video/") ? "video" : "photo"),
    shoot_id: input.shootId ?? null,
    company_id: input.companyId ?? null,
    client_id: input.clientId ?? null,
    caption: input.caption?.trim() || null,
    tags: input.tags?.trim() || null,
    taken_on: input.takenOn || null,
    created_by: by,
  }).select("id").single();

  if (error) {
    // ⚠️ Put the file back where the tidy-up can find it rather than leaving an
    // orphan under `assets/` that no row points at. There is no transaction
    // across storage and the database.
    await sb.storage.from(MARKETING_BUCKET).move(target, input.stagedPath).catch(() => {});
    throw new Error(error.message);
  }
  return data!.id as number;
}

export async function updateAsset(id: number, patch: Record<string, unknown>) {
  const { error } = await sb.from("mkt_assets").update({ ...patch, updated_at: NOW() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Take a picture out of the way.
 *
 * ⚠️ ARCHIVE, NEVER DELETE, once it has been used. A post is a record of what
 * went out, and removing the picture it was made from would quietly rewrite
 * that. The database refuses the delete too — `mkt_post_assets` is ON DELETE
 * RESTRICT — but the message here explains it in English.
 */
export async function archiveAsset(id: number, archived = true) {
  await updateAsset(id, { archived });
}

/** Really remove one — only ever an unused picture, and its file goes with it. */
export async function deleteAsset(id: number) {
  const { data: used } = await sb.from("mkt_post_assets").select("post_id").eq("asset_id", id).limit(1);
  if ((used ?? []).length > 0) {
    throw new Error("A post was made from this picture. Archive it instead — deleting it would change what that post was.");
  }
  const { data: row } = await sb.from("mkt_assets").select("storage_path").eq("id", id).maybeSingle();
  const { error } = await sb.from("mkt_assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (row?.storage_path) {
    await sb.storage.from(MARKETING_BUCKET).remove([row.storage_path as string]).catch(() => {});
  }
}

/** Say a post used these pictures. Repeats are ignored, not an error. */
export async function attachAssets(postId: number, assetIds: number[]) {
  if (assetIds.length === 0) return;
  const rows = assetIds.map((assetId, i) => ({ post_id: postId, asset_id: assetId, sort_order: i }));
  const { error } = await sb.from("mkt_post_assets").upsert(rows, { onConflict: "post_id,asset_id" });
  if (error) throw new Error(error.message);
}

export async function detachAsset(postId: number, assetId: number) {
  const { error } = await sb.from("mkt_post_assets").delete().eq("post_id", postId).eq("asset_id", assetId);
  if (error) throw new Error(error.message);
}

/** Which pictures a post used. */
export async function assetsForPosts(postIds: number[]): Promise<Map<number, number[]>> {
  const m = new Map<number, number[]>();
  if (postIds.length === 0) return m;
  const { data } = await sb.from("mkt_post_assets")
    .select("post_id,asset_id,sort_order").in("post_id", postIds).order("sort_order");
  for (const r of (data ?? []) as { post_id: number; asset_id: number }[]) {
    const list = m.get(r.post_id) ?? [];
    list.push(r.asset_id);
    m.set(r.post_id, list);
  }
  return m;
}
