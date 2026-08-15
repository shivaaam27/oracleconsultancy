"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Search, Plus, Building, Pencil, Archive, Loader2, FilePlus, Mail, Phone, MapPin, MoreHorizontal } from "lucide-react";
import { Badge, Button, FieldLabel, RegisterList, RegisterRow, Select } from "./ui";
import { HrmsDialog } from "./hrms/hrms-dialog";
import { MenuItem } from "./register-ui";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import { VENDOR_CATEGORIES, type VendorRow } from "@/lib/vendors-shared";
import { createVendorAction, updateVendorAction, archiveVendorAction } from "@/app/hrms/vendors/actions";
import { RecordList } from "./record-list";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";

/** The Vendors list is defined in metadata, not here (Stage 3/4). */
const VENDOR_COLUMNS = ENTITY_VIEWS.vendor!.listColumns;

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
        <div className="relative w-full sm:flex-1 min-w-0 sm:min-w-[240px]">
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
        <RecordList
          rows={filtered}
          rowKey={(v) => v.id}
          listKey="vendor"
          bulkActions={[
            {
              label: "Archive",
              tone: "danger",
              icon: <Archive size={12} />,
              run: async (picked) => {
                for (const v of picked) await archiveVendorAction(v.id);
                toast(`${picked.length} vendor${picked.length === 1 ? "" : "s"} archived.`, { tone: "success" });
              },
            },
          ]}
          total={vendors.length}
          columns={buildColumns<(typeof filtered)[number] & Record<string, unknown>>(VENDOR_COLUMNS, {
            overrides: {
              name: (v) => (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg-muted ring-1 ring-border">
                    <Building size={12} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">{v.name}</span>
                      {v.docCount > 0 && <Badge tone="default">{v.docCount} doc{v.docCount === 1 ? "" : "s"}</Badge>}
                      {(assetCounts[v.id] ?? 0) > 0 && <Badge tone="info">{assetCounts[v.id]} asset{assetCounts[v.id] === 1 ? "" : "s"}</Badge>}
                      {v.expiredCount > 0 && <Badge tone="danger">{v.expiredCount} expired</Badge>}
                      {v.expiringCount > 0 && <Badge tone="warn">{v.expiringCount} expiring</Badge>}
                    </span>
                    {v.location && (
                      <span className="block truncate text-[11px] text-fg-muted">
                        <MapPin size={10} className="mr-1 inline" />{v.location}
                      </span>
                    )}
                  </span>
                </span>
              ),
              contact: (v) => {
                const contact = [v.contactName, v.email, v.phone].filter(Boolean).join(" · ");
                if (!contact) return <span className="text-fg-subtle">—</span>;
                return (
                  <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-fg-muted">
                    {v.email ? <Mail size={11} className="shrink-0" /> : <Phone size={11} className="shrink-0" />}
                    <span className="truncate">{contact}</span>
                  </span>
                );
              },
            },
          })}
          rowActions={(v) => {
            const busy = busyId === v.id;
            return (
              <span className="flex items-center gap-1.5">
                <Link
                  href={`/documents?newdoc=1&vendor=${v.id}&category=Contract`}
                  className="hidden items-center gap-1 rounded-md bg-bg-subtle px-2 py-1 text-[11px] font-medium ring-1 ring-border hover:bg-bg-muted sm:inline-flex"
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
              </span>
            );
          }}
        />
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
  // Visual styling for the shared <Select> — border/bg/focus only; Select owns
  // padding (incl. room for its chevron), height, rounding and appearance, so we
  // must NOT pass px-* here or twMerge would drop Select's pr-8 chevron gap.
  const selectClass = "border border-border bg-bg-subtle focus:outline-none focus:border-accent";

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit vendor" : "Add a vendor"}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" form="vendor-form" loading={pending}>{editing ? "Save changes" : "Add vendor"}</Button>
        </>
      }
    >
      <form id="vendor-form" onSubmit={onSubmit} className="space-y-3">
        <div>
          <FieldLabel>Name *</FieldLabel>
          <input name="name" required defaultValue={editing?.name ?? ""} placeholder="e.g. Zanzibar Internet Ltd" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Category</FieldLabel>
            <Select name="category" defaultValue={editing?.category ?? ""} className={selectClass}>
              <option value="">—</option>
              {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Serves company</FieldLabel>
            <Select name="companyId" defaultValue={editing?.companyId ?? ""} className={selectClass}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Contact name</FieldLabel>
            <input name="contactName" defaultValue={editing?.contactName ?? ""} className={input} />
          </div>
          <div>
            <FieldLabel>Location / site</FieldLabel>
            <input name="location" defaultValue={editing?.location ?? ""} placeholder="e.g. Expat House A" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Email</FieldLabel>
            <input type="email" name="email" defaultValue={editing?.email ?? ""} className={input} />
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <input name="phone" defaultValue={editing?.phone ?? ""} className={input} />
          </div>
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={input} />
        </div>
      </form>
    </HrmsDialog>
  );
}
