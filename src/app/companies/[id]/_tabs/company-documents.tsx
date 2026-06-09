"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { FilePlus, X, FolderOpen, Users, ExternalLink, Paperclip, Pencil, Trash2, Loader2, ChevronDown } from "lucide-react";
import { DocumentForm } from "@/components/document-form";
import { CompanyRequirementsChecklist } from "@/components/company-requirements-checklist";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { getDocumentFileLinkAction, archiveDocumentAction } from "@/app/documents/actions";
import { deriveDocStatus, expiryLabel, type DocStatus, type DocumentRow } from "@/lib/documents-shared";
import { useToast } from "@/components/toast";

const STATUS_BADGE: Record<DocStatus, string> = {
  Valid: "bg-success-soft text-success",
  Expiring: "bg-warn-soft text-warn",
  Expired: "bg-danger-soft text-danger",
  "No expiry": "bg-bg-muted text-fg-muted",
  Archived: "bg-bg-muted text-fg-subtle",
};

// Sort order: things needing attention first, then the rest, then by title.
const STATUS_RANK: Record<DocStatus, number> = {
  Expired: 0, Expiring: 1, Valid: 2, "No expiry": 3, Archived: 4,
};

export type StaffFileGroup = {
  personId: number;
  personName: string;
  role: string | null;
  docs: DocumentRow[];
};

