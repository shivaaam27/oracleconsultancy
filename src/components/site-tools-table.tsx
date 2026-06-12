"use client";

import { useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, Plus, X, Wrench, Pencil, Archive, Loader2, Upload, Minus, MapPin } from "lucide-react";
import { Badge, Button } from "./ui";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import {
  TOOL_CONDITION_LABELS,
  TOOL_CONDITION_TONE,
  type SiteToolRow,
  type ToolCondition,
} from "@/lib/site-tools-shared";
import {
  createSiteToolAction,
  updateSiteToolAction,
  setSiteToolQuantityAction,
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<SiteToolRow | null>(null);
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
    return rows;
  }, [tools, search, locationFilter, conditionFilter]);

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
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tool, spec, site…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
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
        <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
        <Button size="sm" onClick={openNew}><Plus size={14} /> Add tool</Button>
      </div>

      {filtered.length > 0 ? (
        <div className="glass elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {filtered.map((t) => {
            const busy = busyId === t.id;
            const meta = [t.specification, t.location].filter(Boolean).join(" · ");
            return (
              <div key={t.id} className={cn("flex flex-wrap items-center gap-3 px-3.5 py-2.5", busy && "opacity-60")}>
                <span className="h-9 w-9 rounded-full bg-bg-muted ring-1 ring-border flex items-center justify-center text-fg-muted shrink-0">
                  <Wrench size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{t.name}</span>
                    <Badge tone={TOOL_CONDITION_TONE[t.condition]}>{TOOL_CONDITION_LABELS[t.condition]}</Badge>
                  </div>
                  <div className="text-xs text-fg-muted truncate mt-0.5 inline-flex items-center gap-1">
                    {t.location && <MapPin size={11} className="text-fg-subtle" />}{meta || "—"}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex items-center rounded-md ring-1 ring-border bg-bg-subtle">
                    <button type="button" disabled={busy || t.quantity <= 0} title="Decrease"
                      onClick={() => run(t.id, () => setSiteToolQuantityAction(t.id, t.quantity - 1))}
                      className="h-7 w-7 inline-flex items-center justify-center text-fg-muted hover:text-fg disabled:opacity-40">
                      <Minus size={12} />
                    </button>
                    <span className="px-2 text-sm font-medium tabular min-w-[2rem] text-center">{t.quantity}</span>
                    <button type="button" disabled={busy} title="Increase"
                      onClick={() => run(t.id, () => setSiteToolQuantityAction(t.id, t.quantity + 1))}
                      className="h-7 w-7 inline-flex items-center justify-center text-fg-muted hover:text-fg">
                      <Plus size={12} />
                    </button>
                  </div>
                  <button type="button" disabled={busy} title="Edit" onClick={() => openEdit(t)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-accent hover:bg-bg-subtle">
                    <Pencil size={13} />
                  </button>
                  <button type="button" disabled={busy} title="Archive"
                    onClick={() => run(t.id, () => archiveSiteToolAction(t.id, true), "Tool archived.")}
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
          {tools.length === 0 ? "No site tools yet. Add your first or import a list." : "No tools match these filters."}
        </div>
      )}

      <ToolDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} companies={companies} />
      <ToolImportDialog open={importOpen} onOpenChange={setImportOpen} companies={companies} />
    </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Quantity</label>
                <input type="number" min="0" step="1" name="quantity" defaultValue={editing?.quantity ?? 1} className={input} />
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
