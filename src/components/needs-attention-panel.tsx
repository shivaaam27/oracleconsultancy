"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Clock, FileWarning, ListTodo, RefreshCw, Plus, ChevronDown,
  Building2, User as UserIcon, ExternalLink, Loader2, MessageSquarePlus, CalendarClock, Mail, Upload,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CountPill } from "./ui";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import {
  deriveDocStatus, daysToExpiry, expiryLabel, displayDocName, type DocumentRow,
} from "@/lib/documents-shared";
import type { ComplianceScore } from "@/lib/compliance";
import { renewDocumentAction, draftDocumentRenewalAction, sendDocumentRenewalNoticeAction } from "@/app/documents/actions";

type Kind = "expired" | "expiring";
type Filter = "all" | Kind;

type Item = {
  key: string;
  kind: Kind;
  title: string;
  ownerName: string | null;
  ownerType: "company" | "person" | null;
  accent: string | null;
  /** Sort weight — smaller = more urgent. */
  rank: number;
  caption: string | null;
  // For expiry items:
  docId?: number;
  canRenew?: boolean;
  companyId?: number | null;
  personId?: number | null;
  category?: string | null;
  // For missing items:
  addHref?: string;
  viewHref?: string;
};

/* Deep-link to the pre-filled create dialog (mirrors the compliance panel). */
function categoryForRequirement(label: string) {
  const l = label.toLowerCase();
  if (l.includes("passport")) return "Passport";
  if (l.includes("permit") || l.includes("visa") || l.includes("immigration")) return "Immigration";
  if (l.includes("contract") || l.includes("engagement")) return "Contract";
  if (l.includes("tax") || l.includes("tin")) return "Tax";
  if (l.includes("licence") || l.includes("license")) return "Licence";
  if (l.includes("registration")) return "Registration";
  return undefined;
}
function addHrefFor(score: ComplianceScore, gap: ComplianceScore["gaps"][number]) {
  const params = new URLSearchParams({ newdoc: "1", title: gap.label });
  if (score.ownerType === "company") params.set("company", String(score.ownerId));
  else params.set("person", String(score.ownerId));
  // Carry the requirement's own category so the saved document auto-links straight
  // back to this gap. Fall back to a keyword guess only when the gap has none.
  const cat = gap.categories?.[0] ?? categoryForRequirement(gap.label);
  if (cat) params.set("category", cat);
  return `/documents?${params.toString()}`;
}

/** Replace flow: ask the documents table (same page) to open Add-document pre-filled
 *  with the same owner + category and a supersede marker, so saving the new copy
 *  retires the old one (-EXP → Trash). A window event — not a URL param — so it never
 *  trips the global ?company= drawer. */
function fireReplace(item: Item) {
  window.dispatchEvent(new CustomEvent("cos:new-document", {
    detail: { companyId: item.companyId ?? null, personId: item.personId ?? null, category: item.category ?? null, supersedeId: item.docId ?? null },
  }));
}

