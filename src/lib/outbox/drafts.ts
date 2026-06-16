import { sb } from "@/db/supabase";
import type { Channel } from "./links";

export type OutboxDraftRow = {
  id: number;
  channel: Channel;
  recipientName: string | null;
  recipientContact: string | null;
  company: string | null;
  subject: string | null;
  body: string;
  source: string | null;
  personId: number | null;
  todoId: number | null;
  createdAt: string;
};

/** Persisted, unsent drafts (status = "Draft"), newest first. */
export async function listOutboxDrafts(): Promise<OutboxDraftRow[]> {
  const { data, error } = await sb
    .from("outbox")
    .select("id,channel,recipient_name,recipient_contact,company,subject,body,source,person_id,todo_id,created_at")
    .eq("status", "Draft")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id, channel: r.channel as Channel, recipientName: r.recipient_name, recipientContact: r.recipient_contact,
    company: r.company, subject: r.subject, body: r.body, source: r.source,
    personId: r.person_id, todoId: r.todo_id, createdAt: r.created_at,
  }));
}
