"use client";

import { useMemo } from "react";
import { Search, ExternalLink, Building2, User, FolderOpen } from "lucide-react";
import { RecordList } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { useUrlFilters } from "@/lib/use-url-filters";
import { DOC_CATEGORIES, deriveDocStatus, docStatusColor, type DocStatus } from "@/lib/documents-shared";
import type { PortalDocRow } from "@/lib/portal-documents";
import { cn } from "@/lib/cn";

/* Read-only company document library for the portal (managers + directors).
 *
 * It is the SHARED RecordList now, on the SHARED document columns
 * (ENTITY_VIEWS.document), so a document is described here exactly as it is on
 * the admin Documents page — Document, Category, Expires, Status. It used to be
 * a hand-built stack of cards with its own search box, its own chips and its own
 * row, which is why the company page still read as a different product.
 *
 * What that inherits, for nothing: sortable column headers, the filter rail with
 * counts (a scrolling strip on a phone), the column chooser, CSV export, j/k
 * keyboard movement and the "N of M shown" footer.
 *
 * ⚠️ NOT saved views. Those live behind `/api/prefs/list-views`, which sits
 * inside the owner-only gate in src/proxy.ts — a staff browser asking for it is
 * bounced to the login screen. Giving the portal saved views is a separate job
 * (a portal-side route, and a decision about whether staff should have them);
 * this deliberately does not fake it. RecordList does not fetch them on its own,
 * so passing `listKey` here is safe: the chooser and the export are both
 * client-side (localStorage / an in-browser CSV).
 *
 * Everything stays READ-ONLY: the one row action opens the file through the
 * scoped /api/portal/document route. Nothing edits, archives or deletes.
 */

const CAT_ORDER = new Map(DOC_CATEGORIES.map((c, i) => [c as string, i]));
const DOC_COLUMNS = ENTITY_VIEWS.document!.listColumns;

