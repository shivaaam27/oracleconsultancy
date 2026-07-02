import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { signDocumentFile } from "@/lib/documents";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";
import { portalCapabilities } from "@/lib/portal-capabilities";
import { canPortalSeeDocument } from "@/lib/portal-documents";

/* Securely serve a company-library document to a portal manager/director:
 * verify the caller is management AND the document is inside their company
 * scope, then redirect to a short-lived signed URL (or the external link).
 * Excluded from the admin gate (api/portal) — checks both cookie types. The
 * authorisation is the real gate: a portal user could guess ?documentId=N. */

export async function GET(req: NextRequest) {
  const documentId = Number(req.nextUrl.searchParams.get("documentId"));
  if (!Number.isFinite(documentId)) return NextResponse.json({ error: "bad" }, { status: 400 });

  const { data: doc } = await sb
    .from("documents")
    .select("company_id,person_id,storage_path,file_url,archived,category")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "none" }, { status: 404 });

  const admin = await isAdminSession();
  if (!admin) {
    const me = await getPortalPerson();
    if (!me) return NextResponse.json({ error: "no" }, { status: 403 });
    // Management only; never serve archived or task-attachment files from here.
    if (!portalCapabilities(me.portalRole).isManagement) return NextResponse.json({ error: "no" }, { status: 403 });
    if (doc.archived === true || doc.category === "Attachment") return NextResponse.json({ error: "no" }, { status: 403 });
    const ok = await canPortalSeeDocument(me, {
      company_id: (doc.company_id as number | null) ?? null,
      person_id: (doc.person_id as number | null) ?? null,
    });
    if (!ok) return NextResponse.json({ error: "no" }, { status: 403 });
  }

  // External link (Drive/email) — hand it straight over.
  const fileUrl = (doc.file_url as string | null) ?? null;
  if (fileUrl) return NextResponse.redirect(fileUrl);

  const path = (doc.storage_path as string | null) ?? null;
  if (!path) return NextResponse.json({ error: "gone" }, { status: 404 });
  const url = await signDocumentFile(path, 300);
  if (!url) return NextResponse.json({ error: "sign" }, { status: 500 });
  return NextResponse.redirect(url);
}
