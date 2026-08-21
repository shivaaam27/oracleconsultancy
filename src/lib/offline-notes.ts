"use client";

/* ------------------------------------------------------------------ *
 * Notes written with no connection.
 *
 * A note typed offline is held on THIS DEVICE until it can be sent. This file is
 * the device's side of that: a tiny IndexedDB store and the sending.
 *
 * ⚠️ THE DEVICE IS A POSTBOX, NEVER THE RECORD. The moment a note reaches the
 * server it is deleted from here. Nothing is kept "in case", nothing is mirrored,
 * and the server is never asked to reconcile with this store — because the only
 * way two copies of the truth stay in step is if one of them isn't a copy.
 *
 * ⚠️ Every draft is named by the DEVICE before it is sent (`clientKey`), and the
 * database refuses a second note with the same name. That is what makes sending
 * safe to repeat: on a bad line the request can succeed while the reply is lost,
 * and a retry then does nothing rather than creating the same thought twice.
 *
 * No library. IndexedDB's API is unpleasant but this needs four operations, and a
 * dependency that has to work when the network does not is a poor trade.
 * ------------------------------------------------------------------ */

const DB_NAME = "cos-offline";
const STORE = "note-drafts";

/* Stage 2 and 3 stores.
 *
 * ⚠️ `NOTES` IS THE ONE PLACE THE OWNER'S REAL NOTES SIT ON THE DEVICE, and it is
 * a copy, never the record — the server's row is the truth and this is refreshed
 * from it. It is emptied on sign-out (`forgetCachedNotes`), because a signed-out
 * device holding a readable copy of every note is exactly the thing the cached
 * page was kept free of.
 *
 * `EDITS` is the outbound queue: writing done offline, waiting to be sent. Unlike
 * NOTES it IS the record until it lands, so it is never cleared on a guess. */
const NOTES = "notes";
const EDITS = "note-edits";
const META = "meta";

export type NoteDraft = {
  /** Names the note before it is sent, so sending can be retried safely. */
  clientKey: string;
  title: string;
  text: string;
  /** When it was written, on this device's clock. */
  createdAt: string;
  /** Set while a send is in flight, so two tabs don't both send it. */
  sendingAt?: number;
};

const STORES = [STORE, NOTES, EDITS, META];

function upgrade(db: IDBDatabase) {
  // ⚠️ Additive only, and never a delete. A device may be carrying writing that
  // has not been sent; dropping a store to "start clean" would throw it away.
  if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientKey" });
  if (!db.objectStoreNames.contains(NOTES)) db.createObjectStore(NOTES, { keyPath: "id" });
  if (!db.objectStoreNames.contains(EDITS)) db.createObjectStore(EDITS, { keyPath: "editKey" });
  if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
}

function openAt(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version == null ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Another tab is holding the old version of this store open."));
  });
}

/**
 * The device's store, opened and repaired if need be.
 *
 * ⚠️ IT ASKS FOR NO PARTICULAR VERSION, AND THAT IS THE POINT. Two things go
 * wrong when the code names a version number, and both were seen for real:
 *
 *   - Name a version the browser is already AT while a store this build expects
 *     was never created, and `onupgradeneeded` never fires again — the version
 *     already matches. The store sits broken forever with nothing to say why.
 *   - Name a version the browser is already PAST and every open throws
 *     `VersionError`, which is what a self-repair does to itself the second time
 *     it runs.
 *
 * So: open whatever is there, check the stores are actually present, and only if
 * one is missing reopen one version higher — the only way to get an upgrade
 * transaction. The shape is the truth; the number is just how you change it.
 * A store that cannot repair itself is a store that eats somebody's writing.
 */
