"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search, Filter, FilePlus, X, FileText, Pencil, RefreshCw, Archive,
  ArchiveRestore, ExternalLink, Building2, User as UserIcon, Paperclip,
  CheckSquare, Check, List as ListIcon, CalendarRange, Scissors, ChevronDown, Users, Trash2, AlertTriangle, Loader2,
} from "lucide-react";
import { FluidSelect } from "./fluid-select";
import { CompanyAvatar } from "./company-avatar";
import { Button, CountPill, RegisterList, RegisterRow, RegisterGroupHeader } from "./ui";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { PeekPreview, type PeekAction } from "./peek-preview";
import { DocumentForm } from "./document-form";
import { ConfidenceBadge, confidenceTier } from "@/components/confidence-badge";
import { SplitDocumentDialog } from "./split-document-dialog";
import { useToast } from "./toast";
import { useContextActions } from "./context-actions";
import { triggerHaptic } from "@/lib/use-long-press";
import { cn } from "@/lib/cn";
import {
  deriveDocStatus, daysToExpiry, expiryLabel, docStatusColor, displayDocName,
  shelfForCategory, SHELF_CODE, type DocStatus, type DocumentRow,
} from "@/lib/documents-shared";
import { archiveDocumentAction, renewDocumentAction, getDocumentFileLinkAction, deleteDocumentsAction, type DeleteScope } from "@/app/documents/actions";

type StatusFilter = "all" | DocStatus | "needs-renewal";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type ShelfGroup = { name: string; code: string; rows: DocumentRow[]; expired: number; expiring: number };
/** Group a company's documents into the owner's 8 filing shelves (category folders),
 *  in shelf-code order (01…08) so it reads like the on-disk folders. */
