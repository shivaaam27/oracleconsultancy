"use client";

import { useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, Plus, X, Laptop, Pencil, Archive, RotateCcw, Wrench, Loader2, User, Users } from "lucide-react";
import { Badge, Button } from "./ui";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import {
  ASSET_CATEGORIES,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONE,
  type AssetRow,
  type AssetStatus,
} from "@/lib/assets-shared";
import {
  createAssetAction,
  updateAssetAction,
  assignAssetAction,
  assignAssetSharedAction,
  returnAssetAction,
  setAssetStatusAction,
  archiveAssetAction,
} from "@/app/hrms/assets/actions";

type Lite = { id: number; name: string };

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function AssetsTable({
  assets,
  companies,
  people,
  vendors = [],
}: {
  assets: AssetRow[];
  companies: Lite[];
  people: Lite[];
  vendors?: Lite[];
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [sharing, setSharing] = useState<AssetRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let rows = assets.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.tag?.toLowerCase().includes(q) ?? false) ||
          (a.serialNo?.toLowerCase().includes(q) ?? false) ||
          (a.assignedToName?.toLowerCase().includes(q) ?? false)
      );
    }
    if (categoryFilter !== "all") rows = rows.filter((a) => a.category === categoryFilter);
    if (statusFilter !== "all") rows = rows.filter((a) => a.status === statusFilter);
    return rows;
  }, [assets, search, categoryFilter, statusFilter]);

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) { toast(res.error ?? "Something went wrong", { tone: "danger" }); return; }
      if (okMsg) toast(okMsg, { tone: "success" });
    });
  }

  function openNew() { setEditing(null); setDialogOpen(true); }
  function openEdit(a: AssetRow) { setEditing(a); setDialogOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, tag, serial, holder…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <FluidSelect
          value={categoryFilter}
          onSelect={setCategoryFilter}
          options={[{ value: "all", label: "All Categories" }, ...ASSET_CATEGORIES.map((c) => ({ value: c, label: c }))]}
        />
        <FluidSelect
          value={statusFilter}
          onSelect={setStatusFilter}
          options={[
            { value: "all", label: "All Statuses" },
            ...(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((s) => ({ value: s, label: ASSET_STATUS_LABELS[s] })),
          ]}
        />
        <Button size="sm" onClick={openNew}><Plus size={14} /> Add asset</Button>
      </div>

      {filtered.length > 0 ? (
        <div className="glass elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {filtered.map((a) => {
            const busy = busyId === a.id;
            const meta = [a.tag, a.serialNo ? `SN ${a.serialNo}` : null, a.companyName, a.location, a.vendorName ? `from ${a.vendorName}` : null].filter(Boolean).join(" · ");
            return (
              <div key={a.id} className={cn("flex flex-wrap items-center gap-3 px-3.5 py-2.5", busy && "opacity-60")}>
                <span className="h-9 w-9 rounded-full bg-bg-muted ring-1 ring-border flex items-center justify-center text-fg-muted shrink-0">
                  <Laptop size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{a.name}</span>
                    {a.category && <span className="text-[11px] text-fg-subtle">{a.category}</span>}
                    <Badge tone={ASSET_STATUS_TONE[a.status]}>{ASSET_STATUS_LABELS[a.status]}</Badge>
                  </div>
                  <div className="text-xs text-fg-muted truncate mt-0.5">{meta || "—"}</div>
                  {a.status === "assigned" && a.assignedToName && (
                    <div className="text-[11px] text-info mt-0.5 inline-flex items-center gap-1">
                      <User size={11} /> {a.assignedToName}{a.assignedAt ? ` · since ${fmtDate(a.assignedAt)}` : ""}
                    </div>
                  )}
                  {a.status === "assigned" && !a.assignedToName && (a.assignedToCompanyName || a.custodianName) && (
                    <div className="text-[11px] text-info mt-0.5 inline-flex items-center gap-1">
                      <Users size={11} /> Shared{a.assignedToCompanyName ? ` · ${a.assignedToCompanyName}` : ""}{a.custodianName ? ` · custodian ${a.custodianName}` : ""}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {a.status === "assigned" ? (
                    <button
                      type="button" disabled={busy}
                      onClick={() => run(a.id, () => returnAssetAction(a.id), "Asset returned.")}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-border bg-bg-subtle hover:bg-bg-muted"
                    >
                      <RotateCcw size={12} /> Return
                    </button>
                  ) : a.status === "in_store" ? (
                    <>
                      <select
                        disabled={busy}
                        defaultValue=""
                        onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) run(a.id, () => assignAssetAction(a.id, v), "Asset assigned."); }}
                        className="rounded-md bg-bg-subtle text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1 max-w-[9rem]"
                      >
                        <option value="" disabled>Assign to…</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button type="button" disabled={busy} title="Share with a team"
                        onClick={() => setSharing(a)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-border bg-bg-subtle hover:bg-bg-muted">
                        <Users size={12} /> Share
                      </button>
                    </>
                  ) : null}

                  {a.status !== "maintenance" && a.status !== "retired" && (
                    <button type="button" disabled={busy} title="Send to maintenance"
                      onClick={() => run(a.id, () => setAssetStatusAction(a.id, "maintenance"), "Marked as maintenance.")}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-warn hover:bg-bg-subtle">
                      <Wrench size={13} />
                    </button>
                  )}
                  {a.status === "maintenance" && (
                    <button type="button" disabled={busy}
                      onClick={() => run(a.id, () => setAssetStatusAction(a.id, "in_store"), "Back in store.")}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ring-1 ring-border bg-bg-subtle hover:bg-bg-muted">
                      Back in store
                    </button>
                  )}

                  <button type="button" disabled={busy} title="Edit" onClick={() => openEdit(a)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-accent hover:bg-bg-subtle">
                    <Pencil size={13} />
                  </button>
                  <button type="button" disabled={busy} title="Archive"
                    onClick={() => run(a.id, () => archiveAssetAction(a.id, true), "Asset archived.")}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-danger hover:bg-bg-subtle">
                    <Archive size={13} />
                  </button>
                  {busy && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass elevated rounded-2xl text-center py-12 text-fg-muted text-sm">
          {assets.length === 0 ? "No assets yet. Add your first to begin." : "No assets match these filters."}
        </div>
      )}

      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        companies={companies}
        vendors={vendors}
      />

      <ShareDialog
        asset={sharing}
        onOpenChange={(o) => { if (!o) setSharing(null); }}
        companies={companies}
        people={people}
      />
    </div>
  );
}

function ShareDialog({
  asset,
  onOpenChange,
  companies,
  people,
}: {
  asset: AssetRow | null;
  onOpenChange: (o: boolean) => void;
  companies: Lite[];
  people: Lite[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [companyId, setCompanyId] = useState<string>("");
  const [custodianId, setCustodianId] = useState<string>("");

  // Reset selections when a new asset opens.
  const open = asset != null;

  function submit() {
    if (!asset) return;
    if (!companyId && !custodianId) { toast("Pick a team/company or a custodian.", { tone: "warn" }); return; }
    startTransition(async () => {
      const res = await assignAssetSharedAction(
        asset.id,
        companyId ? parseInt(companyId, 10) : null,
        custodianId ? parseInt(custodianId, 10) : null
      );
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Asset shared with the team.", { tone: "success" });
      setCompanyId(""); setCustodianId("");
      onOpenChange(false);
    });
  }

  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">Share {asset?.name}</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle">
              <X size={14} />
            </Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-fg-muted">
              For kit a whole team shares (no single holder). Pick the team/company and one accountable custodian.
            </p>
            <div>
              <label className={label}>Team / company</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={input}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Custodian (accountable person)</label>
              <select value={custodianId} onChange={(e) => setCustodianId(e.target.value)} className={input}>
                <option value="">—</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" size="sm" loading={pending} onClick={submit}>Share asset</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AssetDialog({
  open,
  onOpenChange,
  editing,
  companies,
  vendors,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AssetRow | null;
  companies: Lite[];
  vendors: Lite[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = editing ? await updateAssetAction(editing.id, fd) : await createAssetAction(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(editing ? "Asset updated." : "Asset added.", { tone: "success" });
      onOpenChange(false);
    });
  }

  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(560px,calc(100vw-2rem))] max-h-[88dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">{editing ? "Edit asset" : "Add an asset"}</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle">
              <X size={14} />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="p-5 space-y-3">
            <div>
              <label className={label}>Name *</label>
              <input name="name" required defaultValue={editing?.name ?? ""} placeholder="e.g. Dell Latitude 5420" className={input} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Asset tag</label>
                <input name="tag" defaultValue={editing?.tag ?? ""} placeholder="LAP-001" className={input} />
              </div>
              <div>
                <label className={label}>Category</label>
                <select name="category" defaultValue={editing?.category ?? ""} className={input}>
                  <option value="">—</option>
                  {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Serial number</label>
                <input name="serialNo" defaultValue={editing?.serialNo ?? ""} className={input} />
              </div>
              <div>
                <label className={label}>Owning company</label>
                <select name="companyId" defaultValue={editing?.companyId ?? ""} className={input}>
                  <option value="">—</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Supplier (vendor)</label>
                <select name="vendorId" defaultValue={editing?.vendorId ?? ""} className={input}>
                  <option value="">—</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Location / site</label>
                <input name="location" defaultValue={editing?.location ?? ""} placeholder="e.g. Head Office" className={input} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Purchase date</label>
                <input type="date" name="purchaseDate" defaultValue={editing?.purchaseDate ? editing.purchaseDate.slice(0, 10) : ""} className={input} />
              </div>
              <div>
                <label className={label}>Purchase cost</label>
                <input type="number" step="0.01" name="purchaseCost" defaultValue={editing?.purchaseCost ?? ""} className={input} />
              </div>
            </div>
            <div>
              <label className={label}>Notes</label>
              <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={input} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={pending}>{editing ? "Save changes" : "Add asset"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