function open(): Promise<IDBDatabase> {
  return openAt().then((db) => {
    if (STORES.every((s) => db.objectStoreNames.contains(s))) return db;
    const next = db.version + 1;
    db.close();
    return openAt(next);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  store: string = STORE
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

/** Is there anywhere to put a draft on this device? */
export function offlineStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** A name for a note that cannot collide with another device's. */
export function newClientKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveDraft(draft: NoteDraft): Promise<void> {
  await tx("readwrite", (s) => s.put(draft));
}

export async function listDrafts(): Promise<NoteDraft[]> {
  const all = (await tx<NoteDraft[]>("readonly", (s) => s.getAll() as IDBRequest<NoteDraft[]>)) ?? [];
  // Oldest first: the order they were written is the order they should arrive.
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteDraft(clientKey: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(clientKey));
}

export async function countDrafts(): Promise<number> {
  try {
    return (await tx<number>("readonly", (s) => s.count())) ?? 0;
  } catch {
    return 0;
  }
}

export type SyncResult = { sent: number; kept: number; error?: string };

/**
 * Send everything waiting. Safe to call as often as you like — sending is
 * repeatable by design, and a draft is only deleted once the server has said it
 * has it.
 *
 * ⚠️ A draft is NEVER deleted on a failure, only on a definite success. Losing
 * the owner's writing to a hopeful cleanup is the one outcome that must not
 * happen, and "the server probably got it" is not good enough.
 */
export async function syncDrafts(): Promise<SyncResult> {
  if (!offlineStorageAvailable()) return { sent: 0, kept: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { sent: 0, kept: await countDrafts() };
  }

  let drafts: NoteDraft[];
  try {
    drafts = await listDrafts();
  } catch {
    return { sent: 0, kept: 0, error: "Could not read what is waiting on this device." };
  }
  if (drafts.length === 0) return { sent: 0, kept: 0 };

  let res: Response;
  try {
    res = await fetch("/api/notes/offline-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drafts: drafts.map((d) => ({
          clientKey: d.clientKey,
          title: d.title,
          text: d.text,
          createdAt: d.createdAt,
        })),
      }),
    });
  } catch {
    // No connection, or it died mid-request. Everything stays put.
    return { sent: 0, kept: drafts.length, error: "No connection — your notes are safe on this device." };
  }

  // The admin gate answers an unauthenticated request with a redirect to the
  // sign-in page. Say so plainly rather than looking like a network fault.
  if (res.redirected || res.status === 401 || res.status === 403) {
    return { sent: 0, kept: drafts.length, error: "Sign in to COS, then these will send." };
  }
  if (!res.ok) {
    return { sent: 0, kept: drafts.length, error: `The server refused them (${res.status}).` };
  }

  let body: { saved?: string[] };
  try {
    body = (await res.json()) as { saved?: string[] };
  } catch {
    return { sent: 0, kept: drafts.length, error: "The server's reply could not be read." };
  }

  const saved = new Set(body.saved ?? []);
  let sent = 0;
  for (const d of drafts) {
    if (!saved.has(d.clientKey)) continue;
    try {
      await deleteDraft(d.clientKey);
      sent += 1;
    } catch {
      // It is on the server; failing to tidy up here only means it is offered
      // again, and the client key makes that harmless.
    }
  }
  return { sent, kept: Math.max(0, drafts.length - sent) };
}

/* ================================================================== *
 * Stage 2 — every note on the device, so it can be read with no connection.
 *
 * The whole collection is a few kilobytes (measured: 10 KB for 10 notes), which
 * is what makes this simple — there is no question of which notes to keep, no
 * eviction and no partial sync. Take the lot, replace the lot.
 * ================================================================== */

export type CachedNote = {
  id: number;
  title: string;
  bodyJson: unknown;
  bodyText: string;
  folderName: string | null;
  pinnedAt: string | null;
  archived: boolean;
  kind: string;
  createdAt: string;
  updatedAt: string;
};

/** Replace the device's copy of the collection. Whole-collection on purpose: a
 *  note deleted at the server has to disappear from here too, and working that
 *  out from a list of changes is more moving parts than re-reading 10 KB. */
