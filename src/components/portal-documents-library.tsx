"use client";

import { useMemo, useState } from "react";
import { Search, FileText, ExternalLink, Building2, User, CalendarClock, FolderOpen } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { CaretInput } from "@/components/ui";
import { DOC_CATEGORIES } from "@/lib/documents-shared";
import type { PortalDocRow } from "@/lib/portal-documents";
import { cn } from "@/lib/cn";

/* Read-only company document library for the portal (managers + directors).
 * Search + category filter + grouped-by-category list; each row opens the file
 * via the scoped /api/portal/document route (preview/download in a new tab). */

const CAT_ORDER = new Map(DOC_CATEGORIES.map((c, i) => [c as string, i]));

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PortalDocumentsLibrary({ docs }: { docs: PortalDocRow[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  // Category chips present in the data (in the canonical order), with counts.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of docs) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => (CAT_ORDER.get(a[0]) ?? 99) - (CAT_ORDER.get(b[0]) ?? 99));
  }, [docs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (cat !== "all" && d.category !== cat) return false;
      if (needle) {
        const hay = `${d.title} ${d.docType ?? ""} ${d.companyName ?? ""} ${d.personName ?? ""} ${d.category}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [docs, q, cat]);

  // Group filtered docs by category (canonical order).
  const groups = useMemo(() => {
    const byCat = new Map<string, PortalDocRow[]>();
    for (const d of filtered) (byCat.get(d.category) ?? byCat.set(d.category, []).get(d.category)!).push(d);
    return [...byCat.entries()].sort((a, b) => (CAT_ORDER.get(a[0]) ?? 99) - (CAT_ORDER.get(b[0]) ?? 99));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search + category filter */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5 rounded-2xl bg-bg-elev px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
          <Search size={16} className="shrink-0 text-fg-subtle" />
          <CaretInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents, companies, people…" className="py-3 text-sm" />
        </div>
        {categories.length > 1 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip label="All" n={docs.length} active={cat === "all"} onClick={() => setCat("all")} />
            {categories.map(([c, n]) => (
              <Chip key={c} label={c} n={n} active={cat === c} onClick={() => setCat(c)} />
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-bg-elev p-5 text-sm text-fg-muted ring-1 ring-border">
          <FolderOpen size={16} className="text-fg-subtle" />
          {docs.length === 0 ? "No documents in your companies yet." : "No documents match. Try a different search or category."}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([category, rows]) => (
            <div key={category} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <FileText size={15} className="text-accent" />
                <span className="text-[15px] font-semibold text-fg">{category}</span>
                <span className="rounded-md bg-bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle">{rows.length}</span>
              </div>
              <Panel className="overflow-hidden p-0">
                <ul className="divide-y divide-border/50">
                  {rows.map((d) => <DocRow key={d.id} d={d} />)}
                </ul>
              </Panel>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, n, active, onClick }: { label: string; n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2 text-[12.5px] ring-1 transition-[background-color,box-shadow,transform] active:scale-95",
        active ? "bg-accent text-accent-fg ring-transparent" : "bg-bg-elev text-fg-muted ring-border hover:text-fg",
      )}
    >
      <span className={cn("text-[15px] font-semibold leading-none tabular", active ? "" : "text-accent")}>{n}</span>
      {label}
    </button>
  );
}

function DocRow({ d }: { d: PortalDocRow }) {
  const expiry = fmtDate(d.expiry);
  const expired = d.expiry ? new Date(d.expiry).getTime() < Date.now() : false;
  const owner = d.personName ?? d.companyName;
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-subtle text-fg-muted">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-fg">{d.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-fg-subtle">
          {d.docType && <span>{d.docType}</span>}
          {owner && (
            <span className="inline-flex items-center gap-1">
              {d.personName ? <User size={11} /> : <Building2 size={11} />}{owner}
            </span>
          )}
          {expiry && (
            <span className={cn("inline-flex items-center gap-1", expired ? "text-danger" : "")}>
              <CalendarClock size={11} /> {expired ? "Expired" : "Expires"} {expiry}
            </span>
          )}
          {d.reviewStatus === "needs_review" && <span className="text-warn">Needs review</span>}
        </p>
      </div>
      {d.openable ? (
        <a
          href={`/api/portal/document?documentId=${d.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent ring-1 ring-accent/25 transition-colors hover:bg-accent-soft/70"
        >
          Open <ExternalLink size={13} />
        </a>
      ) : (
        <span className="shrink-0 text-[11px] italic text-fg-subtle">No file</span>
      )}
    </li>
  );
}
