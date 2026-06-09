"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Clock, FileWarning, ListTodo, RefreshCw, Plus, ChevronDown,
  Building2, User as UserIcon, ExternalLink, Loader2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "./toast";
import {
  deriveDocStatus, daysToExpiry, expiryLabel, type DocumentRow,
} from "@/lib/documents-shared";
import type { ComplianceScore } from "@/lib/compliance";
import { renewDocumentAction } from "@/app/documents/actions";

type Kind = "expired" | "expiring" | "missing";
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
function addHrefFor(score: ComplianceScore, label: string) {
  const params = new URLSearchParams({ newdoc: "1", title: label });
  if (score.ownerType === "company") params.set("company", String(score.ownerId));
  else params.set("person", String(score.ownerId));
  const cat = categoryForRequirement(label);
  if (cat) params.set("category", cat);
  return `/documents?${params.toString()}`;
}

const KIND_META: Record<Kind, { label: string; icon: typeof AlertTriangle; text: string; bg: string; ring: string }> = {
  expired: { label: "Expired", icon: AlertTriangle, text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/25" },
  expiring: { label: "Expiring", icon: Clock, text: "text-warn", bg: "bg-warn-soft/60", ring: "ring-warn/25" },
  missing: { label: "Missing", icon: FileWarning, text: "text-fg-muted", bg: "bg-bg-muted/70", ring: "ring-border/60" },
};

const INITIAL = 8;

export function NeedsAttentionPanel({
  documents,
  companies,
  people,
  companyScores,
  personScores,
}: {
  documents: DocumentRow[];
  companies: Array<{ id: number; name: string; accentColor?: string | null }>;
  people: Array<{ id: number; name: string }>;
  companyScores: ComplianceScore[];
  personScores: ComplianceScore[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startAction] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
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
        title: d.title,
        ownerName,
        ownerType: d.companyId ? "company" : d.personId ? "person" : null,
        accent: companyAccent(d.companyId),
        // Expired: most overdue first (dte most negative). Expiring: soonest first.
        rank: status === "Expired" ? -100000 + dte : dte,
        caption: expiryLabel(d),
        docId: d.id,
        canRenew: !!d.companyId,
        viewHref: d.companyId ? `/documents?company=${d.companyId}` : d.personId ? `/people?person=${d.personId}` : undefined,
      });
    }

    // Missing required documents, from the compliance gaps.
    for (const score of [...companyScores, ...personScores]) {
      for (const gap of score.gaps) {
        out.push({
          key: `gap-${score.ownerType}-${score.ownerId}-${gap.label}`,
          kind: "missing",
          title: gap.label,
          ownerName: score.ownerName,
          ownerType: score.ownerType,
          accent: null,
          rank: 200000, // after all expiry items
          caption: `${score.score}% compliant`,
          addHref: addHrefFor(score, gap.label),
          viewHref: score.ownerType === "company" ? `/documents?company=${score.ownerId}` : `/people?person=${score.ownerId}`,
        });
      }
    }

    out.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, companyScores, personScores]);

  const counts = useMemo(() => ({
    all: items.length,
    expired: items.filter((i) => i.kind === "expired").length,
    expiring: items.filter((i) => i.kind === "expiring").length,
    missing: items.filter((i) => i.kind === "missing").length,
  }), [items]);

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
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

  // Nothing to do — a calm, reassuring state.
  if (items.length === 0) {
    return (
      <section className="glass elevated flex items-center gap-3 rounded-3xl px-4 py-3.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-success-soft/60 text-success ring-1 ring-success/20">
          <ListTodo size={17} />
        </span>
        <div>
          <div className="text-sm font-semibold">Nothing needs attention</div>
          <div className="text-xs text-fg-muted">No expired, expiring or missing required documents.</div>
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
      <div className="relative flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListTodo size={16} className="text-accent" /> Needs attention
          <span className="rounded-full bg-bg-muted/70 px-2 py-0.5 text-xs font-medium tabular text-fg-muted">{counts.all}</span>
        </div>
        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: "all" as Filter, label: "All", n: counts.all, t: "accent" },
            { key: "expired" as Filter, label: "Expired", n: counts.expired, t: "danger" },
            { key: "expiring" as Filter, label: "Expiring", n: counts.expiring, t: "warn" },
            { key: "missing" as Filter, label: "Missing", n: counts.missing, t: "muted" },
          ]).map(({ key, label, n, t }) => {
            const active = filter === key;
            const tint = active
              ? t === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
                : t === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
                : t === "muted" ? "bg-bg-muted ring-2 ring-border text-fg"
                : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
              : n === 0 ? "bg-bg-subtle/40 ring-1 ring-border/50 text-fg-subtle"
              : "bg-bg-subtle/60 ring-1 ring-border/50 text-fg-muted hover:ring-2 hover:ring-border";
            return (
              <button key={key} type="button" onClick={() => { setFilter(active && key !== "all" ? "all" : key); setExpanded(false); }}
                className={cn("inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-xs backdrop-blur-md transition-all", tint)}>
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white/30 px-1 text-[10px] font-semibold tabular dark:bg-black/20">{n}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative divide-y divide-border/40">
        {shown.map((item) => {
          const meta = KIND_META[item.kind];
          const Icon = meta.icon;
          return (
            <div key={item.key} className="flex items-center gap-3 px-3.5 py-2.5">
              {item.accent
                ? <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.accent }} />
                : null}
              <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1", meta.bg, meta.ring)}>
                <Icon size={15} className={meta.text} />
              </span>
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
              {/* Inline action */}
              {item.kind === "missing" && item.addHref ? (
                <Link href={item.addHref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20">
                  <Plus size={13} /> Add
                </Link>
              ) : item.canRenew && item.docId ? (
                <button type="button" disabled={busyId === item.docId} onClick={() => doRenew(item.docId!)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted disabled:opacity-50">
                  {busyId === item.docId ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Renew
                </button>
              ) : item.viewHref ? (
                <Link href={item.viewHref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted">
                  <ExternalLink size={13} /> View
                </Link>
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
