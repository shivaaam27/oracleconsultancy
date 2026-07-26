"use server";

// ---------------------------------------------------------------------------
// DANGER ZONE — permanently erase every document and start fresh.
//
// Deliberately kept in its own file, not buried in the 4,000-line
// documents/actions.ts, so the one irreversible operation in the app is easy to
// find, read and audit in full.
//
// SCOPE (the owner's words: "only documents get deleted and not any other thing
// like tasks etc."). This erases documents + the inbox and NOTHING else. Tasks,
// people, companies, attendance, chat, calendar, settings and the AI's learned
// lessons all survive.
//
// Two shared-resource hazards this has to respect — both would quietly destroy
// unrelated data if the wipe were written the obvious way:
//
//   1. The `documents` storage bucket is SHARED. Company logos live under
//      `company-letterhead/`, the email signature under `email-signature/`, chat
//      attachments under `chat/`. A bucket-wide wipe would delete all three. So
//      files are removed ONE PATH AT A TIME, only for paths a document row
//      actually points at.
//   2. A file shared in CHAT is also registered as a document pointing at the
//      SAME stored object. Deleting that object would leave a broken attachment
//      in the chat history, so `chat/` paths are skipped — the document row goes,
//      the file stays because chat still owns it.
//
// The compliance trap: person_requirements / company_requirements store a STATUS
// ("verified"/"received") next to the document link. The foreign key only clears
// the link, so without an explicit reset the checklists would report people as
// compliant with zero documents proving it — a green screen that lies. Those
// rows are reset to "missing" here.
// ---------------------------------------------------------------------------

import { sb } from "@/db/supabase";
import { revalidatePath } from "next/cache";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { recordEvent } from "@/lib/system-events";

/** Typed by the owner to arm the button. Anything else is refused. */
const CONFIRM_PHRASE = "DELETE ALL DOCUMENTS";

export type WipeResult =
  | { ok: false; error: string }
  | {
      ok: true;
      backupPath: string;
      documents: number;
      inbox: number;
      filesDeleted: number;
      filesKeptForChat: number;
      indexEntries: number;
      complianceReset: number;
    };

/** Supabase storage accepts at most 1000 paths per remove() call. */
const STORAGE_CHUNK = 500;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Erase every document and inbox bundle, permanently.
 *
 * Order matters: the backup is written FIRST (so it exists even if a later step
 * fails), then the search index, then storage objects, then the rows. Dependent
 * links (facts, pipeline, compliance events, automation events…) are declared
 * ON DELETE SET NULL in the schema, so they survive with an empty link rather
 * than being deleted — which is what keeps tasks and the rest intact.
 */
