"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Loader2, FileX, FileSearch, ShieldAlert, Copy, CheckCircle2, ChevronDown, ExternalLink, Sparkles, UserCog,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "./toast";
import { getDocumentHealthAction, ensureDocumentText } from "@/app/documents/actions";
import type { DocumentHealth, HealthItem } from "@/lib/document-health";

/**
 * Document Health Check — a button + dialog that runs a zero-AI audit of the whole
 * library (getDocumentHealthAction) so the owner can find failed/unread/unverified
 * documents WITHOUT re-uploading everything. The ONLY action that spends AI is
 * "Re-read" on the no-text bucket, and only for that subset, on demand.
 */
export function DocumentHealthButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Find failed / unread / unverified documents — no AI cost"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 text-xs font-semibold text-fg transition-colors hover:bg-bg-muted"
      >
        <Activity size={14} className="text-accent" /> Health check
      </button>
      <HrmsDialog
        open={open}
        onOpenChange={setOpen}
        width={660}
        title="Document health check"
        sub="A quick, free scan of every document — finds failed uploads, unread files and unverified reads. No AI is used unless you choose to re-read."
      >
        {open && <HealthBody onOpenDoc={() => setOpen(false)} />}
      </HrmsDialog>
    </>
  );
}

function HealthBody({ onOpenDoc }: { onOpenDoc: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<DocumentHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [rereading, setRereading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState("all"); // "all" | "none" | company id (as string)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getDocumentHealthAction());
    } catch {
      toast("Couldn’t run the health check.", { tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  function openDoc(id: number) {
    onOpenDoc();
    router.push(`/documents?doc=${id}`);
  }

  // Re-read ONLY the given no-text ids (the sole AI-spending action), with progress.
  // Ids come from the CURRENTLY-FILTERED bucket, so a company filter also scopes the AI spend.
  async function rereadNoText(ids: number[]) {
    if (ids.length === 0) return;
    setRereading(true);
    setProgress({ done: 0, total: ids.length });
    // Report honestly: ensureDocumentText returns "done" only when it actually captured
    // text. Scans that OCR can't read, or truly-unreadable files, come back "none" — so
    // we tell the owner exactly how many are now searchable vs still stuck, never a
    // blanket "success" for documents that didn't change.
    let read = 0, failed = 0, processed = 0;
    for (const id of ids) {
      try {
        const r = await ensureDocumentText(id, true);
        if (r === "done") read++; else failed++;
      } catch { failed++; }
      processed++;
      setProgress({ done: processed, total: ids.length });
    }
    setRereading(false);
    setProgress(null);
    if (read > 0 && failed === 0) {
      toast(`Re-read ${read} document${read === 1 ? "" : "s"} — now searchable.`, { tone: "success" });
    } else if (read > 0) {
      toast(`${read} now searchable · ${failed} still couldn’t be read (likely scans).`, { tone: "warn" });
    } else {
      toast(`Couldn’t read ${failed} — likely scans or unsupported files. Nothing changed.`, { tone: "warn" });
    }
    await load();
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-fg-muted">
        <Loader2 size={16} className="animate-spin" /> Scanning every document…
      </div>
    );
  }
  if (!data) return null;

  // Company filter — build the option list from the owners that actually appear in
  // any bucket (so the dropdown only offers companies that have something to fix),
  // then scope every bucket + the re-read to the selection.
  const allItems = [...data.noFile, ...data.noText, ...data.needsReview, ...data.personMistagged, ...data.duplicates.flatMap((g) => g.items)];
  const companyMap = new Map<number, string>();
  let hasNoOwner = false;
  for (const it of allItems) {
    if (it.companyId != null) companyMap.set(it.companyId, it.owner ?? `Company #${it.companyId}`);
    else if (it.personId == null) hasNoOwner = true;
  }
  const companyOptions = [
    { value: "all", label: "All companies" },
    ...[...companyMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), label: name })),
    ...(hasNoOwner ? [{ value: "none", label: "No owner" }] : []),
  ];
  const match = (it: HealthItem) =>
    filter === "all" || (filter === "none" ? it.companyId == null && it.personId == null : it.companyId === Number(filter));

  const noFile = data.noFile.filter(match);
  const noText = data.noText.filter(match);
  const needsReview = data.needsReview.filter(match);
  const personMistagged = data.personMistagged.filter(match);
  const duplicates = data.duplicates
    .map((g) => ({ hash: g.hash, items: g.items.filter(match) }))
    .filter((g) => g.items.length > 0);

  const attention = noFile.length + noText.length + needsReview.length + personMistagged.length + duplicates.length;

  return (
    <div className="space-y-3">
      {/* Summary + company filter */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg-subtle/50 px-3.5 py-2.5 text-xs">
        <span className="inline-flex items-center gap-2 text-fg">
          <CheckCircle2 size={14} className="text-success" />
          <span><b>{data.total}</b> documents checked · <b className="text-success">{data.healthy}</b> healthy</span>
        </span>
        {companyOptions.length > 1 && (
          <FluidSelect
            value={filter}
            options={companyOptions}
            onSelect={setFilter}
            placeholder="All companies"
            buttonClassName="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 text-xs justify-between min-w-[9rem]"
          />
        )}
      </div>

      {attention === 0 && (
        <p className="px-1 py-6 text-center text-sm text-fg-muted">
          {filter === "all"
            ? "Everything on file is complete, readable and verified."
            : "Nothing to fix for this company — all complete, readable and verified."}
        </p>
      )}

      {/* A. Upload didn't complete (no file) — re-upload */}
      <HealthSection
        icon={<FileX size={14} className="text-danger" />}
        title="Upload didn’t complete"
        tone="danger"
        items={noFile}
        emptyHidden
        sub="No file is stored — re-upload these (calendar/email artifacts here are safe to ignore)."
        onOpen={openDoc}
      />

      {/* B. Not searchable inside (no text) — re-read (AI) */}
      <HealthSection
        icon={<FileSearch size={14} className="text-warn" />}
        title="Not searchable inside"
        tone="warn"
        items={noText}
        emptyHidden
        sub="A file is stored but no text was captured — re-read to index them. This is the only step that uses AI."
        onOpen={openDoc}
        action={
          noText.length > 0 ? (
            <button
              type="button"
              onClick={() => rereadNoText(noText.map((i) => i.id))}
              disabled={rereading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {rereading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {progress ? `Re-reading ${progress.done}/${progress.total}…` : `Re-read ${noText.length} (uses AI)`}
            </button>
          ) : null
        }
      />

      {/* C. Needs review */}
      <HealthSection
        icon={<ShieldAlert size={14} className="text-warn" />}
        title="Read, but not yet verified"
        tone="warn"
        items={needsReview}
        emptyHidden
        sub="These read fine but were flagged or low-confidence — a quick glance, no AI needed."
        onOpen={openDoc}
      />

      {/* Personal papers filed under a company */}
      <HealthSection
        icon={<UserCog size={14} className="text-warn" />}
        title="Should be tagged to a person"
        tone="warn"
        items={personMistagged}
        emptyHidden
        sub="A passport, visa, permit or ID filed under a company — open it and set the person it belongs to."
        onOpen={openDoc}
      />

      {/* D. Duplicates */}
      {duplicates.length > 0 && (
        <HealthSection
          icon={<Copy size={14} className="text-fg-muted" />}
          title="Exact duplicates"
          tone="muted"
          items={duplicates.flatMap((g) => g.items)}
          sub="Byte-identical copies — keep one, trash the rest."
          onOpen={openDoc}
        />
      )}
    </div>
  );
}

function HealthSection({
  icon, title, tone, items, sub, onOpen, action, emptyHidden,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "danger" | "warn" | "muted";
  items: HealthItem[];
  sub: string;
  onOpen: (id: number) => void;
  action?: React.ReactNode;
  emptyHidden?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (emptyHidden && items.length === 0) return null;
  const ring = tone === "danger" ? "ring-danger/25" : tone === "warn" ? "ring-warn/25" : "ring-border/60";

  return (
    <section className={cn("overflow-hidden rounded-2xl ring-1", ring)}>
      <div className="flex items-center gap-2 bg-bg-subtle/50 px-3.5 py-2.5">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", !expanded && "-rotate-90")} />
          {icon}
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-fg-muted">· {items.length}</span>
        </button>
        {action}
      </div>
      {expanded && (
        <>
          <p className="px-3.5 py-1.5 text-[11px] text-fg-subtle">{sub}</p>
          <ul className={cn("divide-y divide-border/50", items.length > 6 && "max-h-80 overflow-y-auto")}>
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onOpen(it.id)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.title}</span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {[it.owner, it.reason, it.createdAt?.slice(0, 10)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ExternalLink size={13} className="shrink-0 text-fg-subtle" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
