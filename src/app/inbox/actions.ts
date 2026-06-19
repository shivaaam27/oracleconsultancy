"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, signDocumentFile } from "@/lib/documents";
import { autoFileDocumentAction, autoSweepLibraryDuplicatesAction } from "@/app/documents/actions";

export type AutoSortSummary = {
  ok: boolean;
  bundles: number; // bundles fully handled
  filed: number;
  quarantined: number;
  trashed: number;
  failed: number;
  error?: string;
};

export type InboxAttachment = { name?: string; url?: string; type?: string; storagePath?: string; size?: number };

export type InboxItem = {
  id: number;
  source: string;
  status: string;
  sender: string | null;
  subject: string | null;
  body: string;
  attachments: InboxAttachment[];
  createdAt: string;
};

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120) || "file";
}

/** Create an inbox bundle from pasted text + uploaded files (stored in the bucket). */
export async function createInboxBundle(
  fd: FormData
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const subject = (fd.get("subject")?.toString() ?? "").trim() || null;
  const body = (fd.get("body")?.toString() ?? "").trim();
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!body && files.length === 0) return { ok: false, error: "Add some text or at least one file." };

  const attachments: InboxAttachment[] = [];
  for (const file of files) {
    const path = `inbox/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
    if (error) return { ok: false, error: error.message };
    attachments.push({ name: file.name, storagePath: path, type: file.type || "", size: file.size });
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("inbox")
    .insert({
      source: "manual",
      status: "pending",
      sender: null,
      subject,
      body: body || (files.length ? `${files.length} file${files.length === 1 ? "" : "s"} uploaded` : ""),
      attachments: JSON.stringify(attachments),
      created_at: now,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true, id: data.id as number };
}

/** Short-lived signed URL to open an inbox attachment. */
export async function signInboxAttachment(storagePath: string): Promise<{ url: string | null }> {
  return { url: await signDocumentFile(storagePath) };
}

export async function listPendingInbox(): Promise<InboxItem[]> {
  const { data } = await sb
    .from("inbox")
    .select("id,source,status,sender,subject,body,attachments,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as number,
    source: r.source as string,
    status: r.status as string,
    sender: (r.sender as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    body: (r.body as string) ?? "",
    attachments: parseAttachments(r.attachments as string | null),
    createdAt: r.created_at as string,
  }));
}

export async function pendingInboxCount(): Promise<number> {
  const { count } = await sb
    .from("inbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

/**
 * Delete a bundle's stored attachment objects from the bucket. Only touches our
 * own `inbox/` uploads (never a forwarded-email url, which we don't own) so that
 * filing/dismissing a bundle doesn't leave orphaned files behind — Process copies
 * them into the document's own path, so the inbox copy is no longer needed.
 */
async function removeInboxAttachments(id: number): Promise<void> {
  const { data } = await sb.from("inbox").select("attachments").eq("id", id).maybeSingle();
  const atts = parseAttachments((data?.attachments as string | null) ?? null);
  const paths = atts
    .map((a) => a.storagePath)
    .filter((p): p is string => !!p && p.startsWith("inbox/"));
  if (paths.length) {
    try {
      await sb.storage.from(DOCUMENTS_BUCKET).remove(paths);
    } catch {
      /* best-effort cleanup — never block the status change on it */
    }
  }
}

export async function dismissInboxItem(id: number): Promise<void> {
  await removeInboxAttachments(id);
  await sb.from("inbox").update({ status: "dismissed" }).eq("id", id);
  revalidatePath("/inbox");
}

export async function updateInboxBody(id: number, body: string): Promise<{ ok: boolean }> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false };
  await sb.from("inbox").update({ body: trimmed }).eq("id", id);
  revalidatePath("/inbox");
  return { ok: true };
}

export async function markInboxFiled(
  id: number,
  filedKind: "task" | "note" | "documents",
  filedRef: string
): Promise<void> {
  // The files have been re-saved into their own document paths by Process, so the
  // bundle's `inbox/` copies are now redundant — clean them up to avoid storing
  // the same file twice.
  await removeInboxAttachments(id);
  await sb
    .from("inbox")
    .update({ status: "filed", filed_kind: filedKind, filed_ref: filedRef, filed_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/inbox");
}

/**
 * Auto-sort the inbox with ZERO clicks: read every pending bundle's attachments
 * and run each through the document brain (autoFileDocumentAction), which files
 * the confident ones, holds the unclear ones in Quarantine, and bins exact/format
 * duplicates to Trash. Works with AI off (rule-based classify + rename). A bundle
 * is marked filed only once ALL its files are handled; text-only bundles are left
 * for the manual "Make a task" flow. Safe to run repeatedly (cron + "Sort now").
 */
export async function autoSortInboxAction(): Promise<AutoSortSummary> {
  try {
    const { data } = await sb
      .from("inbox")
      .select("id,subject,sender,attachments")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    const bundles = data ?? [];
    let filed = 0, quarantined = 0, trashed = 0, failed = 0, handledBundles = 0;

    for (const b of bundles) {
      const atts = parseAttachments(b.attachments as string | null);
      const files = atts.filter((a) => a.storagePath || a.url);
      if (files.length === 0) continue; // text-only — leave for "Make a task"
      // Folder/sender give the owner hint when a file doesn't self-identify.
      const folderHint = [b.subject as string | null, b.sender as string | null].filter(Boolean).join("  ");
      let allHandled = true;

      for (const a of files) {
        try {
          let blob: Blob | null = null;
          if (a.storagePath) {
            const url = await signDocumentFile(a.storagePath);
            if (url) blob = await (await fetch(url)).blob();
          } else if (a.url) {
            blob = await (await fetch(a.url)).blob();
          }
          if (!blob) { allHandled = false; failed++; continue; }
          const file = new File([blob], a.name || "file", { type: a.type || blob.type });
          const fd = new FormData();
          fd.set("file", file);
          if (folderHint) fd.set("folderHint", folderHint);
          const r = await autoFileDocumentAction(fd);
          if (!r.ok) { failed++; allHandled = false; }
          else if (r.status === "filed") filed++;
          else if (r.status === "duplicate") trashed++;
          else quarantined++; // needs_review → Quarantine
        } catch {
          failed++; allHandled = false;
        }
      }
      // Only retire the bundle when every file landed somewhere (filed/quarantine/
      // trash). The document brain already copied each file into its own path, so
      // markInboxFiled safely removes the redundant inbox/ copies.
      if (allHandled) { await markInboxFiled(b.id as number, "documents", ""); handledBundles++; }
    }

    // Sweep the EXISTING library for duplicates too (not just the new drops), so
    // a pile-up already filed gets cleaned on the same pass.
    const swept = await autoSweepLibraryDuplicatesAction();
    trashed += swept.trashed;
    quarantined += swept.quarantined;

    revalidatePath("/inbox");
    revalidatePath("/documents");
    return { ok: true, bundles: handledBundles, filed, quarantined, trashed, failed };
  } catch (e) {
    return { ok: false, bundles: 0, filed: 0, quarantined: 0, trashed: 0, failed: 0, error: e instanceof Error ? e.message : "Auto-sort failed." };
  }
}

function parseAttachments(raw: string | null): InboxItem["attachments"] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
