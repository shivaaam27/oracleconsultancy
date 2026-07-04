"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Trash2, Loader2, FileText, Image as ImageIcon, Eye, Pencil,
  ShieldQuestion, ShieldAlert, UserX, CheckCircle2, CalendarClock, Quote, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { DOC_CATEGORIES, displayDocName } from "@/lib/documents-shared";
import { confirmSortItemAction, bulkTrashQuarantineAction, getDocumentFileLinkAction } from "@/app/documents/actions";
import type { SortItem, SortGroup } from "@/lib/sorting-desk";

const GROUP_META: Record<SortGroup, { label: string; sub: string; Icon: typeof ShieldQuestion; cls: string }> = {
  place: { label: "Ready to confirm", sub: "Read in with a suggested company, category and expiry — check and confirm", Icon: ShieldQuestion, cls: "text-[#a78bfa]" },
  unsure: { label: "Unsure reads", sub: "Filed but the read was shaky — worth a glance", Icon: ShieldAlert, cls: "text-warn" },
  owner: { label: "No owner yet", sub: "Filed cleanly but not attached to a company or person", Icon: UserX, cls: "text-fg-muted" },
};
const ORDER: SortGroup[] = ["place", "unsure", "owner"];

function daysToExpiry(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / 86400000);
}

function ExpiryChip({ iso }: { iso: string | null }) {
  const dte = daysToExpiry(iso);
  if (dte === null) return <span className="rounded-md bg-bg-muted px-2 py-0.5 text-[11px] text-fg-subtle">no expiry</span>;
  const tone = dte < 0 ? "bg-danger-soft text-danger" : dte <= 90 ? "bg-warn-soft text-warn" : "bg-success-soft text-success";
  const label = dte < 0 ? `expired ${Math.abs(dte)}d ago` : dte === 0 ? "expires today" : `in ${dte}d`;
  return <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium tabular", tone)}>{label}</span>;
}

