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
const DB_VERSION = 1;
const STORE = "note-drafts";

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

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
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
