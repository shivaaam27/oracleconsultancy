import { NextRequest, NextResponse } from "next/server";
import { getAllTasks } from "@/lib/queries";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const all = await getAllTasks();
  const task = all.find((t) => t.code === code);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: updates }, { data: audit }, { data: sourceMeeting }] = await Promise.all([
    sb
      .from("task_updates")
      .select("id,body,created_at,created_by,edited_at,original_body,pinned_at")
      .eq("task_id", task.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(15),
    sb
      .from("audit_log")
      .select("id,field,old_value,new_value,change_reason,entry_type,created_at,created_by")
      .eq("task_code", code)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(25),
    sb
      .from("meeting_tasks")
      .select("meetings(id,title,meeting_date)")
      .eq("task_id", task.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({ task, updates: updates ?? [], audit: audit ?? [], sourceMeeting: (sourceMeeting as any)?.meetings ?? null });
}
