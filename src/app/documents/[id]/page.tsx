import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDocument, signDocumentFile } from "@/lib/documents";
import { deriveDocStatus, expiryLabel } from "@/lib/documents-shared";
import { sb } from "@/db/supabase";
import { DocumentRecord } from "./document-record";

/**
 * A document at its own URL — /documents/<id>.
 *
 * The library still opens the EDIT dialog when you click a row, because filing a
 * document is a form-shaped job. This page is the readable record behind it: what
 * it is, who it belongs to, when it lapses, and the tasks raised against it.
 * Linked from the vendor and person records, which previously had nowhere to send
 * you for a single document.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocument(Number(id)).catch(() => null);
  return { title: doc ? `${doc.title} · Documents` : "Document · COS" };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docId = Number(id);
  if (!Number.isFinite(docId)) notFound();

  const doc = await getDocument(docId);
  if (!doc) notFound();

  // Owner names + any tasks raised off this document. Kept to two small reads.
  const [{ data: companyRow }, { data: personRow }, { data: linkRows }] = await Promise.all([
    doc.companyId
      ? sb.from("companies").select("name").eq("id", doc.companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.personId
      ? sb.from("people").select("name").eq("id", doc.personId).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("document_links").select("tasks(code,status,action_item)").eq("document_id", docId),
  ]);

  const tasks = (linkRows ?? [])
    .map((row) => {
      const t = (row as { tasks?: unknown }).tasks;
      const rec = (Array.isArray(t) ? t[0] : t) as { code?: string; status?: string; action_item?: string } | null;
      return rec?.code ? { code: rec.code, status: rec.status ?? "", title: rec.action_item ?? "" } : null;
    })
    .filter((x): x is { code: string; status: string; title: string } => x !== null);

  const fileUrl = doc.storagePath ? await signDocumentFile(doc.storagePath).catch(() => null) : doc.fileUrl;

  return (
    <div className="space-y-3">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={13} /> Documents
      </Link>
      <DocumentRecord
        doc={{
          id: doc.id,
          title: doc.title,
          category: doc.category,
          docType: doc.docType,
          issuer: doc.issuer,
          referenceNo: doc.referenceNo,
          issueDate: doc.issueDate ? doc.issueDate.toISOString() : null,
          expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
          reminderLeadDays: doc.reminderLeadDays,
          notes: doc.notes,
          archived: doc.archived,
          fileName: doc.fileName,
          companyId: doc.companyId,
          companyName: (companyRow as { name?: string } | null)?.name ?? null,
          personId: doc.personId,
          personName: (personRow as { name?: string } | null)?.name ?? null,
          vendorId: doc.vendorId,
        }}
        status={deriveDocStatus(doc)}
        expiry={expiryLabel(doc)}
        fileUrl={fileUrl}
        tasks={tasks}
      />
    </div>
  );
}