export async function putCachedNotes(notes: CachedNote[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([NOTES, META], "readwrite");
    const store = t.objectStore(NOTES);
    store.clear();
    for (const n of notes) store.put(n);
    t.objectStore(META).put(new Date().toISOString(), "notesCachedAt");
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}

export async function listCachedNotes(): Promise<CachedNote[]> {
  try {
    const all = (await tx<CachedNote[]>("readonly", (s) => s.getAll() as IDBRequest<CachedNote[]>, NOTES)) ?? [];
    // Pinned first, then most recently touched — the shelf's own order, so the
    // offline list is not a different-looking version of the same thing.
    return all.sort((a, b) => {
      if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  } catch {
    return [];
  }
}

export async function getCachedNote(id: number): Promise<CachedNote | null> {
  try {
    return (
      (await tx<CachedNote | undefined>("readonly", (s) => s.get(id) as IDBRequest<CachedNote | undefined>, NOTES)) ??
      null
    );
  } catch {
    return null;
  }
}

/** When the device last took a copy — shown to the reader, because a copy of
 *  unknown age is worse than no copy at all. */
export async function notesCachedAt(): Promise<string | null> {
  try {
    return (
      (await tx<string | undefined>("readonly", (s) => s.get("notesCachedAt") as IDBRequest<string | undefined>, META)) ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Throw away the device's copy of the notes.
 *
 * ⚠️ Called on sign-out. The queue of unsent writing is deliberately NOT touched:
 * that is not a copy of anything, it is the only place the owner's words exist,
 * and signing out of a browser must never be a way to lose them.
 */
export async function forgetCachedNotes(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear(), NOTES);
    await tx("readwrite", (s) => s.delete("notesCachedAt"), META);
  } catch {
    /* nothing to forget */
  }
}

/**
 * Pull the collection down. Quiet: this runs in the background and a failure just
 * means the device keeps the copy it already had.
 *
 * ⚠️ `reachable` IS NOT `navigator.onLine`. The browser says it is online whenever
 * there is any network at all — a hotel portal you have not logged into, a VPN
 * that has dropped, a phone showing a bar of signal and carrying nothing, or COS
 * itself being down. So the honest test of "can I reach COS" is having just tried,
 * and that is what this reports. Note a 401 counts as REACHED: the server answered.
 */
export async function refreshNoteCache(): Promise<{ ok: boolean; count: number; reachable: boolean }> {
  if (!offlineStorageAvailable()) return { ok: false, count: 0, reachable: true };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, count: 0, reachable: false };
  }
  try {
    const res = await fetch("/api/notes/offline-cache", { headers: { Accept: "application/json" } });
    // ⚠️ THE SESSION HAS ENDED — so the copy on this device must go too. Without
    // this, signing out somewhere else (or a session simply expiring) would leave
    // every note readable here until somebody happened to open the sign-in
    // screen. A redirect is what the admin gate answers an unauthenticated
    // request with, so it counts the same as a 401.
    if (res.status === 401 || res.status === 403 || res.redirected) {
      await forgetCachedNotes();
      return { ok: false, count: 0, reachable: true };
    }
    if (!res.ok) return { ok: false, count: 0, reachable: true };
    const body = (await res.json()) as { notes?: CachedNote[] };
    const notes = Array.isArray(body.notes) ? body.notes : [];
    await putCachedNotes(notes);
    return { ok: true, count: notes.length, reachable: true };
  } catch {
    // The request never got an answer: COS cannot be reached from here.
    return { ok: false, count: 0, reachable: false };
  }
}

/* ================================================================== *
 * Stage 3 — writing into a note that already exists, with no connection.
 *
 * ⚠️ TWO MODES, AND THE DIFFERENCE IS THE WHOLE SAFETY MODEL.
 *
 * `append` adds to the end and touches nothing above it. It cannot destroy
 * formatting and it cannot conflict: if the note moved on at the server while
 * this device was away, the addition still simply goes on the end of whatever is
 * there now. Every note can be appended to.
 *
 * `replace` rewrites the body from plain text, and is offered ONLY for a note
 * that is plain paragraphs anyway (`docIsPlain`), so there is nothing to lose.
 * If the note moved on at the server, the server keeps BOTH — see the route.
 * ================================================================== */

export type NoteEdit = {
  /** Names the edit before it is sent, so sending can be retried safely — the
   *  same trick as a draft's `clientKey`, for the same reason. */
  editKey: string;
  noteId: number;
  mode: "append" | "replace";
  text: string;
  /** What the device believed the note's `updated_at` was when the edit began.
   *  The server uses it to notice that the note has moved on since. */
  baseUpdatedAt: string;
  /** The note's title as it was, so a kept-both copy can be named after it. */
  noteTitle: string;
  editedAt: string;
};

export async function queueEdit(edit: NoteEdit): Promise<void> {
  await tx("readwrite", (s) => s.put(edit), EDITS);
}

export async function listEdits(): Promise<NoteEdit[]> {
  try {
    const all = (await tx<NoteEdit[]>("readonly", (s) => s.getAll() as IDBRequest<NoteEdit[]>, EDITS)) ?? [];
    // Oldest first: the order it was written is the order it should arrive.
    return all.sort((a, b) => a.editedAt.localeCompare(b.editedAt));
  } catch {
    return [];
  }
}

export async function deleteEdit(editKey: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(editKey), EDITS);
}

export async function countEdits(): Promise<number> {
  try {
    return (await tx<number>("readonly", (s) => s.count(), EDITS)) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Send the writing done into existing notes.
 *
 * Same contract as `syncDrafts`: the server names exactly what it now holds, and
 * only those are let go of. Anything else stays and is offered again.
 */
export async function syncEdits(): Promise<SyncResult & { keptBoth: number }> {
  if (!offlineStorageAvailable()) return { sent: 0, kept: 0, keptBoth: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { sent: 0, kept: await countEdits(), keptBoth: 0 };
  }

  const edits = await listEdits();
  if (edits.length === 0) return { sent: 0, kept: 0, keptBoth: 0 };

  let res: Response;
  try {
    res = await fetch("/api/notes/offline-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits }),
    });
  } catch {
    return {
      sent: 0,
      kept: edits.length,
      keptBoth: 0,
      error: "No connection — your writing is safe on this device.",
    };
  }

  if (res.redirected || res.status === 401 || res.status === 403) {
    return { sent: 0, kept: edits.length, keptBoth: 0, error: "Sign in to COS, then these will send." };
  }
  if (!res.ok) {
    return { sent: 0, kept: edits.length, keptBoth: 0, error: `The server refused them (${res.status}).` };
  }

  let body: { applied?: string[]; keptBoth?: string[] };
  try {
    body = (await res.json()) as { applied?: string[]; keptBoth?: string[] };
  } catch {
    return { sent: 0, kept: edits.length, keptBoth: 0, error: "The server's reply could not be read." };
  }

  const applied = new Set(body.applied ?? []);
  let sent = 0;
  for (const e of edits) {
    if (!applied.has(e.editKey)) continue;
    try {
      await deleteEdit(e.editKey);
      sent += 1;
    } catch {
      /* it is on the server; being offered again is harmless */
    }
  }
  return { sent, kept: Math.max(0, edits.length - sent), keptBoth: (body.keptBoth ?? []).length };
}

/**
 * Everything the device owes the server, and then a fresh copy back.
 *
 * ⚠️ ORDER MATTERS: send first, then re-read. The other way round would pull a
 * copy that does not yet contain the writing sitting on this device, overwrite
 * the local copy with it, and show the owner his own note without his last
 * paragraph in it.
 */
export async function syncOffline(): Promise<{
  notesSent: number;
  editsSent: number;
  keptBoth: number;
  cached: number;
  reachable: boolean;
  error?: string;
}> {
  const drafts = await syncDrafts();
  const edits = await syncEdits();
  const cache = await refreshNoteCache();
  return {
    notesSent: drafts.sent,
    editsSent: edits.sent,
    keptBoth: edits.keptBoth,
    cached: cache.count,
    reachable: cache.reachable,
    error: drafts.error ?? edits.error,
  };
}
