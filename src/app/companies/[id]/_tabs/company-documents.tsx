"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { FilePlus, X, FolderOpen, Users, ExternalLink, Pencil, Trash2, Loader2, ChevronDown, Search, Check } from "lucide-react";
import { DocumentForm } from "@/components/document-form";
import { DocPreview } from "@/components/doc-preview";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { archiveDocumentAction, renameDocumentAction } from "@/app/documents/actions";
import { deriveDocStatus, expiryLabel, type DocStatus, type DocumentRow } from "@/lib/documents-shared";
import { useToast } from "@/components/toast";
import { getInitials as initials } from "@/lib/names";

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

// Severity for ordering staff cards: people with issues first.
function staffSeverity(g: StaffFileGroup): number {
  if (g.docs.some((d) => deriveDocStatus(d) === "Expired")) return 0;
  if (g.docs.some((d) => deriveDocStatus(d) === "Expiring")) return 1;
  return 2;
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{children}</span>
  );
}

export function CompanyDocuments({
  companyId,
  companyName,
  documents,
  staffGroups,
  companies,
  people,
  stageByDoc = {},
}: {
  companyId: number;
  companyName: string;
  documents: DocumentRow[];
  staffGroups: StaffFileGroup[];
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  /** Pipeline stage per document id, so a doc shows where it is at a glance. */
  stageByDoc?: Record<number, string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState<string>("");
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [, startDelete] = useTransition();
  const [reloadSignal, setReloadSignal] = useState(0);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, startRename] = useTransition();
  const formOpen = addOpen || !!editDoc;

  function beginRename(doc: DocumentRow) { setRenamingId(doc.id); setRenameValue(doc.title); }
  function saveRename(id: number) {
    const t = renameValue.trim();
    if (!t) { setRenamingId(null); return; }
    startRename(async () => {
      const res = await renameDocumentAction(id, t);
      setRenamingId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Renamed.", { tone: "success" });
      router.refresh();
    });
  }

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
  const sortedStaff = [...staffGroups].sort((a, b) => {
    const s = staffSeverity(a) - staffSeverity(b);
    return s !== 0 ? s : a.personName.localeCompare(b.personName);
  });

  function startAdd(opts: { title?: string; category: string | null }) {
    setAddCategory(opts.category);
    setAddTitle(opts.title ?? "");
    setAddOpen(true);
  }

  const linkableDocs = documents.map((d) => ({ id: d.id, title: d.title, category: d.category }));

  // Group the company's documents into the owner's eight shelves (their on-disk
  // folders), so the page reads like their file explorer. Within a shelf,
  // attention-first then by title (same order as the old flat list).
  const q = query.trim().toLowerCase();
  const visibleDocs = q
    ? sortedDocs.filter((d) => [d.title, d.category, d.issuer, d.referenceNo, stageByDoc[d.id]].filter(Boolean).join(" ").toLowerCase().includes(q))
    : sortedDocs;
  // Grouped by the category the owner picked; anything left blank collects
  // under "Uncategorised" rather than being guessed into a folder.
  const docsByShelf = new Map<string, DocumentRow[]>();
  for (const doc of visibleDocs) {
    const shelf = doc.category || "Uncategorised";
    const list = docsByShelf.get(shelf) ?? [];
    list.push(doc);
    docsByShelf.set(shelf, list);
  }
  const shelves = [...docsByShelf.keys()].sort().map((name) => ({ name, code: "" }));

  function renderDocRow(doc: DocumentRow) {
    const status = deriveDocStatus(doc);
    const exp = expiryLabel(doc);
    const stage = stageByDoc[doc.id];
    const renaming = renamingId === doc.id;
    return (
      <li key={doc.id} className="px-3.5 py-2.5 bg-bg-elev/40">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                autoFocus value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveRename(doc.id); if (e.key === "Escape") setRenamingId(null); }}
                onBlur={() => saveRename(doc.id)}
                disabled={savingRename}
                className="w-full rounded-md border border-accent/40 bg-bg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-ring/50"
              />
            ) : doc.storagePath ? (
              <DocPreview documentId={doc.id} fileName={doc.fileName ?? doc.title} label={doc.title} />
            ) : doc.fileUrl ? (
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-fg hover:text-accent hover:underline">{doc.title}</a>
            ) : (
              <span className="block truncate text-sm font-medium">{doc.title}</span>
            )}
            <span className="mt-0.5 block truncate text-xs text-fg-subtle">
              {[doc.category, doc.issuer, doc.referenceNo, exp, fmtUpdated(doc.updatedAt)].filter(Boolean).join(" · ")}
            </span>
          </div>
          {stage && (
            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-info-soft/60 ring-1 ring-info/30 text-info" title="Application stage">
              {stage}
            </span>
          )}
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status]}`}>
            {status}
          </span>
          {renaming ? (
            <button type="button" onClick={() => saveRename(doc.id)} disabled={savingRename} title="Save name"
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-success hover:bg-success-soft/60 transition-colors">
              {savingRename ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
            </button>
          ) : (
            <button type="button" onClick={() => beginRename(doc)} title="Rename"
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-subtle hover:text-fg hover:bg-bg-muted/60 transition-colors">
              <Pencil size={13} />
            </button>
          )}
          <button type="button" onClick={() => setEditDoc(doc)} title="Edit details"
            className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-subtle hover:text-fg hover:bg-bg-muted/60 transition-colors text-xs font-semibold">
            ⋯
          </button>
          <button type="button" onClick={() => deleteDoc(doc)} disabled={deletingId === doc.id} title="Delete document"
            className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50">
            {deletingId === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Company files ─────────────────────────────────────────────── */}
      <details open className="group glass elevated rounded-2xl overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2.5 px-4 py-3 select-none">
          <FolderOpen size={16} className="text-accent shrink-0" />
          <span className="text-sm font-semibold">Company files</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-xs font-semibold tabular">
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
          {/* Search — find fast as volumes grow. */}
          {documents.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search documents…"
                  className="w-full rounded-lg border border-border bg-bg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-ring/40"
                />
              </div>
            </div>
          )}

          {/* Category folders, collapsed by default (click to open). */}
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
            <div className="space-y-2">
              {shelves.map(({ name: shelf, code }) => {
                const shelfDocs = docsByShelf.get(shelf) ?? [];
                const attention = shelfDocs.filter((d) => {
                  const s = deriveDocStatus(d);
                  return s === "Expired" || s === "Expiring";
                }).length;
                return (
                  <details key={shelf} open={q.length > 0 && shelfDocs.length > 0} className="group/shelf rounded-xl ring-1 ring-border/60 overflow-hidden bg-bg-elev/30">
                    <summary className="list-none cursor-pointer flex items-center gap-2.5 px-3.5 py-2.5 select-none">
                      <span className="text-xs font-semibold tabular text-fg-subtle">{code}</span>
                      <span className="text-sm font-medium">{shelf}</span>
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-xs font-semibold tabular">
                        {shelfDocs.length}
                      </span>
                      {attention > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-warn-soft text-warn">
                          {attention} need{attention === 1 ? "s" : ""} attention
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); startAdd({ category: null }); }}
                        title={`Add a document to ${shelf}`}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors rounded-full px-2 py-0.5 hover:bg-accent-soft/40"
                      >
                        <FilePlus size={12} /> Add
                      </button>
                      <ChevronDown size={15} className="shrink-0 text-fg-subtle transition-transform group-open/shelf:rotate-180" />
                    </summary>
                    {shelfDocs.length > 0 ? (
                      <ul className="border-t border-border/50 divide-y divide-border/50">
                        {shelfDocs.map((doc) => renderDocRow(doc))}
                      </ul>
                    ) : (
                      <p className="border-t border-border/50 px-3.5 py-3 text-xs text-fg-subtle">
                        Nothing filed here yet — drop a document and it lands automatically.
                      </p>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </details>

      {/* ── Staff files ───────────────────────────────────────────────── */}
      <details className="group glass elevated rounded-2xl overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2.5 px-4 py-3 select-none">
          <Users size={16} className="text-accent shrink-0" />
          <span className="text-sm font-semibold">Staff files</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-xs font-semibold tabular">
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
              {sortedStaff.map((g) => {
                const expired = g.docs.filter((d) => deriveDocStatus(d) === "Expired").length;
                const expiring = g.docs.filter((d) => deriveDocStatus(d) === "Expiring").length;
                const valid = g.docs.length - expired - expiring;
                const ring = expired ? "ring-danger/30" : expiring ? "ring-warn/30" : "ring-border/60";
                const avatarCls = expired
                  ? "bg-danger-soft text-danger"
                  : expiring
                  ? "bg-warn-soft text-warn"
                  : "bg-accent-soft text-accent";
                return (
                  <PersonDrawerLink
                    key={g.personId}
                    id={g.personId}
                    name={g.personName}
                    className={`group/card w-full text-left rounded-xl ring-1 bg-bg-elev/40 px-3 py-2.5 hover:-translate-y-0.5 hover:shadow-sm hover:ring-accent/30 transition-all ${ring}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full text-xs font-semibold ${avatarCls}`}>
                        {initials(g.personName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium group-hover/card:text-accent transition-colors">{g.personName}</span>
                        {g.role && <span className="block truncate text-xs text-fg-subtle">{g.role}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-fg-muted tabular">
                        {g.docs.length} file{g.docs.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1">
                      {expired > 0 && <Pill cls="bg-danger-soft text-danger">{expired} expired</Pill>}
                      {expiring > 0 && <Pill cls="bg-warn-soft text-warn">{expiring} expiring</Pill>}
                      {valid > 0 && <Pill cls="bg-success-soft text-success">{valid} valid</Pill>}
                    </span>
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
