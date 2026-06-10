import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson, personCanSeeTask } from "@/lib/portal-auth";

/* Tiny freshness probe behind the same locks as the pages themselves.
 * Returns an opaque stamp that changes whenever the task or its timeline
 * changes; clients (LiveSync) re-render the page when it moves.
 * Excluded from the admin middleware gate (see src/middleware.ts) so
 * portal users can reach it — it then checks BOTH cookie types itself. */

export async function GET(req: NextRequest) {
  const taskId = Number(req.nextUrl.searchParams.get("taskId"));
  if (!Number.isFinite(taskId)) return NextResponse.json({ error: "bad" }, { status: 400 });

  const admin = await isAdminSession();
  if (!admin) {
    const me = await getPortalPerson();
    if (!me || !(await personCanSeeTask(me, taskId))) {
      return NextResponse.json({ error: "no" }, { status: 403 });
    }
  }

  const [{ data: t }, { count }] = await Promise.all([
    sb.from("tasks").select("status,last_updated_at,deadline,priority").eq("id", taskId).maybeSingle(),
    sb.from("task_updates").select("id", { count: "exact", head: true }).eq("task_id", taskId).is("deleted_at", null),
  ]);
  if (!t) return NextResponse.json({ error: "gone" }, { status: 404 });

  const stamp = [t.status, t.last_updated_at, t.deadline, t.priority, count ?? 0].join("|");
  return NextResponse.json({ stamp }, { headers: { "cache-control": "no-store" } });
}
