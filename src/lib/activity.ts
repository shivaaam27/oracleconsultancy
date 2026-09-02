import "server-only";
import { sb } from "@/db/supabase";

// Recent portfolio activity for the Administrator "Live activity" feed. Reads the
// newest task updates across every company (the richest "what just happened" signal)
// and resolves the author from the createdBy stamp. Read-only — no new backend.

export type ActivityItem = {
  id: number;
  body: string;
  code: string;
  actionItem: string;
  companyName: string | null;
  author: string;
  management: boolean;
  isOri: boolean;
  createdAt: string;
};

/** Resolve a `created_by` stamp to a display author (owner perspective). */
function resolveAuthor(by: string | null): { author: string; management: boolean; isOri: boolean } {
  if (!by) return { author: "System", management: false, isOri: false };
  if (by === "ai-command") return { author: "ORI", management: true, isOri: true };
  if (by === "meeting-mode") return { author: "Meeting", management: false, isOri: false };
  if (by === "web-ui") return { author: "You", management: false, isOri: false };
  if (by.startsWith("portal-dir:")) return { author: by.slice(11), management: true, isOri: false };
  if (by.startsWith("portal-mgr:")) return { author: by.slice(11), management: true, isOri: false };
  if (by.startsWith("portal-hr:")) return { author: by.slice(10), management: true, isOri: false };
  if (by.startsWith("portal:")) return { author: by.slice(7), management: false, isOri: false };
  return { author: "Management", management: true, isOri: false };
}

export async function listRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const { data } = await sb
    .from("task_updates")
    .select("id,body,created_at,created_by,tasks(code,action_item,companies(name))")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((u) => {
    const t = u.tasks as unknown as { code?: string; action_item?: string; companies?: { name?: string } | null } | null;
    const a = resolveAuthor(u.created_by as string | null);
    return {
      id: u.id as number,
      body: ((u.body as string) ?? "").trim(),
      code: t?.code ?? "",
      actionItem: t?.action_item ?? "",
      companyName: t?.companies?.name ?? null,
      author: a.author,
      management: a.management,
      isOri: a.isOri,
      createdAt: u.created_at as string,
    };
  });
}
