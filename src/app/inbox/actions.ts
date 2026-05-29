"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";

export type InboxItem = {
  id: number;
  source: string;
  status: string;
  sender: string | null;
  subject: string | null;
  body: string;
  attachments: { name?: string; url?: string; type?: string }[];
  createdAt: string;
};

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

export async function dismissInboxItem(id: number): Promise<void> {
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
  filedKind: "task" | "note",
  filedRef: string
): Promise<void> {
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
