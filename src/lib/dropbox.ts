// Dropbox connector — pulls files the owner drops in their watched Dropbox folder
// into the site inbox (read-only). All state lives in the `settings` table (no
// migration): refresh token, watched folder, the list-folder cursor, account label.
// Read-only scopes only (files.metadata.read + files.content.read) — the connector
// can never modify or delete anything in Dropbox.

import { sb } from "@/db/supabase";

const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

export const DROPBOX_REDIRECT_PATH = "/api/dropbox/callback";

const KEYS = {
  refresh: "dropbox.refreshToken",
  folder: "dropbox.folder",
  cursor: "dropbox.cursor",
  account: "dropbox.account",
  connectedAt: "dropbox.connectedAt",
} as const;

export function dropboxConfigured(): boolean {
  return !!process.env.DROPBOX_APP_KEY && !!process.env.DROPBOX_APP_SECRET;
}

async function getSetting(key: string): Promise<string | null> {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | null) ?? null;
}
async function setSetting(key: string, value: string | null): Promise<void> {
  if (value === null) { await sb.from("settings").delete().eq("key", key); return; }
  await sb.from("settings").upsert({ key, value }, { onConflict: "key" });
}

export type DropboxStatus = {
  configured: boolean;     // app key/secret present in env
  connected: boolean;      // a refresh token is stored
  account: string | null;  // owner's Dropbox name/email, for display
  folder: string | null;   // the watched folder path
  connectedAt: string | null;
};

export async function getDropboxStatus(): Promise<DropboxStatus> {
  const [refresh, account, folder, connectedAt] = await Promise.all([
    getSetting(KEYS.refresh), getSetting(KEYS.account), getSetting(KEYS.folder), getSetting(KEYS.connectedAt),
  ]);
  return { configured: dropboxConfigured(), connected: !!refresh, account, folder, connectedAt };
}

/* ----------------------------- OAuth ----------------------------- */

/** The Dropbox consent URL. `offline` so we get a durable refresh token (access
 *  tokens now expire in ~4h). */
export function authorizeUrl(redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.DROPBOX_APP_KEY as string,
    response_type: "code",
    token_access_type: "offline",
    redirect_uri: redirectUri,
  });
  return `https://www.dropbox.com/oauth2/authorize?${p.toString()}`;
}

function basicAuth(): string {
  return "Basic " + Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString("base64");
}

/** Exchange the one-time code for tokens and store the refresh token + account. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
    const res = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" }, body });
    const j = await res.json();
    if (!res.ok || !j.refresh_token) return { ok: false, error: j.error_description || "Token exchange failed." };
    await setSetting(KEYS.refresh, j.refresh_token as string);
    await setSetting(KEYS.connectedAt, new Date().toISOString());
    // Best-effort account label for display.
    try {
      const who = await fetch(`${API}/users/get_current_account`, { method: "POST", headers: { Authorization: `Bearer ${j.access_token}` } });
      const acc = await who.json();
      const label = acc?.email || acc?.name?.display_name || "Dropbox";
      await setSetting(KEYS.account, String(label));
    } catch { /* label is optional */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Token exchange failed." };
  }
}

/** A short-lived access token from the stored refresh token. */
async function accessToken(): Promise<string | null> {
  const refresh = await getSetting(KEYS.refresh);
  if (!refresh) return null;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await res.json();
  if (!res.ok || !j.access_token) return null;
  return j.access_token as string;
}

export async function disconnectDropbox(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((k) => setSetting(k, null)));
}

/* --------------------------- API calls --------------------------- */

async function rpc(token: string, path: string, arg: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
}

export type DropboxFolder = { path: string; name: string };