function fmtUpdated(d: Date): string {
  return `Updated ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function CompanyDocuments({
  companyId,
  companyName,
  documents,
  staffGroups,
  companies,
  people,
}: {
  companyId: number;
  companyName: string;
  documents: DocumentRow[];
  staffGroups: StaffFileGroup[];
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState<string>("");
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [opening, startOpen] = useTransition();
  const [, startDelete] = useTransition();
  const [reloadSignal, setReloadSignal] = useState(0);
  const formOpen = addOpen || !!editDoc;

  function closeForm() {
    setAddOpen(false);
    setEditDoc(null);
  }

  function afterChange() {
    closeForm();
    setReloadSignal((n) => n + 1);
    router.refresh();
  }

  function deleteDoc(doc: DocumentRow) {
    if (!window.confirm(`Delete “${doc.title}”? It will be archived and removed from this list.`)) return;
    setDeletingId(doc.id);
    startDelete(async () => {
      const res = await archiveDocumentAction(doc.id, true);
      setDeletingId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Document deleted.", { tone: "success" });
      setReloadSignal((n) => n + 1);
      router.refresh();
    });
  }

  const sortedDocs = [...documents].sort((a, b) => {
    const r = STATUS_RANK[deriveDocStatus(a)] - STATUS_RANK[deriveDocStatus(b)];
    return r !== 0 ? r : a.title.localeCompare(b.title);
  });
  const staffTotal = staffGroups.reduce((n, g) => n + g.docs.length, 0);

  function openFile(id: number) {
    startOpen(async () => {
      const res = await getDocumentFileLinkAction(id);
      if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
      else toast(res.error, { tone: "danger" });
    });
  }

  function startAdd(opts: { title?: string; category: string | null }) {
    setAddCategory(opts.category);
    setAddTitle(opts.title ?? "");
    setAddOpen(true);
  }

  const linkableDocs = documents.map((d) => ({ id: d.id, title: d.title, category: d.category }));

  return (
    <div className="space-y-3">
      {/* ── Company files ─────────────────────────────────────────────── */}
      <details open className="group glass elevated rounded-2xl overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2.5 px-4 py-3 select-none">
          <FolderOpen size={16} className="text-accent shrink-0" />
          <span className="text-sm font-semibold">Company files</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular">
            {documents.length}
          </span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); startAdd({ category: null }); }}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors rounded-full px-2.5 py-1 hover:bg-accent-soft/40"
          >
            <FilePlus size={13} /> Add
          </button>
          <ChevronDown size={16} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t border-border/60 p-3 space-y-3">
          {/* Statutory checklist — kept, collapsed by default. */}
          <CompanyRequirementsChecklist
            companyId={companyId}
            documents={linkableDocs}
            reloadSignal={reloadSignal}
            onAddDocument={(o) => startAdd(o)}
            onChanged={() => router.refresh()}
            defaultOpen={false}
          />

          {/* Flat list of every company document (no category grouping). */}
          {documents.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-fg-muted space-y-3">
              <p>No documents filed for {companyName} yet.</p>
              <button
                type="button"
                onClick={() => startAdd({ category: null })}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors rounded-full px-3 py-1.5 ring-1 ring-accent/30 hover:bg-accent-soft/40"
              >
                <FilePlus size={13} /> Add the first document
              </button>
            </div>
          ) : (
            <ul className="rounded-xl ring-1 ring-border/60 divide-y divide-border/50 overflow-hidden">
              {sortedDocs.map((doc) => {
                const status = deriveDocStatus(doc);
                const exp = expiryLabel(doc);
                return (
                  <li key={doc.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-bg-elev/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{doc.title}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">
                        {[doc.category, doc.issuer, doc.referenceNo, exp, fmtUpdated(doc.updatedAt)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[status]}`}>
                      {status}
                    </span>
                    {doc.storagePath ? (
                      <button
                        type="button" onClick={() => openFile(doc.id)} disabled={opening} title="Open file"
                        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted/60 transition-colors disabled:opacity-50"
                      >
                        <Paperclip size={14} />
                      </button>
                    ) : doc.fileUrl ? (
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" title="Open link"
                        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted/60 transition-colors">
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="shrink-0 h-7 w-7" aria-hidden />
                    )}
                    <button
                      type="button"
                      onClick={() => setEditDoc(doc)}
                      title="Edit document"
                      className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-subtle hover:text-fg hover:bg-bg-muted/60 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc)}
                      disabled={deletingId === doc.id}
                      title="Delete document"
                      className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>

      {/* ── Staff files ───────────────────────────────────────────────── */}
      <details className="group glass elevated rounded-2xl overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2.5 px-4 py-3 select-none">
          <Users size={16} className="text-accent shrink-0" />
          <span className="text-sm font-semibold">Staff files</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular">
            {staffTotal}
          </span>
          <ChevronDown size={16} className="ml-auto shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t border-border/60 p-3">
          {staffGroups.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-fg-muted">
              No staff documents on file for this company yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {staffGroups.map((g) => {
                const expired = g.docs.filter((d) => deriveDocStatus(d) === "Expired").length;
                const expiring = g.docs.filter((d) => deriveDocStatus(d) === "Expiring").length;
                const dot = expired ? "bg-danger" : expiring ? "bg-warn" : "bg-success";
                return (
                  <PersonDrawerLink
                    key={g.personId}
                    id={g.personId}
                    name={g.personName}
                    className="w-full text-left rounded-xl ring-1 ring-border/60 bg-bg-elev/40 px-3.5 py-2.5 hover:ring-accent/30 hover:bg-bg-muted/40 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{g.personName}</span>
                        {g.role && <span className="block truncate text-[11px] text-fg-subtle">{g.role}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-fg-muted tabular">
                        {g.docs.length} file{g.docs.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    {(expired > 0 || expiring > 0) && (
                      <span className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-warn-soft text-warn">
                        {expired > 0 ? `${expired} expired` : `${expiring} expiring`}
                      </span>
                    )}
                  </PersonDrawerLink>
                );
              })}
            </div>
          )}
        </div>
      </details>

      <div className="flex justify-end">
        <a
          href={`/documents?company=${companyId}`}
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors rounded-full px-2.5 py-1 hover:bg-bg-muted/60"
        >
          <ExternalLink size={12} /> Open in Documents centre
        </a>
      </div>

      {/* Add / edit document modal, layered over the page (no route change). */}
      <Dialog.Root open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm
            data-[state=open]:animate-in data-[state=open]:fade-in-0
            data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2
              w-[min(560px,calc(100vw-1.5rem))] max-h-[88dvh] flex flex-col overflow-hidden
              glass glass-refract rounded-2xl outline-none
              data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0
              data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <Dialog.Title className="text-sm font-semibold truncate">
                {editDoc
                  ? `Edit ${editDoc.title}`
                  : `Add a document for ${companyName}${addCategory ? ` · ${addCategory}` : ""}`}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors">
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editDoc ? (
                <DocumentForm
                  mode="edit"
                  doc={editDoc}
                  companies={companies}
                  people={people}
                  onCancel={closeForm}
                  onComplete={(res) => { if (res.ok) { toast("Document updated.", { tone: "success" }); afterChange(); } }}
                />
              ) : addOpen ? (
                <DocumentForm
                  mode="create"
                  companies={companies}
                  people={people}
                  initialCompanyId={companyId}
                  initialCategory={addCategory}
                  initialTitle={addTitle || undefined}
                  onCancel={closeForm}
                  onComplete={(res) => { if (res.ok) { toast("Document added.", { tone: "success" }); afterChange(); } }}
                />
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