const KIND_META: Record<Kind, { label: string; icon: typeof AlertTriangle; text: string; bg: string; ring: string }> = {
  expired: { label: "Expired", icon: AlertTriangle, text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/25" },
  expiring: { label: "Expiring", icon: Clock, text: "text-warn", bg: "bg-warn-soft/60", ring: "ring-warn/25" },
};

const INITIAL = 8;

export function NeedsAttentionPanel({
  documents,
  companies,
  people,
  companyScores,
  personScores,
  pendingLeaveCount = 0,
}: {
  documents: DocumentRow[];
  companies: Array<{ id: number; name: string; accentColor?: string | null }>;
  people: Array<{ id: number; name: string }>;
  companyScores: ComplianceScore[];
  personScores: ComplianceScore[];
  /** Pending leave requests awaiting a decision — surfaces a "Leave to approve" tile. */
  pendingLeaveCount?: number;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [draftBusyId, setDraftBusyId] = useState<number | null>(null);
  const [noticeBusyId, setNoticeBusyId] = useState<number | null>(null);
  const [, startAction] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [coFilter, setCoFilter] = useState<number | "all">("all");
  const [peFilter, setPeFilter] = useState<number | "all">("all");
  const [expanded, setExpanded] = useState(false);

  const companyName = (id: number | null) => companies.find((c) => c.id === id)?.name ?? null;
  const companyAccent = (id: number | null) => companies.find((c) => c.id === id)?.accentColor ?? null;
  const personName = (id: number | null) => people.find((p) => p.id === id)?.name ?? null;

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    // Expiry items, straight from the documents (most complete source).
    for (const d of documents) {
      if (d.archived) continue;
      const status = deriveDocStatus(d);
      if (status !== "Expired" && status !== "Expiring") continue;
      const dte = daysToExpiry(d) ?? 0;
      const ownerName = companyName(d.companyId) ?? personName(d.personId);
      out.push({
        key: `doc-${d.id}`,
        kind: status === "Expired" ? "expired" : "expiring",
        title: displayDocName(d),
        ownerName,
        ownerType: d.companyId ? "company" : d.personId ? "person" : null,
        accent: companyAccent(d.companyId),
        // Expired: most overdue first (dte most negative). Expiring: soonest first.
        rank: status === "Expired" ? -100000 + dte : dte,
        caption: expiryLabel(d),
        docId: d.id,
        canRenew: !!d.companyId,
        companyId: d.companyId,
        personId: d.personId,
        category: d.category,
        viewHref: d.companyId ? `/documents?company=${d.companyId}` : d.personId ? `/people?person=${d.personId}` : undefined,
      });
    }

    // Expiry ONLY — worst-first. Missing/incomplete required documents are a
    // compliance-COMPLETENESS concern (shown per company on the compliance cards),
    // not an urgent expiry to-do; mixing them made this list read "370" when only a
    // handful of documents were actually expiring.
    out.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  const counts = useMemo(() => ({
    all: items.length,
    expired: items.filter((i) => i.kind === "expired").length,
    expiring: items.filter((i) => i.kind === "expiring").length,
  }), [items]);

  const filtered = items.filter((i) =>
    (filter === "all" || i.kind === filter) &&
    (coFilter === "all" || i.companyId === coFilter) &&
    (peFilter === "all" || i.personId === peFilter),
  );
  const shown = expanded ? filtered : filtered.slice(0, INITIAL);

  function doRenew(docId: number) {
    setBusyId(docId);
    startAction(async () => {
      const res = await renewDocumentAction(docId);
      setBusyId(null);
      toast(res.ok ? `Renewal task ${res.code} created` : res.error, { tone: res.ok ? "success" : "warn", duration: 4500 });
      if (res.ok) router.refresh();
    });
  }

  function doDraft(docId: number) {
    setDraftBusyId(docId);
    startAction(async () => {
      const res = await draftDocumentRenewalAction(docId);
      setDraftBusyId(null);
      toast(
        res.ok ? (res.created ? "Renewal message drafted in Outbox" : "A renewal draft already exists in Outbox") : res.error,
        { tone: res.ok ? "success" : "warn", duration: 4500 }
      );
    });
  }

  function doSendNotice(docId: number) {
    setNoticeBusyId(docId);
    startAction(async () => {
      const res = await sendDocumentRenewalNoticeAction(docId);
      setNoticeBusyId(null);
      const msg = res.ok
        ? "Renewal notice emailed"
        : res.reason === "no-recipient" ? "No email on file for the person/company"
        : res.reason === "not-configured" ? "Email sending isn't switched on"
        : res.error || "Couldn't send the notice";
      toast(msg, { tone: res.ok ? "success" : "warn", duration: 4500 });
    });
  }

  // A standalone tile for pending leave requests, shown above the document rows
  // (and on its own when there's nothing else). Reads the count; the approver
  // notification itself is fired elsewhere.
  const leaveTile = pendingLeaveCount > 0 ? (
    <Link
      href="/hrms/leave"
      className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-bg-muted/40"
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft/60 text-accent ring-1 ring-accent/25">
        <CalendarClock size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">Leave to approve</div>
        <div className="mt-0.5 text-[11px] text-fg-subtle">
          {pendingLeaveCount} request{pendingLeaveCount === 1 ? "" : "s"} waiting for a decision
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent">
        Review <ExternalLink size={13} />
      </span>
    </Link>
  ) : null;

  // Nothing to do — a calm, reassuring state. (Still show the leave tile if any.)
  if (items.length === 0) {
    if (leaveTile) {
      return (
        <section className="glass elevated overflow-hidden rounded-3xl">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-semibold">
            <ListTodo size={16} className="text-accent" /> Needs attention
            <CountPill count={pendingLeaveCount} />
          </div>
          <div className="divide-y divide-border/40">{leaveTile}</div>
        </section>
      );
    }
    return (
      <section className="glass elevated flex items-center gap-3 rounded-3xl px-4 py-3.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-success-soft/60 text-success ring-1 ring-success/20">
          <ListTodo size={17} />
        </span>
        <div>
          <div className="text-sm font-semibold">Nothing expiring</div>
          <div className="text-xs text-fg-muted">No expired or soon-to-expire documents to act on.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="glass elevated relative overflow-hidden rounded-3xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 right-10 h-44 w-72 rounded-full opacity-20 blur-3xl"
        style={{ background: `radial-gradient(circle, hsl(var(--${counts.expired ? "danger" : counts.expiring ? "warn" : "accent"})), transparent 70%)` }}
      />
      <div className="relative flex flex-col gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock size={16} className="text-accent" /> Expiry watch
            <CountPill count={counts.all} />
          </div>
          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {([
              { key: "all" as Filter, label: "All", n: counts.all, t: "accent" },
              { key: "expired" as Filter, label: "Expired", n: counts.expired, t: "danger" },
              { key: "expiring" as Filter, label: "Due soon", n: counts.expiring, t: "warn" },
            ]).map(({ key, label, n, t }) => {
              const active = filter === key;
              const tint = active
                ? t === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
                  : t === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
                  : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
                : n === 0 ? "bg-bg-subtle/40 ring-1 ring-border/50 text-fg-subtle"
                : "bg-bg-subtle/60 ring-1 ring-border/50 text-fg-muted hover:ring-2 hover:ring-border";
              return (
                <button key={key} type="button" onClick={() => { setFilter(active && key !== "all" ? "all" : key); setExpanded(false); }}
                  className={cn("inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-xs backdrop-blur-md transition-all", tint)}>
                  <CountPill count={n} tone={t === "danger" ? "danger" : t === "accent" ? "accent" : "default"} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Company + People filters — expiry hits both. On mobile these sit BELOW
            the chips (their own row) so nothing crams. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FluidSelect
            value={coFilter === "all" ? "all" : String(coFilter)}
            onSelect={(v) => setCoFilter(v === "all" ? "all" : parseInt(v, 10))}
            options={[{ value: "all", label: "All companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
            buttonClassName="rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium"
          />
          <FluidSelect
            value={peFilter === "all" ? "all" : String(peFilter)}
            onSelect={(v) => setPeFilter(v === "all" ? "all" : parseInt(v, 10))}
            options={[{ value: "all", label: "All people" }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]}
            buttonClassName="rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium"
          />
        </div>
      </div>

      <div className="relative divide-y divide-border/40">
        {/* Pending leave sits above the document rows; only on the "All" filter. */}
        {filter === "all" && leaveTile}
        {shown.map((item) => {
          return (
            <div key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: item.accent ?? (item.kind === "expired" ? "hsl(var(--danger))" : "hsl(var(--warn))") }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                  {item.ownerName && (
                    <span className="inline-flex items-center gap-1 truncate">
                      {item.ownerType === "company" ? <Building2 size={11} /> : <UserIcon size={11} />}
                      {item.ownerName}
                    </span>
                  )}
                  {item.caption && (
                    <span className={cn(item.kind === "expired" ? "text-danger" : item.kind === "expiring" ? "text-warn" : "text-fg-subtle")}>
                      {item.caption}
                    </span>
                  )}
                </div>
              </div>
              {/* Inline actions — for the owner's OWN documents: Open the record,
                  or Renew (make a renewal task). "Replace" (upload new → old ·EXP)
                  arrives with the Phase-2 upload flow. */}
              {item.docId ? (
                <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
                  <button type="button" onClick={() => router.push(`/documents?doc=${item.docId}`)}
                    title="Open this document"
                    className="inline-flex items-center gap-1 rounded-lg bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted">
                    <ExternalLink size={13} /> Open
                  </button>
                  <button type="button" onClick={() => fireReplace(item)}
                    title="Upload the new copy — the old one is tagged -EXP and kept in history"
                    className="inline-flex items-center gap-1 rounded-lg bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted">
                    <Upload size={13} /> Replace
                  </button>
                  {item.canRenew && (
                    <button type="button" disabled={busyId === item.docId} onClick={() => doRenew(item.docId!)}
                      title="Create a renewal task"
                      className="inline-flex items-center gap-1 rounded-lg bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted disabled:opacity-50">
                      {busyId === item.docId ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Renew
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {filtered.length > INITIAL && (
        <button type="button" onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border/50 py-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted/40">
          {expanded ? "Show less" : `Show all ${filtered.length}`}
          <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </section>
  );
}
