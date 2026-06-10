import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { signDocumentFile } from "@/lib/documents";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson, personCanSeeTask } from "@/lib/portal-auth";

/* Securely serve a message attachment: verify the caller may see the task,
 * then redirect to a short-lived signed URL for the stored file. Excluded
 * from the admin middleware gate (api/portal) — checks both cookie types. */

export async function GET(req: NextRequest) {
  const updateId = Number(req.nextUrl.searchParams.get("updateId"));
  if (!Number.isFinite(updateId)) return NextResponse.json({ error: "bad" }, { status: 400 });

  const { data: u } = await sb
    .from("task_updates")
    .select("task_id,attachment_document_id")
    .eq("id", updateId)
    .maybeSingle();
  if (!u || !u.attachment_document_id) return NextResponse.json({ error: "none" }, { status: 404 });

  const taskId = u.task_id as number;
  const admin = await isAdminSession();
  if (!admin) {
    const me = await getPortalPerson();
    if (!me || !(await personCanSeeTask(me, taskId))) {
      return NextResponse.json({ error: "no" }, { status: 403 });
    }
  }

  const { data: doc } = await sb
    .from("documents")
    .select("storage_path")
    .eq("id", u.attachment_document_id)
    .maybeSingle();
  const path = (doc?.storage_path as string | null) ?? null;
  if (!path) return NextResponse.json({ error: "gone" }, { status: 404 });

  const url = await signDocumentFile(path, 300);
  if (!url) return NextResponse.json({ error: "sign" }, { status: 500 });
  return NextResponse.redirect(url);
}
