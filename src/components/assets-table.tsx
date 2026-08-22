"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Search, Plus, Laptop, Pencil, Archive, RotateCcw, Wrench, Loader2, User, Users, Upload, Clock, Ban, ArchiveRestore, Printer, MoreHorizontal, UserPlus, UserCog } from "lucide-react";
import { Badge, Button, FieldLabel, RegisterList, RegisterRow, Select } from "./ui";
import { HrmsDialog } from "./hrms/hrms-dialog";
import { IconAction, MenuItem } from "./register-ui";
import { Combobox } from "./combobox";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import { useContextActions } from "./context-actions";
import { cn } from "@/lib/cn";
import { RecordList } from "./record-list";
import { useUrlFilters } from "@/lib/use-url-filters";
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { useCreateParam } from "@/lib/use-create-param";

/** The Assets list is defined in metadata, not here (Stage 3/4). */
const ASSET_COLUMNS = ENTITY_VIEWS.asset!.listColumns;
import {
  ASSET_CATEGORIES,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONE,
  type AssetRow,
  type AssetHistoryRow,
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
  importAssetsAction,
  listArchivedAssetsAction,
  listAssetHistoryAction,
  type AssetImportRow,
} from "@/app/hrms/assets/actions";

type Lite = { id: number; name: string };

