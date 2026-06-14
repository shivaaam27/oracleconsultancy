"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, signDocumentFile } from "@/lib/documents";

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

function parseAttachments(raw: string | null): InboxItem["attachments"] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
