"use client";

// The Documents library — one view, no queues. Aurora hero with glance counts,
// then the table. Everything here is what the owner filed by hand.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveDocStatus, type DocumentRow } from "@/lib/documents-shared";

import { DocumentsTable } from "@/components/documents-table";
import { DocumentForm } from "@/components/document-form";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { getDocumentRowAction } from "@/app/documents/actions";

type Company = { id: number; name: string; accentColor?: string | null; aliases?: string[]; logoUrl?: string | null };

export function DocumentsWorkspace({
  documents,
  companies,
  people,
  linkedTasks,
}: {
  documents: DocumentRow[];
  companies: Company[];
  people: Array<{ id: number; name: string; personType?: string }>;
  linkedTasks: Record<number, Array<{ code: string; status: string }>>;
}) {
  const router = useRouter();
  // "Edit" opens the editor in place (a dialog over the table). A table row hands
  // us the whole document; a deep link passes only the id, so we fetch it.
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Glance counts.
  const stats = useMemo(() => {
    const live = documents.filter((d) => !d.archived);
    let expired = 0, expiring = 0;
    for (const d of live) {
      const s = deriveDocStatus(d);
      if (s === "Expired") expired++;
      else if (s === "Expiring") expiring++;
    }
    return { docs: live.length, expired, expiring };
  }, [documents]);

  useEffect(() => {
    let cancelled = false;
    async function onEdit(e: Event) {
      const detail = (e as CustomEvent<{ id?: number; doc?: DocumentRow }>).detail;
      const id = detail?.id;
      if (!id) return;
      if (detail?.doc) { setEditDoc(detail.doc); return; }
      setEditLoading(true);
      const doc = await getDocumentRowAction(id);
      if (cancelled) return;
      setEditLoading(false);
      if (doc) setEditDoc(doc);
    }
    window.addEventListener("cos:edit-document", onEdit);
    return () => { cancelled = true; window.removeEventListener("cos:edit-document", onEdit); };
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Aurora hero (CC grammar) ─────────────────────────────── */}
      <section className="glass elevated relative overflow-hidden rounded-3xl px-4 py-4 sm:px-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-6 h-48 w-80 rounded-full opacity-20 blur-3xl"
          style={{ background: `radial-gradient(circle, hsl(var(--${stats.expired ? "danger" : "accent"})), transparent 70%)` }}
        />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-muted">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success))]" />
              Documents · live
            </div>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">Document Room</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-fg-muted sm:ml-auto">
            <span><b className="tabular text-base text-fg">{stats.docs}</b> documents</span>
            {stats.expired > 0 && <span className="text-danger"><b className="tabular text-base">{stats.expired}</b> expired</span>}
            {stats.expiring > 0 && <span className="text-warn"><b className="tabular text-base">{stats.expiring}</b> due soon</span>}
          </div>
        </div>
      </section>

      <DocumentsTable documents={documents} companies={companies} people={people} linkedTasks={linkedTasks} />

      {/* ── Inline editor ───────────────────────────────────────── */}
      <HrmsDialog
        open={!!editDoc}
        onOpenChange={(o) => { if (!o) setEditDoc(null); }}
        width={860}
        title="Edit document"
      >
        {editDoc && (
          <DocumentForm
            mode="edit"
            doc={editDoc}
            companies={companies.map((c) => ({ id: c.id, name: c.name }))}
            people={people.map((p) => ({ id: p.id, name: p.name }))}
            onComplete={(res) => { if (res.ok) { setEditDoc(null); router.refresh(); } }}
            onCancel={() => setEditDoc(null)}
          />
        )}
      </HrmsDialog>
      {editLoading && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-bg/40 backdrop-blur-sm">
          <div className="glass elevated rounded-xl px-4 py-3 text-sm text-fg-muted">Opening…</div>
        </div>
      )}
    </div>
  );
}