function groupRowsByShelf(rows: DocumentRow[]): ShelfGroup[] {
  const map = new Map<string, ShelfGroup>();
  for (const d of rows) {
    const name = shelfForCategory(d.category);
    let g = map.get(name);
    if (!g) { g = { name, code: SHELF_CODE[name], rows: [], expired: 0, expiring: 0 }; map.set(name, g); }
    g.rows.push(d);
    const s = deriveDocStatus(d);
    if (s === "Expired") g.expired++;
    else if (s === "Expiring") g.expiring++;
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

type SubGroup = { key: string; label: string; code?: string; rows: DocumentRow[]; expired: number; expiring: number };
/** Group the staff section's documents BY PERSON (each person is a sub-section),
 *  worst-first then name — a person's file is about the person, not the category. */
function groupRowsByPerson(rows: DocumentRow[], nameOf: (id: number | null) => string | null): SubGroup[] {
  const map = new Map<string, SubGroup>();
  for (const d of rows) {
    const key = d.personId ? `p${d.personId}` : "np";
    const label = (d.personId ? nameOf(d.personId) : null) ?? "Unassigned";
    let g = map.get(key);
    if (!g) { g = { key, label, rows: [], expired: 0, expiring: 0 }; map.set(key, g); }
    g.rows.push(d);
    const s = deriveDocStatus(d);
    if (s === "Expired") g.expired++;
    else if (s === "Expiring") g.expiring++;
  }
  return [...map.values()].sort((a, b) => b.expired - a.expired || b.expiring - a.expiring || a.label.localeCompare(b.label));
}

export function DocumentsTable({
  documents, companies, people, linkedTasks = {},
}: {
  documents: DocumentRow[];
  companies: Array<{ id: number; name: string; accentColor?: string | null; aliases?: string[]; logoUrl?: string | null }>;
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
  // Editing is owned by the ONE workspace-level inline editor (opens over whatever
  // tab you're on; closing returns you there). We just hand it the doc.
  const openEditor = (doc: DocumentRow) => window.dispatchEvent(new CustomEvent("cos:edit-document", { detail: { id: doc.id, doc } }));
  const [splitDoc, setSplitDoc] = useState<DocumentRow | null>(null);
  const [peek, setPeek] = useState<DocumentRow | null>(null);
  // Text to pre-load the create form's auto-fill panel (e.g. filing an Inbox item).
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);
  const [prefillPersonId, setPrefillPersonId] = useState<number | null>(null);
  const [prefillCompanyId, setPrefillCompanyId] = useState<number | null>(null);
  const [prefillCategory, setPrefillCategory] = useState<string | null>(null);
  const [prefillTitle, setPrefillTitle] = useState<string | undefined>(undefined);
  const [prefillVendorId, setPrefillVendorId] = useState<number | null>(null);
  const [prefillSupersedeId, setPrefillSupersedeId] = useState<number | null>(null);
  // Where to go back to after the create dialog closes (e.g. the person drawer
  // we launched "Add doc" from), so the flow doesn't dump you on the table.
  const [returnTo, setReturnTo] = useState<string | null>(null);

  // Multi-select bulk actions (mirrors the People table pattern).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // List vs expiry-timeline (grouped by how soon each document lapses).
  const [view, setView] = useState<"list" | "timeline">("list");
  // Which company housings the owner has manually collapsed/expanded (overrides the
  // default, which auto-collapses companies with nothing expiring).
  const [groupOverride, setGroupOverride] = useState<Record<string, boolean>>({});

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
      const supersede = searchParams.get("supersede");
      if (supersede && /^\d+$/.test(supersede)) setPrefillSupersedeId(parseInt(supersede, 10));
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

  // Replace flow (Expiry watch → "Replace"): a same-page window event opens the
  // create dialog pre-filled with the owner/category + the doc to supersede. Uses
  // an event, NOT a URL param, so it never collides with the global ?company= drawer
  // and works without a page re-mount.
  useEffect(() => {
    function onNewDoc(e: Event) {
      const d = (e as CustomEvent<{ companyId?: number | null; personId?: number | null; category?: string | null; supersedeId?: number | null }>).detail || {};
      setPrefillCompanyId(d.companyId ?? null);
      setPrefillPersonId(d.personId ?? null);
      setPrefillCategory(d.category ?? null);
      setPrefillSupersedeId(d.supersedeId ?? null);
      setCreateOpen(true);
    }
    window.addEventListener("cos:new-document", onNewDoc);
    return () => window.removeEventListener("cos:new-document", onNewDoc);
  }, []);

  // Deep-link: /documents?doc=ID opens that document's editor. Hand it to the ONE
  // workspace-level inline editor (works for quarantined docs not in this list too)
  // and strip the param immediately — MOUNT-ONLY so it never re-fires on tab switch.
  useEffect(() => {
    const doc = searchParams.get("doc");
    if (doc && /^\d+$/.test(doc)) {
      window.dispatchEvent(new CustomEvent("cos:edit-document", { detail: { id: parseInt(doc, 10) } }));
      const sp = new URLSearchParams(Array.from(searchParams.entries()));
      sp.delete("doc");
      router.replace(sp.toString() ? `${pathname}?${sp}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const companyName = (id: number | null) => companies.find((c) => c.id === id)?.name ?? null;
  const companyAccent = (id: number | null) => companies.find((c) => c.id === id)?.accentColor ?? null;
  const companyLogo = (id: number | null) => companies.find((c) => c.id === id)?.logoUrl ?? null;
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
    setPrefillSupersedeId(null);
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
    if (statusFilter === "needs-renewal") {
      // "Needs renewal" collects both Expired and Expiring soon in one view.
      rows = rows.filter((d) => { const s = deriveDocStatus(d); return s === "Expired" || s === "Expiring"; });
    } else if (statusFilter !== "all") {
      rows = rows.filter((d) => deriveDocStatus(d) === statusFilter);
    }
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
      needsRenewal: tally("Expired") + tally("Expiring"),
      valid: tally("Valid"),
      noExpiry: tally("No expiry"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  // Company housings — the filtered rows grouped by owner company (person-only docs
  // and unfiled docs get their own housings), worst-first (most expired, then most
  // expiring, then name). Matches the Tasks page's grouped-housing grammar.
  const docGroups = useMemo(() => {
    type G = { key: string; name: string; companyId: number | null; kind: "company" | "people" | "none"; accent: string | null; rows: DocumentRow[]; expired: number; expiring: number };
    const map = new Map<string, G>();
    for (const d of filtered) {
      let key: string, name: string, kind: G["kind"], companyId: number | null;
      if (d.companyId) { key = `c${d.companyId}`; name = companyName(d.companyId) ?? "Company"; kind = "company"; companyId = d.companyId; }
      else if (d.personId) { key = "people"; name = "Staff & personal files"; kind = "people"; companyId = null; }
      else { key = "none"; name = "Unfiled"; kind = "none"; companyId = null; }
      let g = map.get(key);
      if (!g) { g = { key, name, companyId, kind, accent: companyId ? companyAccent(companyId) : null, rows: [], expired: 0, expiring: 0 }; map.set(key, g); }
      g.rows.push(d);
      const s = deriveDocStatus(d);
      if (s === "Expired") g.expired++;
      else if (s === "Expiring") g.expiring++;
    }
    // Staff & personal files FIRST (top), then companies worst-first, then Unfiled.
    const kindRank = (k: G["kind"]) => (k === "people" ? 0 : k === "none" ? 2 : 1);
    return [...map.values()].sort((a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      b.expired - a.expired || b.expiring - a.expiring ||
      a.name.localeCompare(b.name),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  // Housings are collapsed by default so the Library opens SHORT — a scannable
  // index of companies with dot-stats flagging where the expiries are (the urgent
  // documents themselves are listed up top in Needs attention). Tap to drill in.
  const isCollapsed = (g: { key: string }) => groupOverride[g.key] ?? true;
  function toggleGroupCollapse(key: string, current: boolean) {
    setGroupOverride((prev) => ({ ...prev, [key]: !current }));
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  // Delete flow — one dialog for every level (doc / category / company / all).
  const [deleteTarget, setDeleteTarget] = useState<{ scope: DeleteScope; label: string } | null>(null);
  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selected.has(d.id));
  function toggleSelectAll() {
    setSelected(() => (allFilteredSelected ? new Set<number>() : new Set(filtered.map((d) => d.id))));
  }
  function doBulkArchive(archived: boolean) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startAction(async () => {
      let ok = 0;
      for (const id of ids) {
        const res = await archiveDocumentAction(id, archived);
        if (res.ok) ok++;
      }
      toast(`${ok} document${ok === 1 ? "" : "s"} ${archived ? "archived" : "restored"}`, { tone: "success" });
      exitSelect();
      router.refresh();
    });
  }

  const peekActions = (doc: DocumentRow): PeekAction[] => {
    const a: PeekAction[] = [];
    a.push({ label: "Edit", icon: <Pencil size={16} />, tone: "accent", onClick: () => { setPeek(null); openEditor(doc); } });
    if (doc.companyId) a.push({ label: "Renew", icon: <RefreshCw size={16} />, onClick: () => doRenew(doc) });
    if (doc.storagePath) a.push({ label: "Open file", icon: <Paperclip size={16} />, onClick: () => openStoredFile(doc) });
    else if (doc.fileUrl) a.push({ label: "Open link", icon: <ExternalLink size={16} />, onClick: () => window.open(doc.fileUrl!, "_blank") });
    if (doc.storagePath) a.push({ label: "Split into documents", icon: <Scissors size={16} />, onClick: () => { setPeek(null); setSplitDoc(doc); } });
    a.push(doc.archived
      ? { label: "Restore", icon: <ArchiveRestore size={16} />, onClick: () => doArchive(doc, false) }
      : { label: "Archive", icon: <Archive size={16} />, onClick: () => doArchive(doc, true) });
    a.push({ label: "Delete", icon: <Trash2 size={16} />, tone: "danger", onClick: () => { setPeek(null); setDeleteTarget({ scope: { kind: "ids", ids: [doc.id] }, label: displayDocName(doc) }); } });
    return a;
  };

  const statusBadge = (doc: DocumentRow) => {
    const s = deriveDocStatus(doc);
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", docStatusColor[s])}>{s}</span>;
  };

  // Expiry-timeline buckets — same filtered rows, grouped by how soon they lapse.
  const TIMELINE_BUCKETS = [
    { key: "expired", label: "Expired", tone: "danger" as const, test: (n: number | null) => n !== null && n < 0 },
    { key: "week", label: "Due this week", tone: "danger" as const, test: (n: number | null) => n !== null && n >= 0 && n <= 7 },
    { key: "month", label: "Due this month", tone: "warn" as const, test: (n: number | null) => n !== null && n > 7 && n <= 30 },
    { key: "quarter", label: "Next 90 days", tone: "warn" as const, test: (n: number | null) => n !== null && n > 30 && n <= 90 },
    { key: "later", label: "Later", tone: "default" as const, test: (n: number | null) => n !== null && n > 90 },
    { key: "none", label: "No expiry date", tone: "default" as const, test: (n: number | null) => n === null },
  ];
  const timelineGroups = useMemo(() => {
    return TIMELINE_BUCKETS.map((b) => ({
      ...b,
      rows: filtered.filter((d) => b.test(daysToExpiry(d))),
    })).filter((g) => g.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  // Renewal lineage maps (documents includes archived, so old copies resolve).
  const docById = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents]);
  const replacedByOf = useMemo(() => {
    const m = new Map<number, DocumentRow>();
    for (const d of documents) if (d.supersedesId) m.set(d.supersedesId, d);
    return m;
  }, [documents]);

  function renderRow(doc: DocumentRow, opts: { hideCompany?: boolean; hidePerson?: boolean } = {}) {
    const dte = daysToExpiry(doc);
    const urgent = dte !== null && dte < 0;
    const soon = dte !== null && dte >= 0 && dte <= doc.reminderLeadDays;
    const accent = companyAccent(doc.companyId);
    const openLinkedTask = linkedTasks[doc.id]?.find((t) => t.status !== "Completed" && t.status !== "Closed");
    return (
      <div key={doc.id} role="button" tabIndex={0}
        onClick={() => { if (longPressed.current) { longPressed.current = false; return; } if (selectMode) { toggleSelect(doc.id); return; } openEditor(doc); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectMode ? toggleSelect(doc.id) : openEditor(doc); } }}
        onPointerDown={(e) => { if (!selectMode) onRowPointerDown(doc, e); }}
        onPointerMove={onRowPointerMove}
        onPointerUp={clearPress} onPointerLeave={clearPress} onPointerCancel={clearPress}
        className={cn("flex items-center gap-3 pl-9 pr-3.5 py-2.5 cursor-pointer transition-colors select-none", selected.has(doc.id) ? "bg-accent-soft/40" : "hover:bg-bg-subtle/40", doc.archived && "opacity-60")}>
        {selectMode && (
          <span className={cn("shrink-0 h-5 w-5 rounded-md border inline-flex items-center justify-center transition-colors",
            selected.has(doc.id) ? "bg-accent border-accent text-accent-fg" : "border-border-strong")}>
            {selected.has(doc.id) && <Check size={13} strokeWidth={3} />}
          </span>
        )}
        <span className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: accent || "var(--border)" }} />
        <FileText size={16} className="text-fg-subtle shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-medium">{displayDocName(doc)}</span>
            {(doc.storagePath || doc.fileUrl) && <Paperclip size={12} className="text-fg-subtle shrink-0" />}
            {doc.category && <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-bg-muted text-fg-muted shrink-0">{doc.category}</span>}
            {doc.personId && <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-info-soft text-info shrink-0">Person file</span>}
            {doc.supersedesId && <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-bg-muted text-fg-muted shrink-0" title="Replaces an earlier document">↻ Renewal</span>}
            {confidenceTier(doc.confidence) === "low" && <ConfidenceBadge confidence={doc.confidence} showLabel={false} className="shrink-0" />}
            {openLinkedTask && (
              <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-accent-soft text-accent shrink-0">
                {openLinkedTask.code}
              </span>
            )}
          </div>
          {((!opts.hideCompany && companyName(doc.companyId)) || (!opts.hidePerson && personName(doc.personId))) && (
            <div className="flex items-center gap-2 text-[11px] text-fg-subtle mt-0.5 min-w-0">
              {!opts.hideCompany && companyName(doc.companyId) && <span className="inline-flex items-center gap-1 truncate"><Building2 size={11} />{companyName(doc.companyId)}</span>}
              {!opts.hidePerson && personName(doc.personId) && <span className="inline-flex items-center gap-1 truncate"><UserIcon size={11} />{personName(doc.personId)}</span>}
            </div>
          )}
          {doc.notes && doc.notes.trim() && (
            <div className="text-[11px] text-fg-muted truncate mt-0.5">{doc.notes}</div>
          )}
        </div>
        <div className="text-right shrink-0">
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
  }

  return (
    <div className="space-y-4">
      {/* Search only — the company + category housings below ARE the filter now. */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a document, number, person or company…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50" />
      </div>

      {documents.length > 0 && (
        <div className="flex justify-end -mt-1.5">
          <button type="button" onClick={() => setDeleteTarget({ scope: { kind: "all" }, label: `ALL ${documents.length} documents` })}
            className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle hover:text-danger transition-colors">
            <Trash2 size={12} /> Delete all documents
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl glass-menu ring-1 ring-border/70 px-3 py-2 text-sm">
          <button type="button" onClick={toggleSelectAll} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors">
            <CheckSquare size={14} /> {allFilteredSelected ? "Clear all" : "Select all"}
          </button>
          <span className="text-fg-muted">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-1.5">
            {showArchived && (
              <button type="button" disabled={selected.size === 0} onClick={() => doBulkArchive(false)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:border-accent hover:text-accent disabled:opacity-40 transition-colors">
                <ArchiveRestore size={14} /> Restore
              </button>
            )}
            <button type="button" disabled={selected.size === 0} onClick={() => doBulkArchive(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-muted text-fg-muted ring-1 ring-border hover:text-fg disabled:opacity-40 transition-all">
              <Archive size={14} /> Archive
            </button>
            <button type="button" disabled={selected.size === 0} onClick={() => setDeleteTarget({ scope: { kind: "ids", ids: [...selected] }, label: `${selected.size} selected document${selected.size === 1 ? "" : "s"}` })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-danger-soft/70 text-danger ring-1 ring-danger/25 hover:ring-danger/50 disabled:opacity-40 transition-all">
              <Trash2 size={14} /> Delete
            </button>
            <button type="button" onClick={exitSelect} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-fg-muted hover:text-fg transition-colors">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* List (company housings) / Timeline */}
      {filtered.length > 0 ? (
        view === "list" ? (
          <div className="space-y-2.5">
            {docGroups.map((g) => {
              const collapsed = isCollapsed(g);
              return (
                <section key={g.key} className="overflow-hidden rounded-2xl bg-bg-elev/40 ring-1 ring-border/60">
                  <div className={cn("flex items-center bg-bg-subtle/60", !collapsed && "border-b border-border/60")}>
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(g.key, collapsed)}
                    aria-expanded={!collapsed}
                    className="flex flex-1 min-w-0 items-center gap-2.5 px-3.5 py-2.5 text-left"
                  >
                    <ChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", collapsed && "-rotate-90")} />
                    {g.kind === "company" ? (
                      <CompanyAvatar name={g.name} accent={g.accent} logoUrl={companyLogo(g.companyId)} size={24} rounded="rounded-lg" iconSize={12} />
                    ) : (
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-bg-muted text-fg-subtle">
                        <Users size={12} />
                      </span>
                    )}
                    <span className="truncate text-[12.5px] font-semibold text-fg">{g.name}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[10.5px] text-fg-muted">
                      {g.expired > 0 && (
                        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-danger" /><b className="font-bold text-danger tabular">{g.expired}</b> expired</span>
                      )}
                      {g.expiring > 0 && (
                        <span className="hidden items-center gap-1 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-warn" /><b className="font-bold text-warn tabular">{g.expiring}</b> due soon</span>
                      )}
                      {g.expired === 0 && g.expiring === 0 && (
                        <span className="inline-flex items-center gap-1 text-success"><Check size={11} strokeWidth={3} /> all valid</span>
                      )}
                      <span className="text-fg-subtle">{g.rows.length} doc{g.rows.length === 1 ? "" : "s"}</span>
                    </span>
                  </button>
                  {g.kind === "company" && g.companyId != null && (
                    <button type="button" title="Delete this company's documents"
                      onClick={() => setDeleteTarget({ scope: { kind: "company", companyId: g.companyId! }, label: `all documents for ${g.name}` })}
                      className="mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-subtle hover:bg-danger-soft hover:text-danger transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                  </div>
                  {!collapsed && (
                    <div className="divide-y divide-border/40">
                      {(g.kind === "people"
                        ? groupRowsByPerson(g.rows, personName)
                        : groupRowsByShelf(g.rows).map((sh): SubGroup => ({ key: sh.name, label: sh.name, code: sh.code, rows: sh.rows, expired: sh.expired, expiring: sh.expiring }))
                      ).map((sub) => {
                        const skey = `${g.key}::${sub.key}`;
                        const scol = isCollapsed({ key: skey });
                        return (
                          <div key={skey}>
                            <div className="flex items-center transition-colors hover:bg-bg-subtle/30">
                            <button type="button" onClick={() => toggleGroupCollapse(skey, scol)} aria-expanded={!scol}
                              className="flex flex-1 min-w-0 items-center gap-2 py-2.5 pl-9 pr-3.5 text-left">
                              <ChevronDown size={12} className={cn("shrink-0 text-fg-subtle transition-transform", scol && "-rotate-90")} />
                              {sub.code
                                ? <span className="font-mono text-[10px] text-fg-subtle">{sub.code}</span>
                                : <UserIcon size={12} className="shrink-0 text-fg-subtle" />}
                              <span className="truncate text-xs font-medium text-fg-muted">{sub.label}</span>
                              <span className="ml-auto flex shrink-0 items-center gap-2 text-[10px] text-fg-muted">
                                {sub.expired > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-danger" /><b className="text-danger tabular">{sub.expired}</b></span>}
                                {sub.expiring > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-warn" /><b className="text-warn tabular">{sub.expiring}</b></span>}
                                <span className="tabular">{sub.rows.length}</span>
                              </span>
                            </button>
                            <button type="button" title="Delete these documents"
                              onClick={() => setDeleteTarget({ scope: { kind: "ids", ids: sub.rows.map((r) => r.id) }, label: `${sub.rows.length} document${sub.rows.length === 1 ? "" : "s"} in ${sub.label}` })}
                              className="mr-2.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-danger-soft hover:text-danger transition-colors">
                              <Trash2 size={12} />
                            </button>
                            </div>
                            {!scol && (
                              <div className={cn("divide-y divide-border/40 border-t border-border/30 bg-bg-subtle/20", sub.rows.length > 6 && "scroll-fade-y overflow-y-auto overscroll-contain slim-scroll max-h-[26rem]")}>
                                {sub.rows.map((d) => renderRow(d, g.kind === "people" ? { hidePerson: true } : { hideCompany: true }))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {timelineGroups.map((g) => (
              <RegisterList key={g.key} header={
                <RegisterGroupHeader
                  tone={g.tone === "danger" ? "danger" : g.tone === "warn" ? "warn" : "muted"}
                  action={<CountPill count={g.rows.length} tone={g.tone === "danger" ? "danger" : g.tone === "warn" ? "warn" : "default"} />}
                >
                  {g.label}
                </RegisterGroupHeader>
              }>
                {g.rows.map((d) => renderRow(d))}
              </RegisterList>
            ))}
          </div>
        )
      ) : documents.length === 0 ? (
        <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated text-center py-14 px-6">
          <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-bg-muted/60 flex items-center justify-center text-fg-subtle">
            <FileText size={22} />
          </div>
          <div className="text-sm font-medium">No documents yet</div>
          <div className="text-xs text-fg-muted mt-1 max-w-sm mx-auto">Track licences, contracts, certificates, insurance, leases and visas — with expiry dates and reminders.</div>
          <Button type="button" onClick={() => setCreateOpen(true)} className="mt-5">
            <FilePlus size={15} /> Add your first document
          </Button>
        </div>
      ) : (
        <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated text-center py-12 text-fg-muted text-sm">
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
        onOpen={peek ? () => { const d = peek; setPeek(null); openEditor(d); } : undefined}
        title={peek?.title}
        subtitle={peek ? [companyName(peek.companyId), peek.category, personName(peek.personId)].filter(Boolean).join(" · ") || undefined : undefined}
        pills={peek ? (
          <>
            {statusBadge(peek)}
            {peek.expiryDate && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-bg-muted text-fg-muted">{fmtDate(peek.expiryDate)}{expiryLabel(peek) ? ` · ${expiryLabel(peek)}` : ""}</span>}
          </>
        ) : undefined}
        body={peek && (peek.issuer || peek.referenceNo || peek.notes || (linkedTasks[peek.id]?.length) || peek.supersedesId || replacedByOf.has(peek.id)) ? (
          <div className="space-y-1 text-[13px] text-fg-muted">
            {peek.issuer && <div><span className="text-fg-subtle">Issuer:</span> {peek.issuer}</div>}
            {peek.referenceNo && <div><span className="text-fg-subtle">Ref:</span> {peek.referenceNo}</div>}
            {peek.supersedesId && docById.get(peek.supersedesId) && (
              <div><span className="text-fg-subtle">Replaces:</span> {docById.get(peek.supersedesId)!.title} <span className="text-fg-subtle">(archived)</span></div>
            )}
            {replacedByOf.get(peek.id) && (
              <div><span className="text-fg-subtle">Replaced by:</span> {replacedByOf.get(peek.id)!.title}</div>
            )}
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

      {/* Automatic bulk intake — drop all, AI files them, review only exceptions. */}

      <DocDialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) closeCreate(); }} title="Add a document">
        <DocumentForm mode="create" companies={companies} people={people} initialExtractText={prefillText}
          initialPersonId={prefillPersonId} initialCompanyId={prefillCompanyId} initialCategory={prefillCategory} initialTitle={prefillTitle} initialVendorId={prefillVendorId} initialSupersedesId={prefillSupersedeId}
          onCancel={() => { setCreateOpen(false); closeCreate(); }}
          onComplete={(res) => { if (res.ok) { toast("Document added.", { tone: "success" }); setCreateOpen(false); closeCreate(); } }} />
      </DocDialog>


      {/* Split a multi-document file into separate records (sharing the file). */}
      {splitDoc && (
        <SplitDocumentDialog
          documentId={splitDoc.id}
          fileName={splitDoc.fileName}
          open={!!splitDoc}
          onOpenChange={(o) => { if (!o) setSplitDoc(null); }}
          onDone={() => router.refresh()}
        />
      )}

      {/* Delete flow (per document / category / company / all) — Trash or permanent. */}
      <DeleteDocsDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDone={(mode, count) => {
          setDeleteTarget(null);
          exitSelect();
          toast(`${count} document${count === 1 ? "" : "s"} ${mode === "permanent" ? "permanently deleted" : "moved to Trash"}`, { tone: "success" });
          router.refresh();
        }}
      />
    </div>
  );
}

function DeleteDocsDialog({ target, onClose, onDone }: {
  target: { scope: DeleteScope; label: string } | null;
  onClose: () => void;
  onDone: (mode: "trash" | "permanent", count: number) => void;
}) {
  const [busy, setBusy] = useState<"trash" | "permanent" | null>(null);
  const [confirmPermanent, setConfirmPermanent] = useState(false);
  useEffect(() => { if (target) setConfirmPermanent(false); }, [target]);
  if (!target) return null;
  const run = async (mode: "trash" | "permanent") => {
    setBusy(mode);
    const res = await deleteDocumentsAction(target.scope, mode);
    setBusy(null);
    if (res.ok) onDone(mode, res.count);
  };
  return (
    <HrmsDialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }} width={460} title={`Delete ${target.label}`}>
      <div className="space-y-4 p-1">
        <p className="text-sm text-fg-muted">Choose how to delete <b className="text-fg">{target.label}</b>.</p>
        <button type="button" disabled={!!busy} onClick={() => run("trash")}
          className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left hover:border-accent hover:bg-accent-soft/30 disabled:opacity-50 transition-colors">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg-muted text-fg-muted">{busy === "trash" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</span>
          <span><span className="block text-sm font-medium">Move to Trash</span><span className="block text-xs text-fg-muted">Recoverable — restore any time from the Trash tab.</span></span>
        </button>
        {!confirmPermanent ? (
          <button type="button" disabled={!!busy} onClick={() => setConfirmPermanent(true)}
            className="flex w-full items-start gap-3 rounded-xl border border-danger/30 p-3 text-left hover:bg-danger-soft/40 disabled:opacity-50 transition-colors">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger"><AlertTriangle size={16} /></span>
            <span><span className="block text-sm font-medium text-danger">Delete permanently</span><span className="block text-xs text-fg-muted">Removes the file, its search index and record everywhere. Cannot be undone.</span></span>
          </button>
        ) : (
          <div className="rounded-xl border border-danger/40 bg-danger-soft/30 p-3 space-y-2.5">
            <p className="text-xs text-danger flex items-center gap-1.5"><AlertTriangle size={14} /> This can't be undone. Make sure you have a backup.</p>
            <div className="flex gap-2">
              <button type="button" disabled={!!busy} onClick={() => run("permanent")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy === "permanent" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Yes, delete permanently
              </button>
              <button type="button" disabled={!!busy} onClick={() => setConfirmPermanent(false)} className="rounded-lg px-3 py-1.5 text-xs text-fg-muted hover:text-fg">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </HrmsDialog>
  );
}

function DocDialog({ open, onOpenChange, title, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode;
}) {
  return (
    <HrmsDialog open={open} onOpenChange={onOpenChange} width={860} title={title}>
      {children}
    </HrmsDialog>
  );
}
