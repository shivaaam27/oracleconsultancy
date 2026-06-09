"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search, Filter, FilePlus, X, FileText, Pencil, RefreshCw, Archive,
  ArchiveRestore, ExternalLink, Building2, User as UserIcon, Paperclip, UploadCloud,
} from "lucide-react";
import { FluidSelect } from "./fluid-select";
import { PeekPreview, type PeekAction } from "./peek-preview";
import { DocumentForm } from "./document-form";
import { BulkUploadDialog } from "./bulk-upload-dialog";
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
  documents, companies, people, linkedTasks = {},
}: {
  documents: DocumentRow[];
  companies: Array<{ id: number; name: string; accentColor?: string | null }>;
  people: Array<{ id: number; name: string }>;
  linkedTasks?: Record<number, Array<{ code: string; status: string }>>;
}) {
  const { toast } = useToast();
  const [, startAction] = useTransition();

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<number | "all">("all");
  const [personFilter, setPersonFilter] = useState<number | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [peek, setPeek] = useState<DocumentRow | null>(null);
  // Text to pre-load the create form's auto-fill panel (e.g. filing an Inbox item).
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);
  const [prefillPersonId, setPrefillPersonId] = useState<number | null>(null);
  const [prefillCompanyId, setPrefillCompanyId] = useState<number | null>(null);
  const [prefillCategory, setPrefillCategory] = useState<string | null>(null);
  const [prefillTitle, setPrefillTitle] = useState<string | undefined>(undefined);
  const [prefillVendorId, setPrefillVendorId] = useState<number | null>(null);
  // Where to go back to after the create dialog closes (e.g. the person drawer
  // we launched "Add doc" from), so the flow doesn't dump you on the table.
  const [returnTo, setReturnTo] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Open the create dialog pre-filled when arriving from the Inbox
  // (/documents?newdoc=1&text=…), then strip the params from the URL.
  useEffect(() => {
    if (searchParams.get("newdoc") === "1") {
      const text = searchParams.get("text");
      if (text) setPrefillText(text);
      const person = searchParams.get("person");
      if (person && /^\d+$/.test(person)) setPrefillPersonId(parseInt(person, 10));
      const company = searchParams.get("company");
      if (company && /^\d+$/.test(company)) setPrefillCompanyId(parseInt(company, 10));
      const category = searchParams.get("category");
      if (category) setPrefillCategory(category);
      const title = searchParams.get("title");
      if (title) setPrefillTitle(title);
      const vendor = searchParams.get("vendor");
      if (vendor && /^\d+$/.test(vendor)) setPrefillVendorId(parseInt(vendor, 10));
      // Remember where we came from so cancel/save returns there (e.g.
      // from=person:42 → /people?person=42, from=company:3 → /companies/3).
      const from = searchParams.get("from");
      if (from) {
        const m = /^(person|company):(\d+)$/.exec(from);
        if (m) setReturnTo(m[1] === "person" ? `/people?person=${m[2]}` : `/companies/${m[2]}`);
      }
      setCreateOpen(true);
      router.replace(pathname, { scroll: false });
    }
    const company = searchParams.get("company");
    if (company && /^\d+$/.test(company)) setCompanyFilter(parseInt(company, 10));
    const person = searchParams.get("person");
    if (person && /^\d+$/.test(person)) setPersonFilter(parseInt(person, 10));
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

  // Reset the create dialog's prefill state, and return to the launching
  // page (person drawer / company) when we arrived via a ?from= link.
  function closeCreate() {
    setPrefillText(undefined);
    setPrefillPersonId(null);
    setPrefillCompanyId(null);
    setPrefillCategory(null);
    setPrefillTitle(undefined);
    setPrefillVendorId(null);
    if (returnTo) { const to = returnTo; setReturnTo(null); router.push(to); }
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
        (companyName(d.companyId)?.toLowerCase().includes(q) ?? false) ||
        (personName(d.personId)?.toLowerCase().includes(q) ?? false)
      );
    }
    if (companyFilter !== "all") rows = rows.filter((d) => d.companyId === companyFilter);
    if (personFilter !== "all") rows = rows.filter((d) => d.personId === personFilter);
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
  }, [documents, search, companyFilter, personFilter, categoryFilter, statusFilter, showArchived]);

  const counts = useMemo(() => {
    const live = documents.filter((d) => !d.archived);
    const tally = (s: DocStatus) => live.filter((d) => deriveDocStatus(d) === s).length;
    return {
      all: live.length,
      expired: tally("Expired"),
      expiring: tally("Expiring"),
      valid: tally("Valid"),
      noExpiry: tally("No expiry"),
    };
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
        <FluidSelect value={personFilter === "all" ? "all" : String(personFilter)}
          onSelect={(v) => setPersonFilter(v === "all" ? "all" : parseInt(v, 10))}
          options={[{ value: "all", label: "All People" }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]} />
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
        <button type="button" onClick={() => setBulkOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg-subtle/60 px-3 py-2 text-sm text-fg-muted hover:text-fg hover:border-accent transition-colors">
          <UploadCloud size={15} /> Add several
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter size={11} className="text-fg-subtle" />
        {[
          { key: "all" as StatusFilter, label: "All", count: counts.all, tone: "default" as const },
          { key: "Expired" as StatusFilter, label: "Expired", count: counts.expired, tone: "danger" as const },
          { key: "Expiring" as StatusFilter, label: "Expiring soon", count: counts.expiring, tone: "warn" as const },
          { key: "Valid" as StatusFilter, label: "Valid", count: counts.valid, tone: "success" as const },
          { key: "No expiry" as StatusFilter, label: "No expiry", count: counts.noExpiry, tone: "default" as const },
        ].map(({ key, label, count, tone }) => {
          const active = statusFilter === key;
          const tint = active
            ? tone === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
              : tone === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
              : tone === "success" ? "bg-success-soft/70 ring-2 ring-success/40 text-success"
              : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
            : count === 0 ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle"
            : tone === "danger" ? "bg-danger-soft/50 ring-1 ring-danger/25 text-danger hover:ring-2"
            : tone === "warn" ? "bg-warn-soft/50 ring-1 ring-warn/25 text-warn hover:ring-2"
            : tone === "success" ? "bg-success-soft/50 ring-1 ring-success/25 text-success hover:ring-2"
            : "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-muted hover:ring-2 hover:ring-border";
          return (
            <button key={key} type="button" onClick={() => setStatusFilter(active && key !== "all" ? "all" : key)}
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
        <div className="glass elevated rounded-3xl overflow-hidden divide-y divide-border/60">
          {filtered.map((doc) => {
            const dte = daysToExpiry(doc);
            const urgent = dte !== null && dte < 0;
            const soon = dte !== null && dte >= 0 && dte <= doc.reminderLeadDays;
            const accent = companyAccent(doc.companyId);
            const openLinkedTask = linkedTasks[doc.id]?.find((t) => t.status !== "Completed" && t.status !== "Closed");
            return (
              <div key={doc.id} role="button" tabIndex={0}
                onClick={() => { if (longPressed.current) { longPressed.current = false; return; } setEditDoc(doc); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditDoc(doc); } }}
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
                    {doc.personId && <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-info-soft text-info shrink-0">Person file</span>}
                    {openLinkedTask && (
                      <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-accent-soft text-accent shrink-0">
                        {openLinkedTask.code}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-fg-subtle mt-0.5 min-w-0">
                    {companyName(doc.companyId) && <span className="inline-flex items-center gap-1 truncate"><Building2 size={11} />{companyName(doc.companyId)}</span>}
                    {personName(doc.personId) && <span className="inline-flex items-center gap-1 truncate"><UserIcon size={11} />{personName(doc.personId)}</span>}
                  </div>
                  {doc.notes && doc.notes.trim() && (
                    <div className="text-[11px] text-fg-muted truncate mt-0.5">{doc.notes}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {/* Full date on larger screens; the countdown shows on all sizes. */}
                  <div className="hidden sm:block text-xs text-fg-muted">{fmtDate(doc.expiryDate)}</div>
                  {expiryLabel(doc) ? (
                    <div className={cn("text-[11px]", urgent ? "text-danger font-medium" : soon ? "text-warn" : "text-fg-subtle")}>{expiryLabel(doc)}</div>
                  ) : (
                    <div className="text-[11px] text-fg-subtle">No expiry</div>
                  )}
                </div>
                <div className="shrink-0">{statusBadge(doc)}</div>
              </div>
            );
          })}
        </div>
      ) : documents.length === 0 ? (
        <div className="glass elevated rounded-3xl text-center py-14 px-6">
          <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-bg-muted/60 flex items-center justify-center text-fg-subtle">
            <FileText size={22} />
          </div>
          <div className="text-sm font-medium">No documents yet</div>
          <div className="text-xs text-fg-muted mt-1 max-w-sm mx-auto">Track licences, contracts, certificates, insurance, leases and visas — with expiry dates and reminders.</div>
          <button type="button" onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity">
            <FilePlus size={15} /> Add your first document
          </button>
        </div>
      ) : (
        <div className="glass elevated rounded-3xl text-center py-12 text-fg-muted text-sm">
          No documents match these filters.
        </div>
      )}

      {documents.length > 0 && (
        <p className="text-xs text-fg-subtle px-1">
          Showing {filtered.length} of {documents.filter((d) => showArchived || !d.archived).length} · tap to edit · long-press for quick actions.
        </p>
      )}

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
        body={peek && (peek.issuer || peek.referenceNo || peek.notes || (linkedTasks[peek.id]?.length)) ? (
          <div className="space-y-1 text-[13px] text-fg-muted">
            {peek.issuer && <div><span className="text-fg-subtle">Issuer:</span> {peek.issuer}</div>}
            {peek.referenceNo && <div><span className="text-fg-subtle">Ref:</span> {peek.referenceNo}</div>}
            {peek.notes && <div className="line-clamp-3">{peek.notes}</div>}
            {linkedTasks[peek.id]?.length ? (
              <div className="pt-0.5">
                <span className="text-fg-subtle">Renewal task{linkedTasks[peek.id].length > 1 ? "s" : ""}: </span>
                {linkedTasks[peek.id].map((t, i) => (
                  <span key={t.code}>
                    {i > 0 && ", "}
                    <a href={`/task/${t.code}`} className="font-mono text-accent hover:underline">{t.code}</a>
                    <span className="text-fg-subtle"> ({t.status})</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />

      {/* Create dialog */}
      <BulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        companies={companies}
        people={people}
        onDone={() => router.refresh()}
      />

      <DocDialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) closeCreate(); }} title="Add a document">
        <DocumentForm mode="create" companies={companies} people={people} initialExtractText={prefillText}
          initialPersonId={prefillPersonId} initialCompanyId={prefillCompanyId} initialCategory={prefillCategory} initialTitle={prefillTitle} initialVendorId={prefillVendorId}
          onCancel={() => { setCreateOpen(false); closeCreate(); }}
          onComplete={(res) => { if (res.ok) { toast("Document added.", { tone: "success" }); setCreateOpen(false); closeCreate(); } }} />
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
