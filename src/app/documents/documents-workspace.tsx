"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Inbox as InboxIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { deriveDocStatus, type DocumentRow } from "@/lib/documents-shared";
import type { ComplianceScore } from "@/lib/compliance";
import type { InboxItem } from "@/app/inbox/actions";
import type { IntakeBucketItem } from "@/app/documents/actions";
import type { SortItem } from "@/lib/sorting-desk";
import type { SystemHealth } from "@/lib/system-health";
import type { Finding } from "@/lib/safety-net-shared";
import type { IntakeMetrics } from "@/lib/intake-metrics";
import type { AutomationFeedItem } from "@/app/automations/actions";

import { ComplianceCards } from "@/components/compliance-cards";
import { NeedsAttentionPanel } from "@/components/needs-attention-panel";
import { DocumentsTable } from "@/components/documents-table";
import { ToSortPanel } from "@/components/to-sort-panel";
import { TrashList } from "@/app/inbox/intake-shell";
import { SystemStatusCard } from "@/components/system-status-card";
import { DocumentForm } from "@/components/document-form";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { getDocumentRowAction } from "@/app/documents/actions";

type Tab = "library" | "sort" | "trash";

type Company = { id: number; name: string; accentColor?: string | null; aliases?: string[]; logoUrl?: string | null };

export function DocumentsWorkspace({
  documents,
  companies,
  people,
  linkedTasks,
  companyScores,
  personScores,
  untrackedCompanies,
  pendingLeave,
  inboxItems,
  sortItems,
  trash,
  automation,
  health,
  safetyFindings,
  intakeMetrics,
}: {
  documents: DocumentRow[];
  companies: Company[];
  people: Array<{ id: number; name: string; personType?: string }>;
  linkedTasks: Record<number, Array<{ code: string; status: string }>>;
  companyScores: ComplianceScore[];
  personScores: ComplianceScore[];
  untrackedCompanies: Array<{ id: number; name: string; docCount: number }>;
  pendingLeave: number;
  inboxItems: InboxItem[];
  sortItems: SortItem[];
  trash: IntakeBucketItem[];
  // The status panels below are only shown on the To Sort tab, so the server
  // fetches them only then; null on the Library/Trash tabs keeps that load light.
  automation: { applied: AutomationFeedItem[]; suggestions: AutomationFeedItem[] } | null;
  health: SystemHealth | null;
  safetyFindings: Finding[] | null;
  intakeMetrics: IntakeMetrics | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = ((): Tab => {
    const t = searchParams.get("tab");
    return t === "sort" || t === "trash" ? t : "library";
  })();
  const [tab, setTab] = useState<Tab>(initial);
  // "Fix details" opens the editor IN PLACE (a dialog over the current tab) —
  // no jump to Library, no second mount. The doc is fetched on demand.
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
  const toSort = sortItems.length + inboxItems.length;

  const compliance = useMemo(() => {
    const portfolio = companyScores.length
      ? Math.round(companyScores.reduce((s, c) => s + c.score, 0) / companyScores.length)
      : 100;
    const atRisk = companyScores.filter((c) => c.status !== "Good").length;
    return { portfolio, atRisk };
  }, [companyScores]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof FileText; n?: number; tone?: "danger" | "violet" }> = [
    { id: "library", label: "Library", icon: FileText },
    { id: "sort", label: "To Sort", icon: InboxIcon, n: toSort, tone: "violet" },
    { id: "trash", label: "Trash", icon: Trash2, n: trash.length },
  ];

  function switchTab(t: Tab) {
    setTab(t);
    // Keep the URL honest (so a refresh / share lands on the same tab) without a reload.
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (t === "library") sp.delete("tab"); else sp.set("tab", t);
    router.replace(sp.toString() ? `/documents?${sp}` : "/documents", { scroll: false });
  }

  // "Fix details" on a Sorting-Desk card → open the editor IN PLACE (a dialog over
  // the To Sort tab). No tab switch, no ?doc= round-trip — just fetch + open.
  useEffect(() => {
    let cancelled = false;
    async function onEdit(e: Event) {
      const detail = (e as CustomEvent<{ id?: number; doc?: DocumentRow }>).detail;
      const id = detail?.id;
      if (!id) return;
      // A Library row hands us the full doc → open instantly. Sort/deep-links pass
      // only the id (the quarantined doc isn't in the library list) → fetch it.
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
          {/* KPI pill — glance stats only; compliance lives in its own section below. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-fg-muted sm:ml-auto">
            <span><b className="tabular text-base text-fg">{stats.docs}</b> documents</span>
            {stats.expired > 0 && <span className="text-danger"><b className="tabular text-base">{stats.expired}</b> expired</span>}
            {stats.expiring > 0 && <span className="text-warn"><b className="tabular text-base">{stats.expiring}</b> due soon</span>}
            {toSort > 0 && <span className="text-[#a78bfa]"><b className="tabular text-base">{toSort}</b> to sort</span>}
          </div>
        </div>
      </section>

      {/* Tab segment — sits BELOW the hero card, its own row. */}
      <div className="flex justify-center sm:justify-start">
        <div className="inline-flex rounded-full bg-bg-subtle/70 p-1 ring-1 ring-border/60">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active ? "bg-accent text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg",
                )}
              >
                <Icon size={13} /> {t.label}
                {t.n ? (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular",
                      active ? "bg-accent-fg/20 text-accent-fg"
                        : t.tone === "violet" ? "bg-[#a78bfa]/20 text-[#b9a5fb]"
                        : "bg-bg-muted text-fg-muted",
                    )}
                  >
                    {t.n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Library ──────────────────────────────────────────────── */}
      {tab === "library" && (
        <div className="space-y-4">
          <ComplianceCards companyScores={companyScores} companies={companies} untracked={untrackedCompanies} />
          <NeedsAttentionPanel
            documents={documents}
            companies={companies}
            people={people}
            companyScores={companyScores}
            personScores={personScores}
            pendingLeaveCount={pendingLeave}
          />
          <DocumentsTable documents={documents} companies={companies} people={people} linkedTasks={linkedTasks} />
        </div>
      )}

      {/* ── To Sort ──────────────────────────────────────────────── */}
      {tab === "sort" && (
        <div className="space-y-4">
          <ToSortPanel
            sortItems={sortItems}
            inboxItems={inboxItems}
            companies={companies}
            people={people}
            intakeMetrics={intakeMetrics}
          />
          {health && safetyFindings && <SystemStatusCard health={health} findings={safetyFindings} />}
        </div>
      )}

      {/* ── Trash ────────────────────────────────────────────────── */}
      {tab === "trash" && (
        <div className="space-y-3">
          <p className="px-1 text-xs text-fg-subtle">
            Superseded copies (a document replaced by a newer one, tagged <b>-EXP</b>) and exact duplicates land here.
            Nothing is deleted automatically — restore anything, or empty when you&apos;re sure.
          </p>
          <TrashList items={trash} />
        </div>
      )}

      {/* ── Inline "Fix details" editor — opens over the current tab ─── */}
      <HrmsDialog
        open={!!editDoc}
        onOpenChange={(o) => { if (!o) setEditDoc(null); }}
        width={860}
        title="Fix document details"
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
