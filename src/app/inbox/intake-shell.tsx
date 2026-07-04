"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox as InboxIcon, ShieldCheck, Trash2, Sparkles, Loader2, FileText, Image as ImageIcon,
  RotateCcw, X, CheckCircle2, Eye,
} from "lucide-react";
import { InboxList } from "./inbox-list";
import { signInboxAttachment, autoSortInboxAction, type InboxItem, type AutoSortSummary } from "./actions";
import {
  restoreFromTrashAction, deleteIntakeForeverAction, emptyTrashAction, type IntakeBucketItem,
} from "@/app/documents/actions";
import { VerifyQueue } from "@/components/verify-queue";
import type { VerifyItem } from "@/lib/verify-queue";
import { RescanDocumentsButton } from "@/components/rescan-documents-button";
import { FindDuplicatesButton } from "@/components/find-duplicates-button";
import { Button } from "@/components/ui";

type Tab = "verify" | "inbox" | "trash";

function relTime(iso: string | null): string {
  if (!iso) return "";
  const norm = /[Zz]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const s = (Date.now() - new Date(norm).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(norm).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function IntakeShell({
  inboxItems,
  companies,
  people,
  verify,
  trash,
  hideTrash = false,
}: {
  inboxItems: InboxItem[];
  companies: Array<{ id: number; name: string; aliases?: string[] }>;
  people: Array<{ id: number; name: string }>;
  verify: VerifyItem[];
  trash: IntakeBucketItem[];
  /** When the page already has its own top-level Trash tab, hide the inner one. */
  hideTrash?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(verify.length > 0 ? "verify" : "inbox");
  const [sorting, startSort] = useTransition();
  const [summary, setSummary] = useState<AutoSortSummary | null>(null);

  function sortNow() {
    setSummary(null);
    startSort(async () => {
      const res = await autoSortInboxAction();
      setSummary(res);
      router.refresh();
    });
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof InboxIcon; count: number }> = [
    { id: "verify", label: "Verify", icon: ShieldCheck, count: verify.length },
    { id: "inbox", label: "Inbox", icon: InboxIcon, count: inboxItems.length },
    ...(hideTrash ? [] : [{ id: "trash" as Tab, label: "Trash", icon: Trash2, count: trash.length }]),
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar + Sort now */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-full glass p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-accent text-white shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                <Icon size={13} /> {t.label}
                {t.count > 0 && (
                  <span className={`ml-0.5 rounded-full px-1.5 text-[10px] ${active ? "bg-white/25" : "bg-bg-muted"}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Button type="button" size="sm" onClick={sortNow} disabled={sorting} className="ml-auto">
          {sorting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Sort now
        </Button>
      </div>

      {/* Whole-library housekeeping — moved here so Inbox is the one-stop place. */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-fg-subtle">
        <span className="pl-1">Library tools:</span>
        <RescanDocumentsButton />
        <FindDuplicatesButton />
      </div>

      {/* Last run summary */}
      {summary && (
        <div className={`glass rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2 ${summary.ok ? "" : "ring-1 ring-danger/30"}`}>
          <CheckCircle2 size={14} className={summary.ok ? "text-success" : "text-danger"} />
          {summary.ok ? (
            summary.bundles === 0 && summary.filed + summary.quarantined + summary.trashed === 0 ? (
              <span className="text-fg-muted">Nothing new to sort.</span>
            ) : (
              <span className="text-fg-muted">
                Sorted: <b className="text-fg">{summary.filed}</b> filed
                {summary.quarantined > 0 && <> · <b className="text-fg">{summary.quarantined}</b> to quarantine</>}
                {summary.trashed > 0 && <> · <b className="text-fg">{summary.trashed}</b> to trash</>}
                {summary.failed > 0 && <> · <b className="text-warn">{summary.failed}</b> couldn&apos;t be read</>}
              </span>
            )
          ) : (
            <span className="text-danger">{summary.error}</span>
          )}
        </div>
      )}

      {tab === "verify" && <VerifyQueue items={verify} companies={companies} people={people} />}
      {tab === "inbox" && <InboxList items={inboxItems} companies={companies} people={people} />}
      {tab === "trash" && <TrashList items={trash} />}
    </div>
  );
}

function openFile(storagePath: string | null) {
  if (!storagePath) return;
  signInboxAttachment(storagePath).then(({ url }) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });
}

function FileChip({ item }: { item: IntakeBucketItem }) {
  const Icon = item.isPdf ? FileText : ImageIcon;
  if (!item.storagePath) return null;
  return (
    <button
      type="button"
      onClick={() => openFile(item.storagePath)}
      className="inline-flex items-center gap-1 text-[11px] text-accent bg-accent-soft/50 ring-1 ring-accent/20 rounded-full px-2 py-0.5 hover:bg-accent-soft transition-colors"
    >
      <Icon size={10} /> {item.fileName || "file"}
    </button>
  );
}

function EmptyBucket({ icon: Icon, title, sub }: { icon: typeof InboxIcon; title: string; sub: string }) {
  return (
    <div className="glass elevated rounded-2xl py-12 text-center">
      <Icon size={26} className="mx-auto text-fg-subtle mb-2" />
      <p className="text-sm text-fg-muted">{title}</p>
      <p className="text-xs text-fg-subtle mt-1">{sub}</p>
    </div>
  );
}

export function TrashList({ items }: { items: IntakeBucketItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [emptying, startEmpty] = useTransition();

  function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    start(async () => { await fn(); router.refresh(); setBusy(null); });
  }

  function emptyAll() {
    if (!window.confirm(`Permanently delete all ${items.length} item${items.length === 1 ? "" : "s"} in Trash? This can't be undone.`)) return;
    startEmpty(async () => { await emptyTrashAction(); router.refresh(); });
  }

  if (items.length === 0)
    return <EmptyBucket icon={Trash2} title="Trash is empty." sub="Exact duplicates and photos replaced by a PDF land here. Nothing is ever deleted automatically." />;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-fg-subtle">Duplicates and superseded copies. Restore anything, or empty when you&apos;re sure.</p>
        <button
          type="button"
          onClick={emptyAll}
          disabled={emptying}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-danger/30 text-xs text-danger hover:bg-danger-soft transition-colors disabled:opacity-50"
        >
          {emptying ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Empty Trash
        </button>
      </div>
      {items.map((it) => {
        const isBusy = pending && busy === it.id;
        return (
          <div key={it.id} className="glass p-3.5 space-y-2 rounded-2xl opacity-90">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted text-fg-muted px-2 py-0.5 font-medium">
                <Trash2 size={11} /> Trashed
              </span>
              {it.category && <span className="text-fg-muted">{it.category}</span>}
              {it.owner && <span className="text-fg-muted truncate">· {it.owner}</span>}
              <span className="ml-auto shrink-0 text-fg-subtle">{relTime(it.when)}</span>
            </div>
            <p className="text-sm font-medium leading-snug line-through decoration-fg-subtle/40">{it.title}</p>
            {it.reason && <p className="text-xs text-fg-muted">{it.reason}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <FileChip item={it} />
              {it.storagePath && (
                <button
                  type="button"
                  onClick={() => openFile(it.storagePath)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
                >
                  <Eye size={13} /> Preview
                </button>
              )}
              <button
                type="button"
                onClick={() => act(it.id, () => restoreFromTrashAction(it.id))}
                disabled={isBusy}
                title="Send back to To Sort to re-check and confirm"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors disabled:opacity-50"
              >
                {isBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restore to To Sort
              </button>
              <button
                type="button"
                onClick={() => { if (window.confirm("Permanently delete this document? Preview it first if you're unsure — this can't be undone.")) act(it.id, () => deleteIntakeForeverAction(it.id)); }}
                disabled={isBusy}
                className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-danger transition-colors disabled:opacity-50"
              >
                <X size={13} /> Delete forever
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
