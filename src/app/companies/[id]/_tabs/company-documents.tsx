"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { FilePlus, X, FileText, ExternalLink, Paperclip, ChevronRight, ShieldCheck, CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import { DocumentForm } from "@/components/document-form";
import { getDocumentFileLinkAction } from "@/app/documents/actions";
import { deriveDocStatus, expiryLabel, type DocStatus, type DocumentRow } from "@/lib/documents-shared";
import type { CompanyChecklistItem } from "@/lib/compliance";
import { useToast } from "@/components/toast";

// Display order for the grouped company file. Categories not listed fall to the
// end under their own heading; missing categories simply don't render.
const CATEGORY_ORDER = [
  "Registration",
  "Licence",
  "Permit",
  "Tax",
  "Insurance",
  "Lease",
  "Contract",
  "Certificate",
  "Immigration",
  "Passport",
  "Other",
] as const;

const STATUS_BADGE: Record<DocStatus, string> = {
  Valid: "bg-success-soft text-success",
  Expiring: "bg-warn-soft text-warn",
  Expired: "bg-danger-soft text-danger",
  "No expiry": "bg-bg-muted text-fg-muted",
  Archived: "bg-bg-muted text-fg-subtle",
};

export function CompanyDocuments({
  companyId,
  companyName,
  documents,
  checklist,
  companies,
  people,
}: {
  companyId: number;
  companyName: string;
  documents: DocumentRow[];
  checklist: CompanyChecklistItem[];
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<string | null>(null);
  const [opening, startOpen] = useTransition();

  // Group by category in the fixed display order; unknown categories last.
  const groups = useMemo(() => {
    const byCat = new Map<string, DocumentRow[]>();
    for (const doc of documents) {
      const key = doc.category ?? "Other";
      const arr = byCat.get(key) ?? [];
      arr.push(doc);
      byCat.set(key, arr);
    }
    const ordered: Array<{ category: string; docs: DocumentRow[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const docs = byCat.get(cat);
      if (docs?.length) {
        ordered.push({ category: cat, docs });
        byCat.delete(cat);
      }
    }
    for (const [category, docs] of byCat) ordered.push({ category, docs });
    return ordered;
  }, [documents]);

  function openFile(id: number) {
    startOpen(async () => {
      const res = await getDocumentFileLinkAction(id);
      if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
      else toast(res.error, { tone: "danger" });
    });
  }

  function startAdd(category: string | null) {
    setAddCategory(category);
    setAddOpen(true);
  }

  const requiredItems = checklist.filter((c) => c.required);
  const requiredOnFile = requiredItems.filter((c) => c.status !== "missing").length;

  return (
    <div className="space-y-4">
      {/* Statutory checklist — what every company should hold, and what's missing. */}
      <section className="glass elevated rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck size={15} className="text-accent" /> Statutory checklist
          </h2>
          <span className="text-[11px] font-medium tabular text-fg-muted">
            {requiredOnFile}/{requiredItems.length} required on file
          </span>
        </div>
        <ul className="divide-y divide-border/50">
          {checklist.map((item) => {
            const tone =
              item.status === "missing"
                ? item.required
                  ? { Icon: Circle, cls: "text-danger" }
                  : { Icon: Circle, cls: "text-fg-subtle" }
                : item.status === "expired"
                ? { Icon: AlertTriangle, cls: "text-danger" }
                : item.status === "expiring"
                ? { Icon: AlertTriangle, cls: "text-warn" }
                : { Icon: CheckCircle2, cls: "text-success" };
            const Icon = tone.Icon;
            const needsAction = item.status === "missing" || item.status === "expired" || item.status === "expiring";
            const actionLabel = item.status === "missing" ? "Add" : "Renew";
            return (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon size={16} className={`shrink-0 ${tone.cls}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    {!item.required && (
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Recommended</span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-fg-subtle">
                    {item.status === "missing"
                      ? item.hint
                      : `${item.docTitle ?? item.hint}${item.detail ? ` · ${item.detail}` : ""}`}
                  </span>
                </span>
                {item.status !== "missing" && (
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      item.status === "expired" ? "bg-danger-soft text-danger" : item.status === "expiring" ? "bg-warn-soft text-warn" : "bg-success-soft text-success"
                    }`}
                  >
                    {item.status === "valid" ? "On file" : item.status === "expiring" ? "Expiring" : "Expired"}
                  </span>
                )}
                {needsAction && (
                  <button
                    type="button"
                    onClick={() => startAdd(item.categories[0])}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent/80 transition-colors rounded-full px-2 py-0.5 hover:bg-accent-soft/40"
                  >
                    <FilePlus size={12} /> {actionLabel}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
          <FileText size={13} /> Company file
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">
            {documents.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => startAdd(null)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors rounded-full px-2.5 py-1 hover:bg-accent-soft/40"
        >
          <FilePlus size={13} /> Add document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="glass elevated rounded-2xl px-4 py-10 text-center text-sm text-fg-muted space-y-3">
          <p>No documents filed for {companyName} yet.</p>
          <button
            type="button"
            onClick={() => startAdd(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors rounded-full px-3 py-1.5 ring-1 ring-accent/30 hover:bg-accent-soft/40"
          >
            <FilePlus size={13} /> Add the first document
          </button>
        </div>
      ) : (
        groups.map(({ category, docs }) => (
          <section key={category} className="glass elevated rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                {category}
                <span className="text-[11px] font-normal text-fg-subtle tabular">{docs.length}</span>
              </h3>
              <button
                type="button"
                onClick={() => startAdd(category)}
                title={`Add a ${category} document`}
                className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-accent transition-colors rounded-full px-2 py-0.5 hover:bg-bg-muted/60"
              >
                <FilePlus size={12} /> Add
              </button>
            </div>
            <ul className="divide-y divide-border/50">
              {docs.map((doc) => {
                const status = deriveDocStatus(doc);
                const exp = expiryLabel(doc);
                return (
                  <li key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{doc.title}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">
                        {[doc.issuer, doc.referenceNo, exp].filter(Boolean).join(" · ") || "No details"}
                      </span>
                    </span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[status]}`}>
                      {status}
                    </span>
                    {doc.storagePath ? (
                      <button
                        type="button"
                        onClick={() => openFile(doc.id)}
                        disabled={opening}
                        title="Open file"
                        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted/60 transition-colors disabled:opacity-50"
                      >
                        <Paperclip size={14} />
                      </button>
                    ) : doc.fileUrl ? (
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open link"
                        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted/60 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="shrink-0 h-7 w-7" aria-hidden />
                    )}
                    <a
                      href={`/documents?company=${companyId}&doc=${doc.id}`}
                      title="Edit document"
                      className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-subtle hover:text-fg hover:bg-bg-muted/60 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <div className="flex justify-end">
        <a
          href={`/documents?company=${companyId}`}
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors rounded-full px-2.5 py-1 hover:bg-bg-muted/60"
        >
          <ExternalLink size={12} /> Open in Documents centre
        </a>
      </div>

      {/* Add-document modal, layered over the company page (no route change). */}
      <Dialog.Root open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
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
                Add a document for {companyName}
                {addCategory ? ` · ${addCategory}` : ""}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors">
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {addOpen && (
                <DocumentForm
                  mode="create"
                  companies={companies}
                  people={people}
                  initialCompanyId={companyId}
                  initialCategory={addCategory}
                  onCancel={() => setAddOpen(false)}
                  onComplete={(res) => {
                    if (res.ok) {
                      toast("Document added.", { tone: "success" });
                      setAddOpen(false);
                      router.refresh();
                    }
                  }}
                />
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
