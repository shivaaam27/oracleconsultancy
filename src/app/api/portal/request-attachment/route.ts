import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { signDocumentFile } from "@/lib/documents";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";

/* Securely serve a request-message attachment: verify the caller is the owner
 * OR a participant (requester/addressee) of the request the message belongs to,
 * then redirect to a short-lived signed URL. Under /api/portal, so it's outside
 * the admin gate and checks both cookie types itself. */

export async function GET(req: NextRequest) {
  const updateId = Number(req.nextUrl.searchParams.get("updateId"));
  if (!Number.isFinite(updateId)) return NextResponse.json({ error: "bad" }, { status: 400 });

  const { data: u } = await sb
    .from("request_updates")
    .select("request_id,attachment_document_id")
    .eq("id", updateId)
    .maybeSingle();
  if (!u || !u.attachment_document_id) return NextResponse.json({ error: "none" }, { status: 404 });

  const admin = await isAdminSession();
  if (!admin) {
    const me = await getPortalPerson();
    if (!me) return NextResponse.json({ error: "no" }, { status: 403 });
    const { data: r } = await sb
      .from("requests")
      .select("requester_id,addressee_id")
      .eq("id", u.request_id as number)
      .maybeSingle();
    if (!r || ((r.requester_id as number) !== me.id && (r.addressee_id as number | null) !== me.id)) {
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
