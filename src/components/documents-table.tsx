"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search, Filter, FilePlus, X, FileText, Pencil, RefreshCw, Archive,
  ArchiveRestore, ExternalLink, Building2, User as UserIcon, Paperclip,
} from "lucide-react";
import { FluidSelect } from "./fluid-select";
import { PeekPreview, type PeekAction } from "./peek-preview";
import { DocumentForm } from "./document-form";
import { useToast } from "./toast";
import { useContextActions } from "./context-actions";
import { triggerHaptic } from "@/lib/use-long-press";
import { cn } from "@/lib/cn";
import {
  DOC_CATEGORIES, deriveDocStatus, daysToExpiry, expiryLabel, docStatusColor,
  type DocStatus, type DocumentRow,
} from "@/lib/documents-shared";
import { archiveDocumentAction, renewDocumentAction, getDocumentFileLinkAction } from "@/app/documents/actions";

type StatusFilter = "all" | DocStatus;

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function DocumentsTable({
  documents, companies, people,
}: {
  documents: DocumentRow[];
  companies: Array<{ id: number; name: string; accentColor?: string | null }>;
  people: Array<{ id: number; name: string }>;
}) {
  const { toast } = useToast();
  const [, startAction] = useTransition();

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<number | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [peek, setPeek] = useState<DocumentRow | null>(null);
  // Text to pre-load the create form's auto-fill panel (e.g. filing an Inbox item).
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Open the create dialog pre-filled when arriving from the Inbox
  // (/documents?newdoc=1&text=…), then strip the params from the URL.
  useEffect(() => {
    if (searchParams.get("newdoc") === "1") {
      const text = searchParams.get("text");
      if (text) setPrefillText(text);
      setCreateOpen(true);
      router.replace(pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const companyName = (id: number | null) => companies.find((c) => c.id === id)?.name ?? null;
  const companyAccent = (id: number | null) => companies.find((c) => c.id === id)?.accentColor ?? null;
  const personName = (id: number | null) => people.find((p) => p.id === id)?.name ?? null;

  // Page "+" action
  useContextActions(
    "documents",
    [{ id: "add-document", label: "Add document", icon: <FilePlus size={16} />, onClick: () => setCreateOpen(true), primary: true, tone: "accent" }],
    []
  );

  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onRowPointerDown(doc: DocumentRow, e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(doc); }, 400);
  }
  function onRowPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) clearPress();
  }

  function doRenew(doc: DocumentRow) {
    startAction(async () => {
      const res = await renewDocumentAction(doc.id);
      toast(res.ok ? `Renewal task ${res.code} created` : res.error, { tone: res.ok ? "success" : "warn", duration: 4500 });
      setPeek(null);
    });
  }
  function openStoredFile(doc: DocumentRow) {
    startAction(async () => {
      const res = await getDocumentFileLinkAction(doc.id);
      if (res.ok) window.open(res.url, "_blank");
      else toast(res.error, { tone: "warn" });
    });
  }
  function doArchive(doc: DocumentRow, archived: boolean) {
    startAction(async () => {
      const res = await archiveDocumentAction(doc.id, archived);
      toast(res.ok ? (archived ? "Document archived" : "Document restored") : res.error, { tone: res.ok ? "success" : "warn" });
      setPeek(null);
    });
  }

  const filtered = useMemo(() => {
    let rows = documents.slice();
    if (!showArchived) rows = rows.filter((d) => !d.archived);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        (d.docType?.toLowerCase().includes(q) ?? false) ||
        (d.issuer?.toLowerCase().includes(q) ?? false) ||
        (d.referenceNo?.toLowerCase().includes(q) ?? false) ||
        (companyName(d.companyId)?.toLowerCase().includes(q) ?? false)
      );
    }
    if (companyFilter !== "all") rows = rows.filter((d) => d.companyId === companyFilter);
    if (categoryFilter !== "all") rows = rows.filter((d) => d.category === categoryFilter);
    if (statusFilter !== "all") rows = rows.filter((d) => deriveDocStatus(d) === statusFilter);
    // Expired/expiring soonest first, nulls last.
    rows.sort((a, b) => {
      const da = a.expiryDate?.getTime() ?? Infinity;
      const db = b.expiryDate?.getTime() ?? Infinity;
      return da - db;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, search, companyFilter, categoryFilter, statusFilter, showArchived]);

  const counts = useMemo(() => {
    const live = documents.filter((d) => !d.archived);
    const tally = (s: DocStatus) => live.filter((d) => deriveDocStatus(d) === s).length;
    return { all: live.length, expired: tally("Expired"), expiring: tally("Expiring") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  const peekActions = (doc: DocumentRow): PeekAction[] => {
    const a: PeekAction[] = [];
    a.push({ label: "Edit", icon: <Pencil size={16} />, tone: "accent", onClick: () => { setPeek(null); setEditDoc(doc); } });
    if (doc.companyId) a.push({ label: "Renew", icon: <RefreshCw size={16} />, onClick: () => doRenew(doc) });
    if (doc.storagePath) a.push({ label: "Open file", icon: <Paperclip size={16} />, onClick: () => openStoredFile(doc) });
    else if (doc.fileUrl) a.push({ label: "Open link", icon: <ExternalLink size={16} />, onClick: () => window.open(doc.fileUrl!, "_blank") });
    a.push(doc.archived
      ? { label: "Restore", icon: <ArchiveRestore size={16} />, onClick: () => doArchive(doc, false) }
      : { label: "Archive", icon: <Archive size={16} />, tone: "danger", onClick: () => doArchive(doc, true) });
    return a;
  };

  const statusBadge = (doc: DocumentRow) => {
    const s = deriveDocStatus(doc);
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", docStatusColor[s])}>{s}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, type, issuer, reference, company…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        <FluidSelect value={companyFilter === "all" ? "all" : String(companyFilter)}
          onSelect={(v) => setCompanyFilter(v === "all" ? "all" : parseInt(v, 10))}
          options={[{ value: "all", label: "All Companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
        <FluidSelect value={categoryFilter} onSelect={setCategoryFilter}
          options={[{ value: "all", label: "All Categories" }, ...DOC_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
        <FluidSelect value={statusFilter} onSelect={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: "All Statuses" },
            { value: "Expired", label: "Expired" },
            { value: "Expiring", label: "Expiring soon" },
            { value: "Valid", label: "Valid" },
            { value: "No expiry", label: "No expiry" },
          ]} />
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter size={11} className="text-fg-subtle" />
        {[
          { key: "all" as StatusFilter, label: "All", count: counts.all, tone: "default" as const },
          { key: "Expired" as StatusFilter, label: "Expired", count: counts.expired, tone: "danger" as const },
          { key: "Expiring" as StatusFilter, label: "Expiring soon", count: counts.expiring, tone: "warn" as const },
        ].map(({ key, label, count, tone }) => {
          const active = statusFilter === key;
          const tint = active
            ? tone === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
              : tone === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
              : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
            : count === 0 ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle"
            : tone === "danger" ? "bg-danger-soft/50 ring-1 ring-danger/25 text-danger hover:ring-2"
            : tone === "warn" ? "bg-warn-soft/50 ring-1 ring-warn/25 text-warn hover:ring-2"
            : "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-muted hover:ring-2 hover:ring-border";
          return (
            <button key={key} type="button" onClick={() => setStatusFilter(key)}
              className={`inline-flex items-center gap-2 pl-2 pr-3 py-1.5 text-xs rounded-full transition-all backdrop-blur-md hover:shadow-sm ${tint}`}>
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/30 dark:bg-black/20 font-semibold tabular">{count}</span>
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-accent" />
          Show archived
        </label>
      </div>

      {/* List */}
      {filtered.length > 0 ? (
        <div className="glass elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {filtered.map((doc) => {
            const dte = daysToExpiry(doc);
            const urgent = dte !== null && dte < 0;
            const soon = dte !== null && dte >= 0 && dte <= doc.reminderLeadDays;
            const accent = companyAccent(doc.companyId);
            return (
              <div key={doc.id} role="button" tabIndex={0}
                onClick={() => { if (longPressed.current) { longPressed.current = false; return; } setEditDoc(doc); }}
                onPointerDown={(e) => onRowPointerDown(doc, e)}
                onPointerMove={onRowPointerMove}
                onPointerUp={clearPress} onPointerLeave={clearPress} onPointerCancel={clearPress}
                className={cn("flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-bg-muted/40 transition-colors select-none", doc.archived && "opacity-60")}>
                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: accent || "var(--border)" }} />
                <FileText size={16} className="text-fg-subtle shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-medium">{doc.title}</span>
                    {(doc.storagePath || doc.fileUrl) && <Paperclip size={12} className="text-fg-subtle shrink-0" />}
                    {doc.category && <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-bg-muted text-fg-muted shrink-0">{doc.category}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-fg-subtle mt-0.5 min-w-0">
                    {companyName(doc.companyId) && <span className="inline-flex items-center gap-1 truncate"><Building2 size={11} />{companyName(doc.companyId)}</span>}
                    {personName(doc.personId) && <span className="inline-flex items-center gap-1 truncate"><UserIcon size={11} />{personName(doc.personId)}</span>}
                  </div>
                </div>
                <div className="hidden sm:block text-right shrink-0">
                  <div className="text-xs text-fg-muted">{fmtDate(doc.expiryDate)}</div>
                  {expiryLabel(doc) && (
                    <div className={cn("text-[11px]", urgent ? "text-danger font-medium" : soon ? "text-warn" : "text-fg-subtle")}>{expiryLabel(doc)}</div>
                  )}
                </div>
                <div className="shrink-0">{statusBadge(doc)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass elevated rounded-2xl text-center py-12 text-fg-muted text-sm">
          No documents match these filters.
        </div>
      )}

      <p className="text-xs text-fg-subtle px-1">
        Showing {filtered.length} of {documents.filter((d) => showArchived || !d.archived).length} · tap to edit · long-press for quick actions.
      </p>

      {/* Peek */}
      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => { const d = peek; setPeek(null); setEditDoc(d); } : undefined}
        title={peek?.title}
        subtitle={peek ? [companyName(peek.companyId), peek.category, personName(peek.personId)].filter(Boolean).join(" · ") || undefined : undefined}
        pills={peek ? (
          <>
            {statusBadge(peek)}
            {peek.expiryDate && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-bg-muted text-fg-muted">{fmtDate(peek.expiryDate)}{expiryLabel(peek) ? ` · ${expiryLabel(peek)}` : ""}</span>}
          </>
        ) : undefined}
        body={peek && (peek.issuer || peek.referenceNo || peek.notes) ? (
          <div className="space-y-1 text-[13px] text-fg-muted">
            {peek.issuer && <div><span className="text-fg-subtle">Issuer:</span> {peek.issuer}</div>}
            {peek.referenceNo && <div><span className="text-fg-subtle">Ref:</span> {peek.referenceNo}</div>}
            {peek.notes && <div className="line-clamp-3">{peek.notes}</div>}
          </div>
        ) : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />

      {/* Create dialog */}
      <DocDialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setPrefillText(undefined); }} title="Add a document">
        <DocumentForm mode="create" companies={companies} people={people} initialExtractText={prefillText}
          onCancel={() => { setCreateOpen(false); setPrefillText(undefined); }}
          onComplete={(res) => { if (res.ok) { toast("Document added.", { tone: "success" }); setCreateOpen(false); setPrefillText(undefined); } }} />
      </DocDialog>

      {/* Edit dialog */}
      <DocDialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)} title="Edit document">
        {editDoc && (
          <DocumentForm mode="edit" doc={editDoc} companies={companies} people={people}
            onCancel={() => setEditDoc(null)}
            onComplete={(res) => { if (res.ok) { toast("Saved.", { tone: "success" }); setEditDoc(null); } }} />
        )}
      </DocDialog>
    </div>
  );
}

function DocDialog({ open, onOpenChange, title, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm
          data-[state=open]:animate-in data-[state=open]:fade-in-0
          data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(560px,calc(100vw-2rem))] max-h-[85vh]
          -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl
          bg-bg-elev border border-border shadow-2xl outline-none
          data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0
          data-[state=closed]:animate-out data-[state=closed]:zoom-out-95">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close"
                className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors">
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>
          <div className="p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