/** The row shape RecordList sorts and renders. */
type Row = PortalDocRow & Record<string, unknown> & { status: DocStatus; expiryDate: string | null };

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PortalDocumentsLibrary({ docs }: { docs: PortalDocRow[] }) {
  /* Filters live in the URL, not in component state — the rule every converted
   * list follows (see lib/use-url-filters.ts). It also means a rail entry is a
   * real link, and a filtered list can be sent to somebody. `d` prefixes keep
   * these clear of anything else on the company page. */
  const { values, set, hrefFor } = useUrlFilters(
    { dq: "", dcat: "all", dsort: "category", ddir: "asc" },
    { debounceKeys: ["dq"] },
  );
  const { dq, dcat, dsort, ddir } = values;

  // Status is derived here, exactly as the admin derives it, so "Expiring" means
  // the same thing on both sides.
  const rows0 = useMemo<Row[]>(
    () =>
      docs.map((d) => ({
        ...d,
        expiryDate: d.expiry,
        status: deriveDocStatus({
          expiryDate: d.expiry ? new Date(d.expiry) : null,
          category: d.category,
          docType: d.docType,
          archived: false,
          reminderLeadDays: null,
        }),
      })),
    [docs],
  );

  const searched = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    if (!needle) return rows0;
    return rows0.filter((d) =>
      `${d.title} ${d.docType ?? ""} ${d.companyName ?? ""} ${d.personName ?? ""} ${d.category}`
        .toLowerCase()
        .includes(needle),
    );
  }, [rows0, dq]);

  const rows = useMemo(() => {
    const inCat = dcat === "all" ? searched : searched.filter((d) => d.category === dcat);
    const dir = ddir === "desc" ? -1 : 1;
    const val = (d: Row): string | number => {
      if (dsort === "expiryDate") return d.expiry ? new Date(d.expiry).getTime() : Number.MAX_SAFE_INTEGER;
      if (dsort === "status") return d.status;
      if (dsort === "category") return CAT_ORDER.get(d.category) ?? 99;
      return d.title.toLowerCase();
    };
    return [...inCat].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // Inside a category, the paper that runs out first comes first.
      const ae = a.expiry ? new Date(a.expiry).getTime() : Number.MAX_SAFE_INTEGER;
      const be = b.expiry ? new Date(b.expiry).getTime() : Number.MAX_SAFE_INTEGER;
      return ae - be;
    });
  }, [searched, dcat, dsort, ddir]);

  /* The rail: one entry per category present, in the canonical order, counted
   * AFTER the search so the numbers describe what you are actually looking at. */
  const filters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of searched) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
    const cats = [...counts.entries()].sort((a, b) => (CAT_ORDER.get(a[0]) ?? 99) - (CAT_ORDER.get(b[0]) ?? 99));
    return [
      { key: "all", label: "All", count: searched.length, href: hrefFor({ dcat: "all" }), active: dcat === "all" },
      ...cats.map(([c, n]) => ({ key: c, label: c, count: n, href: hrefFor({ dcat: c }), active: dcat === c })),
    ];
  }, [searched, dcat, hrefFor]);

  // Clicking a header sorts by it; clicking the one already sorted flips it.
  const sortHrefs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of DOC_COLUMNS) {
      out[c.key] = hrefFor({ dsort: c.key, ddir: dsort === c.key && ddir === "asc" ? "desc" : "asc" });
    }
    return out;
  }, [hrefFor, dsort, ddir]);

  const columns = buildColumns<Row>(DOC_COLUMNS, {
    sortHrefs,
    sortedBy: { key: dsort, dir: ddir === "desc" ? "desc" : "asc" },
    overrides: {
      title: (d) => <span className="block truncate text-base font-medium text-fg">{d.title}</span>,
      expiryDate: (d) => {
        const label = fmtDate(d.expiry);
        if (!label) return <span className="text-sm text-fg-subtle">—</span>;
        return (
          <span className={cn("text-sm", d.status === "Expired" ? "font-medium text-danger" : d.status === "Expiring" ? "text-warn" : "text-fg-muted")}>
            {label}
          </span>
        );
      },
      status: (d) => (
        <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium", docStatusColor[d.status])}>
          {d.status}
        </span>
      ),
    },
  });

  return (
    <RecordList<Row>
      rows={rows}
      rowKey={(d) => d.id}
      listKey="portal-document"
      total={docs.length}
      shown={rows.length}
      filters={filters}
      columns={columns}
      /* Category bands only while the list IS in category order. Sort by expiry
       * or by name and the bands would repeat down the page, which reads as a
       * broken list rather than a sorted one — so it goes flat instead. */
      groupOf={dsort === "category" ? (d) => d.category : undefined}
      subRow={(d) => (
        <span className="flex min-w-0 items-center gap-x-2 text-xs text-fg-muted">
          {d.docType && <span className="shrink-0">{d.docType}</span>}
          {(d.personName ?? d.companyName) && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              {d.personName ? <User size={11} className="shrink-0" /> : <Building2 size={11} className="shrink-0" />}
              {d.personName ?? d.companyName}
            </span>
          )}
        </span>
      )}
      rowActions={(d) =>
        d.openable ? (
          <a
            href={`/api/portal/document?documentId=${d.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:underline"
          >
            Open <ExternalLink size={12} />
          </a>
        ) : (
          <span className="px-2 text-xs italic text-fg-subtle">No file</span>
        )
      }
      toolbar={
        <label className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-[15rem]">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            defaultValue={dq}
            onChange={(e) => set({ dq: e.target.value })}
            placeholder="Search documents, people…"
            aria-label="Search documents, companies, people"
            className="h-8 w-full rounded-md border border-border bg-bg pl-7 pr-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
          />
        </label>
      }
      empty={
        <span className="flex items-center justify-center gap-2 text-sm text-fg-muted">
          <FolderOpen size={14} className="text-fg-subtle" />
          {docs.length === 0 ? "No documents in your companies yet." : "No documents match. Try a different search or category."}
        </span>
      }
    />
  );
}