export async function wipeAllDocumentsAction(confirmText: string): Promise<WipeResult> {
  if (confirmText.trim() !== CONFIRM_PHRASE) {
    return { ok: false, error: `Type ${CONFIRM_PHRASE} exactly to confirm.` };
  }

  try {
    // ── 1. BACKUP FIRST ────────────────────────────────────────────────────
    // Written into the bucket under a prefix nothing else uses, and never
    // referenced by a document row — so the deletion pass below can't reach it.
    const { data: docRows } = await sb.from("documents").select("*");
    const { data: inboxRows } = await sb.from("inbox").select("*");
    const docs = docRows ?? [];
    const inbox = inboxRows ?? [];

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `_wipe-backup/documents-${stamp}.json`;
    const backup = JSON.stringify(
      { takenAt: new Date().toISOString(), documents: docs, inbox },
      null,
      2,
    );
    const { error: upErr } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(backupPath, Buffer.from(backup, "utf8"), {
        contentType: "application/json",
        upsert: true,
      });
    if (upErr) {
      // No backup, no wipe. This is the whole point of the safety net.
      return { ok: false, error: `Backup failed, nothing was deleted: ${upErr.message}` };
    }

    // ── 2. SEARCH INDEX ────────────────────────────────────────────────────
    // The index stores a COPY of each document's text (that's how ORI quotes
    // passages back). Leaving it would mean the words outliving the document,
    // so it goes in the same operation rather than waiting for the nightly sweep.
    const { count: indexCount } = await sb
      .from("embeddings")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "document");
    await sb.from("embeddings").delete().eq("source_type", "document");

    // ── 3. STORAGE OBJECTS ─────────────────────────────────────────────────
    // Only paths a document points at, de-duplicated (several rows can share one
    // object after a split), and never anything chat still owns.
    const allPaths = [...new Set(docs.map((d) => (d.storage_path as string | null) ?? "").filter(Boolean))];
    const chatOwned = allPaths.filter((p) => p.startsWith("chat/"));
    const deletable = allPaths.filter((p) => !p.startsWith("chat/"));

    // Inbox attachments are stored under `inbox/` and referenced in the row's
    // JSON, not in documents.storage_path — collect them separately.
    const inboxPaths: string[] = [];
    for (const row of inbox) {
      const atts = row.attachments as unknown;
      if (Array.isArray(atts)) {
        for (const a of atts) {
          const p = (a as { storagePath?: unknown })?.storagePath;
          if (typeof p === "string" && p && !p.startsWith("chat/")) inboxPaths.push(p);
        }
      }
    }
    const toRemove = [...new Set([...deletable, ...inboxPaths])];
    let filesDeleted = 0;
    for (const group of chunk(toRemove, STORAGE_CHUNK)) {
      const { error } = await sb.storage.from(DOCUMENTS_BUCKET).remove(group);
      if (!error) filesDeleted += group.length;
      // A failed group is not fatal — the rows still go, and an orphaned object
      // costs storage but breaks nothing. Reported in the summary via the count.
    }

    // ── 4. COMPLIANCE RESET (the trap) ─────────────────────────────────────
    // Clear the status as well as the link, so no checklist claims to be
    // satisfied by a document that no longer exists.
    let complianceReset = 0;
    for (const table of ["person_requirements", "company_requirements"] as const) {
      const { count } = await sb
        .from(table)
        .select("id", { count: "exact", head: true })
        .not("document_id", "is", null);
      const { error } = await sb
        .from(table)
        .update({
          status: "missing",
          document_id: null,
          received_at: null,
          verified_at: null,
          verified_by: null,
          updated_at: new Date().toISOString(),
        })
        .not("document_id", "is", null);
      if (!error) complianceReset += count ?? 0;
    }

    // ── 5. THE ROWS ────────────────────────────────────────────────────────
    // documents.supersedes_id is self-referential with ON DELETE SET NULL, so a
    // blanket delete resolves itself. Every OTHER table's link is SET NULL too,
    // which is exactly why tasks/facts/pipeline survive with an empty pointer.
    await sb.from("documents").delete().gt("id", 0);
    await sb.from("inbox").delete().gt("id", 0);

    try {
      await recordEvent("documents.wipe", "ok", {
        documents: docs.length,
        inbox: inbox.length,
        filesDeleted,
        filesKeptForChat: chatOwned.length,
        indexEntries: indexCount ?? 0,
        complianceReset,
        backupPath,
      });
    } catch { /* audit is best-effort — never undo a completed wipe over a log */ }

    revalidatePath("/documents");
    revalidatePath("/inbox");
    revalidatePath("/");

    return {
      ok: true,
      backupPath,
      documents: docs.length,
      inbox: inbox.length,
      filesDeleted,
      filesKeptForChat: chatOwned.length,
      indexEntries: indexCount ?? 0,
      complianceReset,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A signed link to a wipe backup, so the owner can download it afterwards. */
export async function getWipeBackupLinkAction(path: string): Promise<string | null> {
  if (!path.startsWith("_wipe-backup/")) return null;
  const { data } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Live counts for the confirmation screen, so the owner sees exactly what goes. */
export async function getWipePreviewAction(): Promise<{
  documents: number; inbox: number; files: number; indexEntries: number; compliance: number;
}> {
  const head = async (table: string, build?: (q: never) => never) => {
    try {
      const { count } = await sb.from(table).select("id", { count: "exact", head: true });
      void build;
      return count ?? 0;
    } catch { return 0; }
  };
  const [documents, inbox] = await Promise.all([head("documents"), head("inbox")]);
  let indexEntries = 0, compliance = 0, files = 0;
  try {
    const { count } = await sb.from("embeddings").select("id", { count: "exact", head: true }).eq("source_type", "document");
    indexEntries = count ?? 0;
  } catch { /* best-effort */ }
  try {
    for (const t of ["person_requirements", "company_requirements"] as const) {
      const { count } = await sb.from(t).select("id", { count: "exact", head: true }).not("document_id", "is", null);
      compliance += count ?? 0;
    }
  } catch { /* best-effort */ }
  try {
    const { data } = await sb.from("documents").select("storage_path").not("storage_path", "is", null);
    files = new Set((data ?? []).map((r) => r.storage_path as string)).size;
  } catch { /* best-effort */ }
  return { documents, inbox, files, indexEntries, compliance };
}
