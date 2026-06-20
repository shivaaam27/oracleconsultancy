"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldQuestion, ShieldAlert, UserX, Check, Trash2, FolderInput, Loader2, Download, CheckCircle2, ChevronDown } from "lucide-react";
import { FluidSelect } from "@/components/fluid-select";
import { DocPreview } from "@/components/doc-preview";
import { useToast } from "@/components/toast";
import { bulkConfirmVerifyAction, bulkAssignQuarantineAction, bulkTrashQuarantineAction } from "@/app/documents/actions";
import type { VerifyItem, VerifyGroup } from "@/lib/verify-queue";

const GROUP_META: Record<VerifyGroup, { label: string; sub: string; Icon: typeof ShieldQuestion; cls: string; canConfirm: boolean }> = {
  place: { label: "Couldn’t place", sub: "No owner found, unreadable, or a suspected duplicate", Icon: ShieldQuestion, cls: "text-warn", canConfirm: true },
  unsure: { label: "Unsure reads", sub: "Filed but low-confidence — worth a glance", Icon: ShieldAlert, cls: "text-warn", canConfirm: true },
  owner: { label: "No owner yet", sub: "Filed cleanly but not attached to a company or person", Icon: UserX, cls: "text-fg-muted", canConfirm: false },
};
const ORDER: VerifyGroup[] = ["place", "unsure", "owner"];

export function VerifyQueue({
  items,
  companies,
  people,
}: {
  items: VerifyItem[];
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [ownerPick, setOwnerPick] = useState("");
  const [collapsed, setCollapsed] = useState<Set<VerifyGroup>>(new Set());

  const groups = useMemo(() => ORDER.map((g) => ({ group: g, rows: items.filter((i) => i.group === g) })).filter((g) => g.rows.length), [items]);
  const selCount = selected.size;

  const ownerOptions = useMemo(
    () => [
      ...companies.map((c) => ({ value: `c${c.id}`, label: c.name })),
      ...people.map((p) => ({ value: `p${p.id}`, label: p.name })),
    ],
    [companies, people],
  );

  function toggle(id: number) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleGroup(rows: VerifyItem[]) {
    const ids = rows.map((r) => r.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((p) => { const n = new Set(p); ids.forEach((id) => (allOn ? n.delete(id) : n.add(id))); return n; });
  }
  function toggleCollapse(g: VerifyGroup) {
    setCollapsed((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }

  function run(label: string, fn: () => Promise<unknown>) {
    start(async () => {
      await fn();
      setSelected(new Set());
      setOwnerPick("");
      toast(label, { tone: "success" });
      router.refresh();
    });
  }
  const ids = () => [...selected];
  const confirm = () => run("Confirmed.", () => bulkConfirmVerifyAction(ids()));
  const bin = () => run("Moved to Trash.", () => bulkTrashQuarantineAction(ids()));
  function assign() {
    if (!ownerPick) return;
    const owner = ownerPick.startsWith("c") ? { companyId: Number(ownerPick.slice(1)) } : { personId: Number(ownerPick.slice(1)) };
    run("Owner assigned.", () => bulkAssignQuarantineAction(ids(), owner));
  }

  function exportCsv() {
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Group", "Title", "Why", "Owner", "Category", "Confidence"].join(",")];
    for (const i of items) rows.push([GROUP_META[i.group].label, i.title, i.why, i.owner, i.category, i.confidence != null ? `${Math.round(i.confidence * 100)}%` : ""].map((v) => esc(v as string)).join(","));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "verify-queue.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (items.length === 0) {
    return (
      <div className="glass elevated rounded-2xl py-12 text-center">
        <CheckCircle2 size={26} className="mx-auto text-success mb-2" />
        <p className="text-sm text-fg-muted">Nothing to verify — you’re all caught up.</p>
        <p className="text-xs text-fg-subtle mt-1">Documents the system can’t place, reads it’s unsure about, or files with no owner will surface here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-fg-subtle">Only the things that need your eyes. Clear them in bulk.</p>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg transition-colors">
          <Download size={12} /> Export CSV
        </button>
      </div>

      {groups.map(({ group, rows }) => {
        const meta = GROUP_META[group];
        const allOn = rows.every((r) => selected.has(r.id));
        const isCollapsed = collapsed.has(group);
        return (
          <section key={group} className="glass elevated rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <button type="button" onClick={() => toggleCollapse(group)} className="flex items-center gap-2 min-w-0 text-left">
                <ChevronDown size={15} className={`shrink-0 text-fg-subtle transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                <meta.Icon size={16} className={meta.cls} />
                <span className="text-sm font-semibold truncate">{meta.label}</span>
                <span className="text-xs text-fg-muted">· {rows.length}</span>
              </button>
              <button type="button" onClick={() => toggleGroup(rows)} className="ml-auto text-[11px] text-accent hover:underline shrink-0">
                {allOn ? "Deselect" : "Select all"}
              </button>
            </div>
            {!isCollapsed && (
              <div className="border-t border-border/50">
                <p className="text-[11px] text-fg-subtle px-4 py-2">{meta.sub}</p>
                <ul className="divide-y divide-border/50 border-t border-border/50">
                  {rows.map((r) => {
                    const on = selected.has(r.id);
                    return (
                      <li key={r.id} className={`px-4 py-2.5 transition-colors ${on ? "bg-accent/5" : "hover:bg-bg-subtle/40"}`}>
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => toggle(r.id)}
                            aria-pressed={on}
                            className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${on ? "bg-accent border-accent text-white" : "border-border-strong"}`}
                          >
                            {on && <Check size={11} strokeWidth={3} />}
                          </button>
                          <button type="button" onClick={() => router.push(`/documents?doc=${r.id}`)} className="min-w-0 flex-1 text-left">
                            <p className="text-[13px] font-medium truncate">{r.title}</p>
                            <p className="text-[11px] text-fg-muted truncate">
                              {[r.why, r.owner, r.category].filter(Boolean).join(" · ")}
                            </p>
                          </button>
                        </div>
                        {r.fileName && (
                          <div className="pl-7 pt-1.5">
                            <DocPreview documentId={r.id} fileName={r.fileName} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      {/* Bulk action bar — sticky at the bottom while there's a selection. */}
      {selCount > 0 && (
        <div className="sticky bottom-3 z-10">
          <div className="glass elevated rounded-2xl ring-1 ring-accent/30 px-3 py-2.5 flex items-center gap-2 flex-wrap shadow-lg">
            <span className="text-xs font-medium px-1">{selCount} selected</span>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <button type="button" onClick={confirm} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                {pending ? <Loader2 size={13} className="animate-spin" /> : <FolderInput size={13} />} Confirm
              </button>
              <div className="inline-flex items-center gap-1">
                <FluidSelect value={ownerPick} options={ownerOptions} onSelect={setOwnerPick} placeholder="Assign owner…" align="right" />
                <button type="button" onClick={assign} disabled={pending || !ownerPick} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                  Assign
                </button>
              </div>
              <button type="button" onClick={bin} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger hover:bg-danger-soft transition-colors disabled:opacity-50">
                <Trash2 size={13} /> Bin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