// Visual styling for the shared <Select> — border/bg/focus only; Select owns
// padding (incl. its chevron gap), height, rounding and appearance, so we must
// NOT pass px-* here or twMerge would drop Select's pr-8 chevron room.
const SELECT_CLASS = "border border-border bg-bg-subtle focus:outline-none focus:border-accent";

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function AssetsTable({
  assets,
  companies,
  people,
  vendors = [],
  savedViews = [],
}: {
  assets: AssetRow[];
  companies: Lite[];
  people: Lite[];
  vendors?: Lite[];
  savedViews?: SavedView[];
}) {
  const { toast } = useToast();
  /* Filters live in the URL, not component state — so this list is shareable and
   * its saved views have something to save (see lib/use-url-filters.ts). The
   * Vendors table shares this page, so it namespaces its own params (`vq`,
   * `vcategory`) and the two never collide. */
  const { values: filters, set: setFilter, dirty, query } = useUrlFilters(
    { q: "", category: "all", status: "all" },
    { debounceKeys: ["q"] }
  );
  const { q: search, category: categoryFilter, status: statusFilter } = filters;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  // Surface the primary "add" on the floating nav "+" (consistent with Tasks/People/Documents).
  useContextActions("assets", [{ id: "add-asset", label: "Add asset", icon: <Plus size={16} />, onClick: openNew, primary: true, tone: "accent" }], []);
  // /hrms/assets?new=asset — named, because the Vendors table is mounted on this
  // same page and a bare `new=1` would open both dialogs.
  useCreateParam("asset", () => openNew());
  const [historyAsset, setHistoryAsset] = useState<AssetRow | null>(null);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [sharing, setSharing] = useState<AssetRow | null>(null);
  const [assigning, setAssigning] = useState<AssetRow | null>(null);
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
    if (categoryFilter !== "all") rows = rows.filter((a) => a.category?.toLowerCase() === categoryFilter.toLowerCase());
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
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setFilter({ q: e.target.value })}
            placeholder="Search name, tag, serial, holder…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
          <FluidSelect
            value={categoryFilter}
            onSelect={(v) => setFilter({ category: v })}
            options={[{ value: "all", label: "All Categories" }, ...ASSET_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <FluidSelect
            value={statusFilter}
            onSelect={(v) => setFilter({ status: v })}
            options={[
              { value: "all", label: "All Statuses" },
              ...(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((s) => ({ value: s, label: ASSET_STATUS_LABELS[s] })),
            ]}
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <IconAction title="Archived" onClick={() => setArchivedOpen(true)}><Archive size={15} /></IconAction>
          <IconAction title="Export PDF" onClick={() => window.open("/hrms/assets/print", "_blank")}><Printer size={15} /></IconAction>
          <IconAction title="Import" onClick={() => setImportOpen(true)}><Upload size={15} /></IconAction>
          <Button size="sm" onClick={openNew} className="ml-auto sm:ml-0"><Plus size={14} /> Add asset</Button>
        </div>
      </div>

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/hrms/assets"
        extraQuery="view=assets"
        listKey="asset"
      />

      {filtered.length > 0 ? (
        <RecordList
          rows={filtered}
          rowKey={(a) => a.id}
          /* An asset is a record page now, like a task or a person. */
          rowHref={(a) => `/hrms/assets/${a.id}`}
          listKey="asset"
          bulkActions={[
            {
              label: "Archive",
              tone: "danger",
              icon: <Archive size={12} />,
              run: async (picked) => {
                for (const a of picked) await archiveAssetAction(a.id, true);
                toast(`${picked.length} asset${picked.length === 1 ? "" : "s"} archived.`, { tone: "success" });
              },
            },
            {
              label: "To maintenance",
              icon: <Wrench size={12} />,
              run: async (picked) => {
                for (const a of picked) await setAssetStatusAction(a.id, "maintenance");
                toast(`${picked.length} sent to maintenance.`, { tone: "success" });
              },
            },
          ]}
          total={assets.length}
          columns={buildColumns<(typeof filtered)[number] & Record<string, unknown>>(ASSET_COLUMNS, {
            overrides: {
              name: (a) => (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg-muted ring-1 ring-border">
                    <Laptop size={12} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {[a.tag, a.serialNo ? `SN ${a.serialNo}` : null, a.companyName, a.location, a.vendorName ? `from ${a.vendorName}` : null].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                </span>
              ),
              assignedToName: (a) => {
                if (a.status === "assigned" && a.assignedToName) {
                  return (
                    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-info">
                      <User size={11} className="shrink-0" />
                      <span className="truncate">{a.assignedToName}</span>
                    </span>
                  );
                }
                if (a.status === "assigned" && (a.assignedToCompanyName || a.custodianName)) {
                  return (
                    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-info">
                      <Users size={11} className="shrink-0" />
                      <span className="truncate">{a.assignedToCompanyName || `custodian ${a.custodianName}`}</span>
                    </span>
                  );
                }
                return <span className="text-fg-subtle">—</span>;
              },
              status: (a) => <Badge tone={ASSET_STATUS_TONE[a.status]}>{ASSET_STATUS_LABELS[a.status]}</Badge>,
            },
          })}
          rowActions={(a) => {
            const busy = busyId === a.id;
            return (
              <span className="flex items-center gap-1.5">
                {a.status === "in_store" && (
                  <button type="button" disabled={busy} onClick={() => setAssigning(a)}
                    className="hidden items-center gap-1 rounded-md bg-bg-subtle px-2 py-1 text-xs font-medium ring-1 ring-border hover:bg-bg-muted sm:inline-flex">
                    <UserPlus size={12} /> Assign
                  </button>
                )}
                {a.status === "assigned" && (
                  <button type="button" disabled={busy} onClick={() => run(a.id, () => returnAssetAction(a.id), "Asset returned.")}
                    className="hidden items-center gap-1 rounded-md bg-bg-subtle px-2 py-1 text-xs font-medium ring-1 ring-border hover:bg-bg-muted sm:inline-flex">
                    <RotateCcw size={12} /> Return
                  </button>
                )}
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
              className="z-[60] min-w-[180px] glass-menu rounded-xl p-1 shadow-pill ring-1 ring-border/70 text-sm">
              {a.status === "in_store" && (
                <MenuItem icon={<UserPlus size={14} />} onSelect={() => setAssigning(a)}>Assign to person…</MenuItem>
              )}
              {a.status === "in_store" && (
                <MenuItem icon={<Users size={14} />} onSelect={() => setSharing(a)}>Share with team…</MenuItem>
              )}
              {a.status === "assigned" && (
                <MenuItem icon={<UserCog size={14} />} onSelect={() => setAssigning(a)}>Reassign…</MenuItem>
              )}
              {a.status === "assigned" && (
                <MenuItem icon={<RotateCcw size={14} />} onSelect={() => run(a.id, () => returnAssetAction(a.id), "Asset returned.")}>Return to store</MenuItem>
              )}
              {a.status === "assigned" && (
                <MenuItem icon={<Printer size={14} />} onSelect={() => window.open(`/hrms/assets/${a.id}/receipt`, "_blank")}>Handover receipt (PDF)</MenuItem>
              )}

              <DropdownMenu.Separator className="h-px bg-border my-1" />
              {a.status !== "maintenance" && a.status !== "retired" && (
                <MenuItem icon={<Wrench size={14} />} onSelect={() => run(a.id, () => setAssetStatusAction(a.id, "maintenance"), "Marked as maintenance.")}>Send to maintenance</MenuItem>
              )}
              {a.status === "maintenance" && (
                <MenuItem icon={<ArchiveRestore size={14} />} onSelect={() => run(a.id, () => setAssetStatusAction(a.id, "in_store"), "Back in store.")}>Back in store</MenuItem>
              )}
              {a.status === "retired" ? (
                <MenuItem icon={<ArchiveRestore size={14} />} onSelect={() => run(a.id, () => setAssetStatusAction(a.id, "in_store"), "Restored to store.")}>Restore to store</MenuItem>
              ) : (
                <MenuItem icon={<Ban size={14} />} onSelect={() => run(a.id, () => setAssetStatusAction(a.id, "retired"), "Asset retired.")}>Retire (end of life)</MenuItem>
              )}
              <MenuItem icon={<Clock size={14} />} onSelect={() => setHistoryAsset(a)}>History</MenuItem>
              <MenuItem icon={<Pencil size={14} />} onSelect={() => openEdit(a)}>Edit</MenuItem>
              <DropdownMenu.Separator className="h-px bg-border my-1" />
              <MenuItem icon={<Archive size={14} />} danger onSelect={() => run(a.id, () => archiveAssetAction(a.id, true), "Asset archived.")}>Archive</MenuItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
              </span>
            );
          }}
        />
      ) : (
        <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl text-center py-12 text-fg-muted text-sm">
          {assets.length === 0 ? "No assets yet. Add your first to begin." : "No assets match these filters."}
        </div>
      )}

      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        companies={companies}
        people={people}
        vendors={vendors}
      />

      <ShareDialog
        asset={sharing}
        onOpenChange={(o) => { if (!o) setSharing(null); }}
        companies={companies}
        people={people}
      />

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} companies={companies} />
      <AssignDialog asset={assigning} people={people} onOpenChange={(o) => { if (!o) setAssigning(null); }} />
      <AssetHistoryDialog asset={historyAsset} onOpenChange={(o) => { if (!o) setHistoryAsset(null); }} />
      <ArchivedAssetsDialog open={archivedOpen} onOpenChange={setArchivedOpen} />
    </div>
  );
}

function AssetHistoryDialog({ asset, onOpenChange }: { asset: AssetRow | null; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = useState<AssetHistoryRow[] | null>(null);
  const open = asset != null;

  useEffect(() => {
    if (!asset) { setRows(null); return; }
    let cancelled = false;
    listAssetHistoryAction(asset.id).then((res) => { if (!cancelled) setRows(res.ok ? res.rows : []); });
    return () => { cancelled = true; };
  }, [asset]);

  return (
    <HrmsDialog open={open} onOpenChange={onOpenChange} title={`History — ${asset?.name ?? ""}`}>
      {rows == null ? (
        <div className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted text-center py-6">No assignment history yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((h) => (
            <div key={h.id} className="flex items-start gap-2.5 text-sm">
              <span className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", h.returnedAt ? "bg-fg-subtle" : "bg-info")} />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{h.personName ?? "Unknown"}</span>
                <span className="text-fg-muted"> · {fmtDate(h.assignedAt)} → {h.returnedAt ? fmtDate(h.returnedAt) : "present"}</span>
                {h.notes && <div className="text-xs text-fg-subtle">{h.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </HrmsDialog>
  );
}

function ArchivedAssetsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function load() { listArchivedAssetsAction().then((res) => setRows(res.ok ? res.rows : [])); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setRows(null); load(); } }, [open]);

  function restore(id: number) {
    setBusyId(id);
    startTransition(async () => {
      const res = await archiveAssetAction(id, false);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Asset restored.", { tone: "success" });
      load();
    });
  }

  return (
    <HrmsDialog open={open} onOpenChange={onOpenChange} title="Archived assets">
      {rows == null ? (
        <div className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted text-center py-6">Nothing archived.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.name}</div>
                <div className="text-xs text-fg-subtle truncate">{[a.tag, a.category, a.serialNo].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <button type="button" disabled={busyId === a.id} onClick={() => restore(a.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-border bg-bg-subtle hover:bg-bg-muted">
                {busyId === a.id ? <Loader2 size={11} className="animate-spin" /> : <ArchiveRestore size={11} />} Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </HrmsDialog>
  );
}

/* Map a spreadsheet header cell to an import field. */
function headerKey(h: string): keyof AssetImportRow | "ignore" {
  const k = h.trim().toLowerCase();
  if (/asset\s*id|^tag$/.test(k)) return "tag";
  if (/category/.test(k)) return "category";
  if (/device\s*type|^type$/.test(k)) return "name"; // device type becomes the name fallback
  if (/brand|make|manufacturer/.test(k)) return "brand";
  if (/model/.test(k)) return "model";
  if (/serial/.test(k)) return "serialNo";
  if (/assigned/.test(k)) return "notes"; // holder → notes (assign later)
  if (/department|dept/.test(k)) return "department";
  if (/handover|hand\s*over/.test(k)) return "handoverDate";
  if (/location|site/.test(k)) return "location";
  if (/^name$/.test(k)) return "name";
  if (/note|remark/.test(k)) return "notes";
  return "ignore";
}

function parseExcelDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yr = y.length === 2 ? `20${y}` : y;
    const dt = new Date(`${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function parsePaste(text: string): AssetImportRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map(headerKey);
  const rows: AssetImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep);
    const row: AssetImportRow = { name: "" };
    let deviceType = "", brand = "", model = "", holder = "";
    headers.forEach((key, i) => {
      const val = (cells[i] ?? "").trim();
      if (!val || key === "ignore") return;
      if (key === "name") deviceType = val;
      else if (key === "brand") brand = val;
      else if (key === "model") model = val;
      else if (key === "notes" && headerCellIsHolder(lines[0].split(sep)[i])) holder = val;
      else if (key === "handoverDate") row.handoverDate = parseExcelDate(val);
      else (row[key] as string) = val;
    });
    // Build a human name: "Brand Model" or fall back to device type.
    row.name = [brand, model].filter(Boolean).join(" ") || deviceType || row.name;
    const extra = [deviceType && !row.name.includes(deviceType) ? deviceType : "", holder ? `Holder: ${holder}` : ""].filter(Boolean).join(" · ");
    if (extra) row.notes = [row.notes, extra].filter(Boolean).join(" · ");
    if (row.name.trim()) rows.push(row);
  }
  return rows;
}

function headerCellIsHolder(h: string | undefined): boolean {
  return !!h && /assigned/i.test(h);
}

function ImportDialog({
  open,
  onOpenChange,
  companies,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: Lite[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [companyId, setCompanyId] = useState<string>("");

  const parsed = useMemo(() => parsePaste(text), [text]);

  function submit() {
    if (parsed.length === 0) { toast("Paste rows including a header line first.", { tone: "warn" }); return; }
    startTransition(async () => {
      const res = await importAssetsAction(parsed, companyId ? parseInt(companyId, 10) : null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Imported ${res.id} asset${res.id === 1 ? "" : "s"}.`, { tone: "success" });
      setText("");
      onOpenChange(false);
    });
  }

  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import assets from a spreadsheet"
      width={640}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="sm" loading={pending} disabled={parsed.length === 0} onClick={submit}>
            Import {parsed.length > 0 ? `${parsed.length} ` : ""}asset{parsed.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-fg-muted">
          Copy the rows from Excel (<strong>include the header line</strong>) and paste below. Columns recognised:
          Asset ID, Category, Device Type, Brand, Model, Serial Number, Assigned To, Department, Handover date, Location, Notes.
          Everything imports <strong>in store</strong> — assign holders afterwards.
        </p>
        <div>
          <FieldLabel>Owning company</FieldLabel>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={SELECT_CLASS}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Paste rows</FieldLabel>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"Asset ID\tCategory\tDevice Type\tBrand\tModel\tSerial Number\t…\nLPT-001\tCOMPUTER\tLaptop\tLenovo\tIDEAPAD 3i\t…"}
            className={cn(input, "font-mono text-xs whitespace-pre")}
          />
        </div>
        {text.trim() && (
          <div className="text-xs text-fg-muted">
            {parsed.length > 0
              ? <><strong className="text-fg">{parsed.length}</strong> row{parsed.length === 1 ? "" : "s"} ready · first: <span className="text-fg">{parsed[0].name}</span></>
              : "No rows detected — make sure the first line is the header."}
          </div>
        )}
      </div>
    </HrmsDialog>
  );
}

function AssignDialog({
  asset,
  people,
  onOpenChange,
}: {
  asset: AssetRow | null;
  people: Lite[];
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [personId, setPersonId] = useState<string>("");
  const [query, setQuery] = useState("");
  const open = asset != null;
  const reassign = !!asset?.assignedToPersonId;

  const matches = useMemo(
    () => people.filter((p) => p.id !== asset?.assignedToPersonId && p.name.toLowerCase().includes(query.toLowerCase())),
    [people, query, asset]
  );

  function submit() {
    if (!asset) return;
    const pid = parseInt(personId, 10);
    if (Number.isNaN(pid)) { toast("Pick a person.", { tone: "warn" }); return; }
    startTransition(async () => {
      const res = await assignAssetAction(asset.id, pid);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(reassign ? "Asset reassigned." : "Asset assigned.", { tone: "success" });
      setPersonId(""); setQuery("");
      onOpenChange(false);
    });
  }

  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${reassign ? "Reassign" : "Assign"} ${asset?.name ?? ""}`}
      width={440}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="sm" loading={pending} onClick={submit}>{reassign ? "Reassign" : "Assign"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <FieldLabel>Search people</FieldLabel>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a name…" className={input} />
        </div>
        <div>
          <FieldLabel>Assign to</FieldLabel>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} size={6} className={cn(input, "h-auto")}>
            {matches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {matches.length === 0 && <option disabled>No matching people</option>}
          </select>
        </div>
      </div>
    </HrmsDialog>
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

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Share ${asset?.name ?? ""}`}
      width={440}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="sm" loading={pending} onClick={submit}>Share asset</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-fg-muted">
          For kit a whole team shares (no single holder). Pick the team/company and one accountable custodian.
        </p>
        <div>
          <FieldLabel>Team / company</FieldLabel>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={SELECT_CLASS}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Custodian (accountable person)</FieldLabel>
          <Select value={custodianId} onChange={(e) => setCustodianId(e.target.value)} className={SELECT_CLASS}>
            <option value="">—</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>
    </HrmsDialog>
  );
}

function AssetDialog({
  open,
  onOpenChange,
  editing,
  companies,
  people,
  vendors,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AssetRow | null;
  companies: Lite[];
  people: Lite[];
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

  // What the asset is currently assigned to — drives the assignee select.
  const isShared = !!editing && editing.status === "assigned" && !editing.assignedToPersonId &&
    (!!editing.assignedToCompanyName || !!editing.custodianName);
  const assigneeWas = !editing ? "store"
    : editing.assignedToPersonId ? String(editing.assignedToPersonId)
    : isShared ? "shared" : "store";

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit asset" : "Add an asset"}
      width={560}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" loading={pending} form="asset-form">{editing ? "Save changes" : "Add asset"}</Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={onSubmit} className="space-y-3">
        <div>
          <FieldLabel>Name *</FieldLabel>
          <input name="name" required defaultValue={editing?.name ?? ""} placeholder="e.g. Dell Latitude 5420" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Asset tag</FieldLabel>
            <input name="tag" defaultValue={editing?.tag ?? ""} placeholder="LPT-001" className={input} />
          </div>
          <div>
            <FieldLabel>Category</FieldLabel>
            <Combobox name="category" options={[...ASSET_CATEGORIES]} defaultValue={editing?.category ?? ""} placeholder="Type or pick…" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Brand</FieldLabel>
            <input name="brand" defaultValue={editing?.brand ?? ""} placeholder="e.g. HP" className={input} />
          </div>
          <div>
            <FieldLabel>Model</FieldLabel>
            <input name="model" defaultValue={editing?.model ?? ""} placeholder="e.g. Probook i5" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Serial number</FieldLabel>
            <input name="serialNo" defaultValue={editing?.serialNo ?? ""} className={input} />
          </div>
          <div>
            <FieldLabel>Department</FieldLabel>
            <input name="department" defaultValue={editing?.department ?? ""} placeholder="e.g. Operations" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Owning company</FieldLabel>
            <Select name="companyId" defaultValue={editing?.companyId ?? ""} className={SELECT_CLASS}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Handover date</FieldLabel>
            <input type="date" name="handoverDate" defaultValue={editing?.assignedAt ? editing.assignedAt.slice(0, 10) : ""} className={input} />
          </div>
        </div>
        <div>
          <FieldLabel>Assigned to</FieldLabel>
          <input type="hidden" name="assigneeWas" value={assigneeWas} />
          <Select name="assigneeId" defaultValue={assigneeWas} className={SELECT_CLASS}>
            <option value="store">— In store (unassigned) —</option>
            {isShared && <option value="shared">Shared / team — leave as is</option>}
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <p className="text-xs text-fg-subtle mt-1">Change this to correct or move who holds the asset.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Supplier (vendor)</FieldLabel>
            <Select name="vendorId" defaultValue={editing?.vendorId ?? ""} className={SELECT_CLASS}>
              <option value="">—</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Location / site</FieldLabel>
            <input name="location" defaultValue={editing?.location ?? ""} placeholder="e.g. Head Office" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Purchase date</FieldLabel>
            <input type="date" name="purchaseDate" defaultValue={editing?.purchaseDate ? editing.purchaseDate.slice(0, 10) : ""} className={input} />
          </div>
          <div>
            <FieldLabel>Purchase cost</FieldLabel>
            <input type="number" step="0.01" name="purchaseCost" defaultValue={editing?.purchaseCost ?? ""} className={input} />
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