export function SortingDesk({
  items,
  companies,
  people,
}: {
  items: SortItem[];
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState<Set<SortGroup>>(new Set(["unsure", "owner"]));

  const ownerOptions = useMemo(
    () => [
      { value: "", label: "— No owner —" },
      ...companies.map((c) => ({ value: `c${c.id}`, label: c.name })),
      ...people.map((p) => ({ value: `p${p.id}`, label: `${p.name} (person)` })),
    ],
    [companies, people],
  );

  const groups = useMemo(
    () => ORDER.map((g) => ({ group: g, rows: items.filter((i) => i.group === g) })).filter((g) => g.rows.length),
    [items],
  );

  function toggleCollapse(g: SortGroup) {
    setCollapsed((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }

  if (items.length === 0) {
    return (
      <div className="glass elevated rounded-2xl py-12 text-center">
        <CheckCircle2 size={26} className="mx-auto mb-2 text-success" />
        <p className="text-sm text-fg-muted">Nothing to sort — you&apos;re all caught up.</p>
        <p className="mt-1 text-xs text-fg-subtle">Files pulled in from Dropbox, chat or task attachments will wait here for a quick confirm.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ group, rows }) => {
        const meta = GROUP_META[group];
        const isCollapsed = collapsed.has(group);
        return (
          <section key={group} className="rounded-2xl ring-1 ring-border/60 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCollapse(group)}
              className="flex w-full items-center gap-2 bg-bg-subtle/60 px-4 py-2.5 text-left"
            >
              <ChevronDown size={15} className={cn("shrink-0 text-fg-subtle transition-transform", isCollapsed && "-rotate-90")} />
              <meta.Icon size={15} className={meta.cls} />
              <span className="text-sm font-semibold">{meta.label}</span>
              <span className="text-xs text-fg-muted">· {rows.length}</span>
              <span className="ml-auto hidden truncate text-[11px] text-fg-subtle sm:block">{meta.sub}</span>
            </button>
            {!isCollapsed && (
              // Cap the section at ~5 cards; the rest scroll inside (portal housing).
              <div className={cn("divide-y divide-border/50", rows.length > 5 && "scroll-fade-y slim-scroll max-h-[38rem] overflow-y-auto overscroll-contain")}>
                {rows.map((it) => (
                  <SortCard key={it.id} item={it} ownerOptions={ownerOptions} onDone={() => router.refresh()} toast={toast} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SortCard({
  item, ownerOptions, onDone, toast,
}: {
  item: SortItem;
  ownerOptions: Array<{ value: string; label: string }>;
  onDone: () => void;
  toast: (msg: string, opts?: { tone?: "success" | "warn" | "danger" | "info"; duration?: number }) => void;
}) {
  const [pending, start] = useTransition();

  const initialOwner = item.companyId ? `c${item.companyId}` : item.personId ? `p${item.personId}` : "";
  const [owner, setOwner] = useState(initialOwner);
  const [category, setCategory] = useState(item.category ?? "");
  const [expiry, setExpiry] = useState(item.expiryDate ?? "");

  const Icon = item.isPdf ? FileText : ImageIcon;
  const ownerPatch = () => (owner.startsWith("c") ? { companyId: Number(owner.slice(1)), personId: null }
    : owner.startsWith("p") ? { personId: Number(owner.slice(1)), companyId: null }
    : { companyId: null, personId: null });

  function confirm() {
    start(async () => {
      const res = await confirmSortItemAction(item.id, {
        ...ownerPatch(),
        category: category || null,
        expiryDate: expiry || null,
      });
      if (res.ok) { toast("Filed.", { tone: "success" }); onDone(); }
      else toast(res.error ?? "Couldn't file it.", { tone: "warn" });
    });
  }
  function trash() {
    start(async () => {
      await bulkTrashQuarantineAction([item.id]);
      toast("Moved to Trash.", { tone: "success" });
      onDone();
    });
  }
  function preview() {
    start(async () => {
      const res = await getDocumentFileLinkAction(item.id);
      if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
      else toast(res.error ?? "No file to preview.", { tone: "warn" });
    });
  }
  // Open the full editor for deeper fields (issuer, ref, notes). It lives on the
  // Library tab, so ask the workspace (via a window event) to switch there + open it.
  function fixDetails() {
    window.dispatchEvent(new CustomEvent("cos:edit-document", { detail: { id: item.id } }));
  }

  // One shared control size so every pill/select/button lines up on one row.
  const ctl = "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-muted/70 text-fg-subtle ring-1 ring-border/60">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          {/* Clean document name + source/why */}
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{displayDocName(item)}</span>
            <ExpiryChip iso={expiry || null} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-subtle">
            {item.source && <span className="rounded bg-bg-muted px-1.5 py-0.5">{item.source}</span>}
            {item.why && <span>{item.why}</span>}
            {item.confidence != null && <span>· {Math.round(item.confidence * 100)}% sure</span>}
          </div>

          {/* Evidence — the sentence the key detail was read from (only when relevant) */}
          {item.evidence && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-bg-subtle/50 px-2.5 py-1.5 text-[11px] italic text-fg-muted ring-1 ring-border/40">
              <Quote size={11} className="mt-0.5 shrink-0 text-fg-subtle" />
              <span className="line-clamp-2">“{item.evidence}”</span>
            </div>
          )}

          {/* Fixed-column controls: Company · Type · Date · Preview · Fix details,
              with File (green) above Trash on the right — aligned down the whole list. */}
          <div className="mt-2 flex flex-wrap items-start gap-1.5">
            <FluidSelect
              value={owner}
              options={ownerOptions}
              onSelect={setOwner}
              placeholder="Company / person"
              buttonClassName={cn(ctl, "w-[172px] justify-between border border-border bg-bg-elev")}
            />
            <FluidSelect
              value={category || "none"}
              options={[{ value: "none", label: "Type…" }, ...DOC_CATEGORIES.map((c) => ({ value: c, label: c }))]}
              onSelect={(v) => setCategory(v === "none" ? "" : v)}
              buttonClassName={cn(ctl, "w-[128px] justify-between border border-border bg-bg-elev")}
            />
            <label className={cn(ctl, "w-[150px] border border-border bg-bg-elev pr-2")}>
              <CalendarClock size={13} className="shrink-0 text-fg-subtle" />
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none" />
              {expiry && <button type="button" onClick={() => setExpiry("")} className="shrink-0 text-fg-subtle hover:text-danger" title="No expiry">×</button>}
            </label>
            <button type="button" onClick={preview} disabled={pending}
              className={cn(ctl, "w-[104px] justify-center border border-border bg-bg-elev text-fg-muted transition-colors hover:text-fg disabled:opacity-50")}>
              <Eye size={13} /> Preview
            </button>
            <button type="button" onClick={fixDetails}
              className={cn(ctl, "w-[116px] justify-center border border-border bg-bg-elev text-fg-muted transition-colors hover:text-fg")}>
              <Pencil size={13} /> Fix details
            </button>
            {/* File (green) above Trash */}
            <div className="ml-auto flex flex-col items-stretch gap-1">
              <button type="button" onClick={confirm} disabled={pending}
                className={cn(ctl, "w-[104px] justify-center bg-success font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50")}>
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} File
              </button>
              <button type="button" onClick={trash} disabled={pending}
                className="inline-flex h-7 w-[104px] items-center justify-center gap-1 rounded-lg text-[11px] text-fg-muted transition-colors hover:text-danger disabled:opacity-50">
                <Trash2 size={12} /> Trash
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
