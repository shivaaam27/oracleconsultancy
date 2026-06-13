"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Search, Plus, X, Building, Pencil, Archive, Loader2, FilePlus, Mail, Phone, MapPin, MoreHorizontal } from "lucide-react";
import { Badge, Button } from "./ui";
import { MenuItem } from "./register-ui";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { VENDOR_CATEGORIES, type VendorRow } from "@/lib/vendors-shared";
import { createVendorAction, updateVendorAction, archiveVendorAction } from "@/app/hrms/vendors/actions";

type Lite = { id: number; name: string };

export function VendorsTable({ vendors, companies, assetCounts = {} }: { vendors: VendorRow[]; companies: Lite[]; assetCounts?: Record<number, number> }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let rows = vendors.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.contactName?.toLowerCase().includes(q) ?? false) ||
          (v.location?.toLowerCase().includes(q) ?? false) ||
          (v.companyName?.toLowerCase().includes(q) ?? false)
      );
    }
    if (categoryFilter !== "all") rows = rows.filter((v) => v.category === categoryFilter);
    return rows;
  }, [vendors, search, categoryFilter]);

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
  function openEdit(v: VendorRow) { setEditing(v); setDialogOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, contact, location…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <FluidSelect
          value={categoryFilter}
          onSelect={setCategoryFilter}
          options={[{ value: "all", label: "All Categories" }, ...VENDOR_CATEGORIES.map((c) => ({ value: c, label: c }))]}
        />
        <Button size="sm" onClick={openNew}><Plus size={14} /> Add vendor</Button>
      </div>

      {filtered.length > 0 ? (
        <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {filtered.map((v) => {
            const busy = busyId === v.id;
            const contact = [v.contactName, v.email, v.phone].filter(Boolean).join(" · ");
            return (
              <div key={v.id} className={cn("flex items-center gap-3 px-3 sm:px-3.5 py-3 transition-colors hover:bg-bg-subtle/40", busy && "opacity-60")}>
                <span className="h-9 w-9 rounded-xl bg-bg-muted ring-1 ring-border flex items-center justify-center text-fg-muted shrink-0">
                  <Building size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{v.name}</span>
                    {v.category && <span className="text-[11px] text-fg-subtle">{v.category}</span>}
                    {v.companyName && <span className="text-[11px] text-fg-subtle">· {v.companyName}</span>}
                    {v.docCount > 0 && <Badge tone="default">{v.docCount} doc{v.docCount === 1 ? "" : "s"}</Badge>}
                    {(assetCounts[v.id] ?? 0) > 0 && <Badge tone="info">{assetCounts[v.id]} asset{assetCounts[v.id] === 1 ? "" : "s"}</Badge>}
                    {v.expiredCount > 0 && <Badge tone="danger">{v.expiredCount} expired</Badge>}
                    {v.expiringCount > 0 && <Badge tone="warn">{v.expiringCount} expiring</Badge>}
                  </div>
                  <div className="text-xs text-fg-muted truncate mt-0.5 flex flex-wrap items-center gap-x-2">
                    {contact && <span className="inline-flex items-center gap-1">{v.email ? <Mail size={11} /> : <Phone size={11} />}{contact}</span>}
                    {v.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {v.location}</span>}
                    {!contact && !v.location && "—"}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={`/documents?newdoc=1&vendor=${v.id}&category=Contract`}
                    className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-border bg-bg-subtle hover:bg-bg-muted"
                  >
                    <FilePlus size={12} /> Add contract
                  </Link>
                  {busy && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button type="button" disabled={busy} title="More actions"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted ring-1 ring-transparent hover:ring-border">
                        <MoreHorizontal size={16} />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content align="end" sideOffset={6}
                        className="z-[60] min-w-[170px] glass-menu rounded-xl p-1 shadow-pill ring-1 ring-border/70 text-sm">
                        <MenuItem icon={<FilePlus size={14} />} onSelect={() => { window.location.href = `/documents?newdoc=1&vendor=${v.id}&category=Contract`; }}>Add contract</MenuItem>
                        <MenuItem icon={<Pencil size={14} />} onSelect={() => openEdit(v)}>Edit</MenuItem>
                        <DropdownMenu.Separator className="h-px bg-border my-1" />
                        <MenuItem icon={<Archive size={14} />} danger onSelect={() => run(v.id, () => archiveVendorAction(v.id), "Vendor archived.")}>Archive</MenuItem>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl text-center py-12 text-fg-muted text-sm">
          {vendors.length === 0 ? "No vendors yet. Add your first to begin." : "No vendors match these filters."}
        </div>
      )}

      <VendorDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} companies={companies} />
    </div>
  );
}

function VendorDialog({
  open, onOpenChange, editing, companies,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: VendorRow | null;
  companies: Lite[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = editing ? await updateVendorAction(editing.id, fd) : await createVendorAction(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(editing ? "Vendor updated." : "Vendor added.", { tone: "success" });
      onOpenChange(false);
    });
  }

  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(560px,calc(100vw-2rem))] max-h-[88dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl glass glass-menu elevated outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">{editing ? "Edit vendor" : "Add a vendor"}</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle">
              <X size={14} />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="p-5 space-y-3">
            <div>
              <label className={label}>Name *</label>
              <input name="name" required defaultValue={editing?.name ?? ""} placeholder="e.g. Zanzibar Internet Ltd" className={input} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Category</label>
                <select name="category" defaultValue={editing?.category ?? ""} className={input}>
                  <option value="">—</option>
                  {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Serves company</label>
                <select name="companyId" defaultValue={editing?.companyId ?? ""} className={input}>
                  <option value="">—</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Contact name</label>
                <input name="contactName" defaultValue={editing?.contactName ?? ""} className={input} />
              </div>
              <div>
                <label className={label}>Location / site</label>
                <input name="location" defaultValue={editing?.location ?? ""} placeholder="e.g. Expat House A" className={input} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Email</label>
                <input type="email" name="email" defaultValue={editing?.email ?? ""} className={input} />
              </div>
              <div>
                <label className={label}>Phone</label>
                <input name="phone" defaultValue={editing?.phone ?? ""} className={input} />
              </div>
            </div>
            <div>
              <label className={label}>Notes</label>
              <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={input} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={pending}>{editing ? "Save changes" : "Add vendor"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