/** Folders the owner can choose to watch (recursive, capped). Read-only. */
export async function listFolders(): Promise<DropboxFolder[]> {
  const token = await accessToken();
  if (!token) return [];
  const out: DropboxFolder[] = [{ path: "", name: "(whole Dropbox)" }];
  let res = await rpc(token, "/files/list_folder", { path: "", recursive: true, limit: 1000 });
  for (let guard = 0; guard < 5; guard++) {
    const j = await res.json();
    if (!res.ok) break;
    for (const e of j.entries ?? []) {
      if (e[".tag"] === "folder") out.push({ path: e.path_lower as string, name: e.path_display as string });
      if (out.length > 300) return out;
    }
    if (!j.has_more) break;
    res = await rpc(token, "/files/list_folder/continue", { cursor: j.cursor });
  }
  return out;
}

export async function setWatchedFolder(path: string): Promise<void> {
  await setSetting(KEYS.folder, path);
  // Reset the cursor so the next sync re-baselines from this folder.
  await setSetting(KEYS.cursor, null);
}

export async function getWatchedFolder(): Promise<string | null> {
  return getSetting(KEYS.folder);
}

export type DeltaFile = { path: string; name: string; rev: string; size: number };

/** Files added/changed in the watched folder since the saved cursor. On the first
 *  call (no cursor) it baselines to "now" and returns nothing, so the existing
 *  backlog isn't dumped in — only files dropped from now on are pulled. Pass
 *  `pullExisting` to instead return everything already in the folder. */
export async function deltaFiles(opts: { pullExisting?: boolean } = {}): Promise<{ files: DeltaFile[]; ok: boolean }> {
  const token = await accessToken();
  if (!token) return { files: [], ok: false };
  const folder = (await getSetting(KEYS.folder)) ?? "";
  const cursor = await getSetting(KEYS.cursor);

  // "Pull existing" ALWAYS re-lists the whole folder from scratch (even if a cursor
  // exists), so the owner can re-fetch the backlog or anything an earlier run missed.
  if (opts.pullExisting) {
    const start = await rpc(token, "/files/list_folder", { path: folder, recursive: true, limit: 1000 });
    return collect(token, start, true);
  }

  // First normal sync with no cursor: baseline to "now" (skip the backlog) so
  // enabling the connector doesn't dump everything already in the folder.
  if (!cursor) {
    const r = await rpc(token, "/files/list_folder/get_latest_cursor", { path: folder, recursive: true });
    const j = await r.json();
    if (r.ok && j.cursor) await setSetting(KEYS.cursor, j.cursor as string);
    return { files: [], ok: r.ok };
  }

  const res = await rpc(token, "/files/list_folder/continue", { cursor });
  return collect(token, res, false);
}

/** Drain a list_folder response (paginating) into the file list + save the cursor. */
async function collect(token: string, first: Response, savePullCursor: boolean): Promise<{ files: DeltaFile[]; ok: boolean }> {
  const files: DeltaFile[] = [];
  let res = first;
  let lastCursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const j = await res.json();
    if (!res.ok) return { files, ok: false };
    for (const e of j.entries ?? []) {
      if (e[".tag"] === "file") files.push({ path: e.path_lower as string, name: e.name as string, rev: e.rev as string, size: (e.size as number) ?? 0 });
    }
    lastCursor = j.cursor as string;
    if (!j.has_more) break;
    res = await rpc(token, "/files/list_folder/continue", { cursor: j.cursor });
  }
  if (lastCursor) await setSetting("dropbox.cursor", lastCursor);
  void savePullCursor;
  return { files, ok: true };
}

/** Download a file's bytes. Read-only content scope. Returns the reason on failure
 *  (e.g. a missing files.content.read scope) so sync can surface it. */
export async function downloadFile(path: string): Promise<{ bytes: Buffer | null; error?: string }> {
  const token = await accessToken();
  if (!token) return { bytes: null, error: "no-access-token" };
  const res = await fetch(`${CONTENT}/files/download`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path }) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { bytes: null, error: `${res.status} ${body.slice(0, 200)}` };
  }
  return { bytes: Buffer.from(await res.arrayBuffer()) };
}
