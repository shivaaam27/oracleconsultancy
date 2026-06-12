"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Search, Plus, X, Wrench, Pencil, Archive, Loader2, Upload, Minus, MapPin, ArrowLeftRight, PackageMinus, History, Clock, MoreHorizontal } from "lucide-react";
import { Badge, Button } from "./ui";
import { IconAction, MenuItem } from "./register-ui";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import {
  TOOL_CONDITION_LABELS,
  TOOL_CONDITION_TONE,
  type SiteToolRow,
  type SiteToolMovementRow,
  type ToolCondition,
  isLowStock,
} from "@/lib/site-tools-shared";
import {
  createSiteToolAction,
  updateSiteToolAction,
  setSiteToolQuantityAction,
  setSiteToolConditionAction,
  transferSiteToolAction,
  writeOffSiteToolAction,
  listSiteToolMovementsAction,
  archiveSiteToolAction,
  importSiteToolsAction,
  type SiteToolImportRow,
} from "@/app/hrms/assets/site-tools-actions";

type Lite = { id: number; name: string };

export function SiteToolsTable({
  tools,
  companies,
}: {
  tools: SiteToolRow[];
  companies: Lite[];
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<SiteToolRow | null>(null);
  const [transferring, setTransferring] = useState<SiteToolRow | null>(null);
  const [writingOff, setWritingOff] = useState<SiteToolRow | null>(null);
  const [history, setHistory] = useState<SiteToolRow | "all" | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const locations = useMemo(
    () => Array.from(new Set(tools.map((t) => t.location).filter(Boolean) as string[])).sort(),
    [tools]
  );

  const filtered = useMemo(() => {
    let rows = tools.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.specification?.toLowerCase().includes(q) ?? false) ||
          (t.location?.toLowerCase().includes(q) ?? false)
      );
    }
    if (locationFilter !== "all") rows = rows.filter((t) => t.location === locationFilter);
    if (conditionFilter !== "all") rows = rows.filter((t) => t.condition === conditionFilter);
    if (lowOnly) rows = rows.filter(isLowStock);
    return rows;
  }, [tools, search, locationFilter, conditionFilter, lowOnly]);

  const lowCount = useMemo(() => tools.filter(isLowStock).length, [tools]);

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
  function openEdit(t: SiteToolRow) { setEditing(t); setDialogOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tool, spec, site…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
          <FluidSelect
            value={locationFilter}
            onSelect={setLocationFilter}
            options={[{ value: "all", label: "All sites" }, ...locations.map((l) => ({ value: l, label: l }))]}
          />
          <FluidSelect
            value={conditionFilter}
            onSelect={setConditionFilter}
            options={[
              { value: "all", label: "All conditions" },
              ...(Object.keys(TOOL_CONDITION_LABELS) as ToolCondition[]).map((c) => ({ value: c, label: TOOL_CONDITION_LABELS[c] })),
            ]}
          />
          {lowCount > 0 && (
            <button type="button" onClick={() => setLowOnly((v) => !v)}
              className={cn("inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium ring-1 transition-colors shrink-0 whitespace-nowrap",
                lowOnly ? "bg-warn/15 text-warn ring-warn/40" : "ring-border text-fg-muted hover:text-fg bg-bg-subtle/60")}>
              Low stock {lowCount}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <IconAction title="Movement history" onClick={() => setHistory("all")}><History size={15} /></IconAction>
          <IconAction title="Import" onClick={() => setImportOpen(true)}><Upload size={15} /></IconAction>
          <Button size="sm" onClick={openNew} className="ml-auto sm:ml-0"><Plus size={14} /> Add tool</Button>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {filtered.map((t) => {
            const busy = busyId === t.id;
            const meta = [t.specification, t.location].filter(Boolean).join(" · ");
            return (
              <div key={t.id} className={cn("flex items-center gap-3 px-3 sm:px-3.5 py-3 transition-colors hover:bg-bg-subtle/40", busy && "opacity-60")}>
                <span className="h-9 w-9 rounded-xl bg-bg-muted ring-1 ring-border flex items-center justify-center text-fg-muted shrink-0">
                  <Wrench size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{t.name}</span>
                    <Badge tone={TOOL_CONDITION_TONE[t.condition]}>{TOOL_CONDITION_LABELS[t.condition]}</Badge>
                    {isLowStock(t) && <Badge tone="warn">Low stock</Badge>}
                  </div>
                  <div className="text-xs text-fg-muted truncate mt-0.5 inline-flex items-center gap-1">
                    {t.location && <MapPin size={11} className="text-fg-subtle" />}{meta || "—"}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="inline-flex items-center rounded-lg ring-1 ring-border bg-bg-subtle shrink-0">
                    <button type="button" disabled={busy || t.quantity <= 0} title="Decrease"
                      onClick={() => run(t.id, () => setSiteToolQuantityAction(t.id, t.quantity - 1))}
                      className="h-8 w-7 inline-flex items-center justify-center text-fg-muted hover:text-fg disabled:opacity-40">
                      <Minus size={12} />
                    </button>
                    <span className="px-1.5 text-sm font-medium tabular min-w-[1.75rem] text-center">{t.quantity}</span>
                    <button type="button" disabled={busy} title="Increase"
                      onClick={() => run(t.id, () => setSiteToolQuantityAction(t.id, t.quantity + 1))}
                      className="h-8 w-7 inline-flex items-center justify-center text-fg-muted hover:text-fg">
                      <Plus size={12} />
                    </button>
                  </div>
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
                        className="z-[60] min-w-[190px] glass-menu rounded-xl p-1 shadow-pill ring-1 ring-border/70 text-sm">
                        <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-fg-subtle">Condition</DropdownMenu.Label>
                        {(Object.keys(TOOL_CONDITION_LABELS) as ToolCondition[]).map((c) => (
                          <MenuItem key={c} icon={<span className={cn("h-2 w-2 rounded-full", c === "good" ? "bg-success" : c === "needs_repair" ? "bg-warn" : "bg-danger")} />}
                            onSelect={() => { if (c !== t.condition) run(t.id, () => setSiteToolConditionAction(t.id, c), "Condition updated."); }}>
                            {TOOL_CONDITION_LABELS[c]}{c === t.condition ? " ✓" : ""}
                          </MenuItem>
                        ))}
                        <DropdownMenu.Separator className="h-px bg-border my-1" />
                        <MenuItem icon={<ArrowLeftRight size={14} />} onSelect={() => setTransferring(t)}>Move to another site…</MenuItem>
                        <MenuItem icon={<PackageMinus size={14} />} onSelect={() => setWritingOff(t)}>Write off…</MenuItem>
                        <MenuItem icon={<Clock size={14} />} onSelect={() => setHistory(t)}>History</MenuItem>
                        <MenuItem icon={<Pencil size={14} />} onSelect={() => openEdit(t)}>Edit</MenuItem>
                        <DropdownMenu.Separator className="h-px bg-border my-1" />
                        <MenuItem icon={<Archive size={14} />} danger onSelect={() => run(t.id, () => archiveSiteToolAction(t.id, true), "Tool archived.")}>Archive</MenuItem>
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
          {tools.length === 0 ? "No site tools yet. Add your first or import a list." : "No tools match these filters."}
        </div>
      )}

      <ToolDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} companies={companies} />
      <ToolImportDialog open={importOpen} onOpenChange={setImportOpen} companies={companies} />
      <TransferDialog tool={transferring} sites={locations} onDone={() => { setTransferring(null); }} onOpenChange={(o) => { if (!o) setTransferring(null); }} />
      <WriteOffDialog tool={writingOff} onOpenChange={(o) => { if (!o) setWritingOff(null); }} />
      <HistoryDialog target={history} onOpenChange={(o) => { if (!o) setHistory(null); }} />
    </div>
  );
}

function TransferDialog({
  tool,
  sites,
  onDone,
  onOpenChange,
}: {
  tool: SiteToolRow | null;
  sites: string[];
  onDone: () => void;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState("");
  const [dest, setDest] = useState("");
  const [newSite, setNewSite] = useState("");
  const open = tool != null;

  function submit() {
    if (!tool) return;
    const n = parseInt(qty || String(tool.quantity), 10);
    const to = (dest === "__new__" ? newSite : dest).trim();
    if (!to) { toast("Choose or type a destination site.", { tone: "warn" }); return; }
    startTransition(async () => {
      const res = await transferSiteToolAction(tool.id, n, to);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Moved ${n} to ${to}.`, { tone: "success" });
      setQty(""); setDest(""); setNewSite("");
      onDone();
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
            <Dialog.Title className="text-sm font-semibold">Move {tool?.name}</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-fg-muted">{tool?.quantity} at {tool?.location ?? "—"}. Move some or all to another site; matching stock there is merged.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Quantity</label>
                <input type="number" min="1" max={tool?.quantity} value={qty} onChange={(e) => setQty(e.target.value)} placeholder={String(tool?.quantity ?? "")} className={input} />
              </div>
              <div>
                <label className={label}>To site</label>
                <select value={dest} onChange={(e) => setDest(e.target.value)} className={input}>
                  <option value="">—</option>
                  {sites.filter((s) => s !== tool?.location).map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="__new__">+ New site…</option>
                </select>
              </div>
            </div>
            {dest === "__new__" && (
              <div>
                <label className={label}>New site name</label>
                <input value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="e.g. Matongo" className={input} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" size="sm" loading={pending} onClick={submit}>Move</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WriteOffDialog({ tool, onOpenChange }: { tool: SiteToolRow | null; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const open = tool != null;

  function submit() {
    if (!tool) return;
    const n = parseInt(qty || "1", 10);
    startTransition(async () => {
      const res = await writeOffSiteToolAction(tool.id, n, reason);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Wrote off ${n} ${tool.name}.`, { tone: "success" });
      setQty(""); setReason("");
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
            <Dialog.Title className="text-sm font-semibold">Write off {tool?.name}</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-fg-muted">Remove lost or disposed units from {tool?.location ?? "this site"} ({tool?.quantity} on hand). This is recorded in history.</p>
            <div>
              <label className={label}>Quantity to write off</label>
              <input type="number" min="1" max={tool?.quantity} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" className={input} />
            </div>
            <div>
              <label className={label}>Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Lost on site / broken beyond repair" className={input} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" size="sm" loading={pending} onClick={submit}>Write off</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function movementText(m: SiteToolMovementRow): string {
  switch (m.type) {
    case "transfer": return `Moved ${m.quantity} from ${m.fromLocation ?? "—"} to ${m.toLocation ?? "—"}`;
    case "condition": return `Condition ${m.fromCondition ?? "—"} → ${m.toCondition ?? "—"}`;
    case "write_off": return `Wrote off ${m.quantity}${m.reason ? ` — ${m.reason}` : ""}`;
    default: return m.type;
  }
}

function HistoryDialog({ target, onOpenChange }: { target: SiteToolRow | "all" | null; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = useState<SiteToolMovementRow[] | null>(null);
  const open = target != null;
  const single = target && target !== "all" ? target : null;

  useEffect(() => {
    if (!open) { setRows(null); return; }
    let cancelled = false;
    listSiteToolMovementsAction(single ? single.id : undefined).then((res) => {
      if (!cancelled) setRows(res.ok ? res.rows : []);
    });
    return () => { cancelled = true; };
  }, [open, single]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(520px,calc(100vw-2rem))] max-h-[80dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">{single ? `History — ${single.name}` : "Tool movement history"}</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>
          <div className="p-5">
            {rows == null ? (
              <div className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 size={15} className="animate-spin" /> Loading…</div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-fg-muted text-center py-6">No movements recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((m) => (
                  <div key={m.id} className="flex items-start gap-2.5 text-sm">
                    <span className="h-2 w-2 rounded-full bg-accent mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      {!single && <span className="font-medium">{m.toolName} · </span>}
                      <span>{movementText(m)}</span>
                      <div className="text-[11px] text-fg-subtle">{fmtWhen(m.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ToolDialog({
  open,
  onOpenChange,
  editing,
  companies,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: SiteToolRow | null;
  companies: Lite[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = editing ? await updateSiteToolAction(editing.id, fd) : await createSiteToolAction(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(editing ? "Tool updated." : "Tool added.", { tone: "success" });
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
            <Dialog.Title className="text-sm font-semibold">{editing ? "Edit tool" : "Add a tool"}</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle">
              <X size={14} />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="p-5 space-y-3">
            <div>
              <label className={label}>Tool / equipment name *</label>
              <input name="name" required defaultValue={editing?.name ?? ""} placeholder="e.g. Adjustable spanner" className={input} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label}>Quantity</label>
                <input type="number" min="0" step="1" name="quantity" defaultValue={editing?.quantity ?? 1} className={input} />
              </div>
              <div>
                <label className={label}>Min level</label>
                <input type="number" min="0" step="1" name="minQty" defaultValue={editing?.minQty ?? 0} className={input} />
              </div>
              <div>
                <label className={label}>Condition</label>
                <select name="condition" defaultValue={editing?.condition ?? "good"} className={input}>
                  {(Object.keys(TOOL_CONDITION_LABELS) as ToolCondition[]).map((c) => (
                    <option key={c} value={c}>{TOOL_CONDITION_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Specification</label>
                <input name="specification" defaultValue={editing?.specification ?? ""} placeholder="e.g. Size 30cm" className={input} />
              </div>
              <div>
                <label className={label}>Site / location</label>
                <input name="location" defaultValue={editing?.location ?? ""} placeholder="e.g. Police Post" className={input} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Owning company</label>
                <select name="companyId" defaultValue={editing?.companyId ?? ""} className={input}>
                  <option value="">—</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Purchased date</label>
                <input type="date" name="purchasedDate" defaultValue={editing?.purchasedDate ? editing.purchasedDate.slice(0, 10) : ""} className={input} />
              </div>
            </div>
            <div>
              <label className={label}>Remark</label>
              <textarea name="remark" rows={2} defaultValue={editing?.remark ?? ""} className={input} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={pending}>{editing ? "Save changes" : "Add tool"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function toolHeaderKey(h: string): keyof SiteToolImportRow | "ignore" {
  const k = h.trim().toLowerCase();
  if (/quantity|qty|count/.test(k)) return "quantity";
  if (/spec/.test(k)) return "specification";
  if (/location|site/.test(k)) return "location";
  if (/condition/.test(k)) return "condition";
  if (/purchas|bought|date/.test(k)) return "purchasedDate";
  if (/remark|note/.test(k)) return "remark";
  if (/tool|equip|name|^item$/.test(k)) return "name";
  return "ignore";
}

function parseToolDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // dd-MMM-yy / dd-MMM-yyyy
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yr = y.length === 2 ? `20${y}` : y;
    const d2 = new Date(`${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
    return isNaN(d2.getTime()) ? null : d2.toISOString();
  }
  return null;
}

function parseCondition(v: string): ToolCondition {
  const k = v.trim().toLowerCase().replace(/\s+/g, "");
  if (k === "notgood" || /repair|broke|damag|faulty/.test(k)) return "needs_repair";
  if (/retir|disposed|scrap/.test(k)) return "retired";
  return "good";
}

function parseToolPaste(text: string): SiteToolImportRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map(toolHeaderKey);
  const rows: SiteToolImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep);
    const row: SiteToolImportRow = { name: "" };
    headers.forEach((key, i) => {
      const val = (cells[i] ?? "").trim();
      if (!val || key === "ignore") return;
      if (key === "quantity") row.quantity = parseInt(val.replace(/[^\d]/g, ""), 10) || 1;
      else if (key === "condition") row.condition = parseCondition(val);
      else if (key === "purchasedDate") row.purchasedDate = parseToolDate(val);
      else (row[key] as string) = val;
    });
    if (row.name.trim()) rows.push(row);
  }
  return rows;
}

function ToolImportDialog({
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

  const parsed = useMemo(() => parseToolPaste(text), [text]);

  function submit() {
    if (parsed.length === 0) { toast("Paste rows including a header line first.", { tone: "warn" }); return; }
    startTransition(async () => {
      const res = await importSiteToolsAction(parsed, companyId ? parseInt(companyId, 10) : null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Imported ${res.id} tool${res.id === 1 ? "" : "s"}.`, { tone: "success" });
      setText("");
      onOpenChange(false);
    });
  }

  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(640px,calc(100vw-2rem))] max-h-[88dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">Import tools from a spreadsheet</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle">
              <X size={14} />
            </Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-fg-muted">
              Copy the rows from Excel (<strong>include the header line</strong>) and paste below. Columns recognised:
              Tool/Equipment Name, Quantity, Specification, Location/Site, Condition, Purchased Date, Remark.
            </p>
            <div>
              <label className={label}>Owning company</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={input}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Paste rows</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={"Tool/Equipment Name\tQuantity\tSpecification\tLocation/Site\tCondition\nAdjustable Spaner\t4\tSize 30cm\tPolice Post\tGood"}
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
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" size="sm" loading={pending} disabled={parsed.length === 0} onClick={submit}>
                Import {parsed.length > 0 ? `${parsed.length} ` : ""}tool{parsed.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
