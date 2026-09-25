"use client";

/**
 * The pop-ups of the Studio Assets, Tools & Vendors screens. Every one posts to
 * the SAME server actions the old register used (plus the 0171 service log),
 * so nothing about how an asset is stored changed — only how it is handled.
 *
 *  - AssetFormSheet    add / edit an asset (warranty included)
 *  - HandOverSheet     give an asset to a person, or share it with a team
 *  - ReturnSheet       take an asset back into the store
 *  - ServiceSheet      log a service, repair or inspection (+ workshop in/out)
 *  - ToolFormSheet     add / edit a site-tool line
 *  - ToolMoveSheet     count, move or write off tool units, with the history
 *  - VendorFormSheet   add / edit a supplier
 */
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, FileUp, Loader2, Package, Truck, Undo2, UserPlus, Wrench, Building2 } from "lucide-react";
import { StudioSheet } from "@/components/studio/sheet";
import { stBtn } from "@/components/studio/kit";
import { SelectField } from "@/components/forms/select-field";
import { FluidSelect } from "@/components/forms/fluid-select";
import { Combobox } from "@/components/forms/combobox";
import { DateInput } from "@/components/forms/date-input";
import { useToast } from "@/components/shell/toast";
import {
  createAssetAction, updateAssetAction, assignAssetAction, assignAssetSharedAction, returnAssetAction, addAssetServiceAction, importAssetsAction,
} from "@/app/hrms/assets/actions";
import {
  createSiteToolAction, updateSiteToolAction, setSiteToolQuantityAction, transferSiteToolAction, writeOffSiteToolAction, listSiteToolMovementsAction, importSiteToolsAction,
} from "@/app/hrms/assets/site-tools-actions";
import { createVendorAction, updateVendorAction } from "@/app/hrms/vendors/actions";
import { ASSET_CATEGORIES, ASSET_SERVICE_LABELS, type AssetRow, type AssetServiceKind } from "@/lib/operations/assets-shared";
import { TOOL_CONDITION_LABELS, type SiteToolRow, type SiteToolMovementRow, type ToolCondition } from "@/lib/operations/site-tools-shared";
import { VENDOR_CATEGORIES, type VendorRow } from "@/lib/operations/vendors-shared";
import { FIELD, AREA, Field, Seg, ymd, day } from "./bits";
import { parseAssetPaste, parseToolPaste } from "@/lib/operations/asset-import";
import { cn } from "@/lib/cn";

export type Opt = { id: number; name: string };
export type AssetLists = { companies: Opt[]; people: Opt[]; vendors: Opt[]; locations: string[]; categories: string[] };

type Res = { ok: true; id?: number } | { ok: false; error: string };

/** Run an action, toast the outcome, refresh the page, close on success. */
function useAct(onDone: () => void) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, ok: string) =>
    start(async () => {
      const r = await fn().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong." }));
      if (!r.ok) { toast(r.error, { tone: "warn" }); return; }
      toast(ok, { tone: "success" });
      onDone();
      router.refresh();
    });
  return { pending, run };
}

function Foot({ pending, label, onClose, form, disabled }: { pending: boolean; label: string; onClose: () => void; form?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} className={stBtn.ghost}>Cancel</button>
      <button type={form ? "submit" : "button"} form={form} disabled={pending || disabled} className={cn(stBtn.dark, "disabled:opacity-40")}>
        {pending && <Loader2 size={14} className="animate-spin" />}{label}
      </button>
    </div>
  );
}

const opts = (xs: Opt[], none?: string) => [...(none ? [{ value: "", label: none }] : []), ...xs.map((x) => ({ value: String(x.id), label: x.name }))];

/* ------------------------------------------------------------ asset form -- */

export function AssetFormSheet({ open, onClose, asset, lists, onCreated }: {
  open: boolean; onClose: () => void; asset: AssetRow | null; lists: AssetLists; onCreated?: (id: number) => void;
}) {
  const { pending, run } = useAct(onClose);
  const cats = useMemo(() => [...new Set([...ASSET_CATEGORIES, ...lists.categories])].sort(), [lists.categories]);
  const editing = !!asset;
  return (
    <StudioSheet open={open} onClose={onClose} width={620} icon={<Package size={15} />} title={editing ? `Edit ${asset.name}` : "Add an asset"}
      footer={<Foot pending={pending} label={editing ? "Save changes" : "Add asset"} onClose={onClose} form="asset-form" />}>
      <form id="asset-form" key={asset?.id ?? "new"} className="st-form grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(async () => {
            const r = editing ? await updateAssetAction(asset.id, fd) : await createAssetAction(fd);
            if (r.ok && !editing && r.id) onCreated?.(r.id);
            return r;
          }, editing ? "Saved." : "Asset added.");
        }}>
        <Field label="Name *" className="sm:col-span-2"><input name="name" required autoFocus defaultValue={asset?.name ?? ""} placeholder="e.g. Dell Latitude 5440" className={FIELD} /></Field>
        <Field label="Category"><Combobox name="category" options={cats} defaultValue={asset?.category ?? ""} placeholder="Laptop, Phone…" className="w-full" /></Field>
        <Field label="Asset tag"><input name="tag" defaultValue={asset?.tag ?? ""} placeholder="LAP-001" className={FIELD} /></Field>
        <Field label="Brand"><input name="brand" defaultValue={asset?.brand ?? ""} className={FIELD} /></Field>
        <Field label="Model"><input name="model" defaultValue={asset?.model ?? ""} className={FIELD} /></Field>
        <Field label="Serial number"><input name="serialNo" defaultValue={asset?.serialNo ?? ""} className={FIELD} /></Field>
        <Field label="Department"><input name="department" defaultValue={asset?.department ?? ""} className={FIELD} /></Field>
        <Field label="Belongs to company"><SelectField name="companyId" defaultValue={asset?.companyId ? String(asset.companyId) : ""} options={opts(lists.companies, "No company")} /></Field>
        <Field label="Where it lives"><Combobox name="location" options={lists.locations} defaultValue={asset?.location ?? ""} placeholder="HQ, Site office…" className="w-full" /></Field>
        <Field label="Bought from"><SelectField name="vendorId" defaultValue={asset?.vendorId ? String(asset.vendorId) : ""} options={opts(lists.vendors, "Not recorded")} /></Field>
        <Field label="Bought on"><span className="st-date block"><DateInput name="purchaseDate" defaultValue={ymd(asset?.purchaseDate ?? null)} /></span></Field>
        <Field label="Cost (TZS)"><input name="purchaseCost" inputMode="decimal" defaultValue={asset?.purchaseCost ?? ""} placeholder="0" className={FIELD} /></Field>
        <Field label="Warranty until"><span className="st-date block"><DateInput name="warrantyUntil" defaultValue={ymd(asset?.warrantyUntil ?? null)} placeholder="No warranty" /></span></Field>
        {asset?.status === "assigned" && <Field label="Handed over on"><span className="st-date block"><DateInput name="handoverDate" defaultValue={ymd(asset.assignedAt)} /></span></Field>}
        {!editing && <Field label="Give it straight to"><SelectField name="assigneeId" defaultValue="" options={[{ value: "", label: "Nobody — keep it in the store" }, ...opts(lists.people)]} /></Field>}
        <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={asset?.notes ?? ""} className={AREA} /></Field>
      </form>
    </StudioSheet>
  );
}

/* ------------------------------------------------------ an asset picker -- */

function AssetPick({ assets, value, onChange, placeholder }: { assets: AssetRow[]; value: number | null; onChange: (id: number | null) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const shown = (q ? assets.filter((a) => `${a.name} ${a.tag ?? ""} ${a.serialNo ?? ""} ${a.assignedToName ?? ""}`.toLowerCase().includes(q.toLowerCase())) : assets).slice(0, 60);
  return (
    <div className="flex flex-col gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={FIELD} />
      <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-[var(--sh-line,var(--st-line))]">
        {shown.map((a) => (
          <button key={a.id} type="button" onClick={() => onChange(a.id === value ? null : a.id)}
            className={cn("flex w-full items-center gap-2 border-b border-[var(--sh-line,var(--st-line-soft))] px-3 py-2 text-left text-[13px] last:border-0", a.id === value ? "bg-[var(--sh-hover,var(--st-page))] font-medium" : "hover:bg-[var(--sh-hover,var(--st-page))]")}>
            <span className="min-w-0 flex-1 truncate">{a.name}</span>
            <span className="shrink-0 truncate text-[11px] text-[var(--sh-muted,var(--st-muted))]">{a.assignedToName ?? a.assignedToCompanyName ?? a.tag ?? a.category ?? ""}</span>
          </button>
        ))}
        {shown.length === 0 && <div className="px-3 py-3 text-xs text-[var(--sh-muted,var(--st-muted))]">Nothing matches.</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- hand over -- */

export function HandOverSheet({ open, onClose, asset, pool, lists }: {
  open: boolean; onClose: () => void;
  /** The asset to hand over; null = pick one from `pool`. */
  asset: AssetRow | null; pool: AssetRow[]; lists: AssetLists;
}) {
  const { pending, run } = useAct(onClose);
  const [picked, setPicked] = useState<number | null>(null);
  const [mode, setMode] = useState<"person" | "team">("person");
  const [person, setPerson] = useState("");
  const [company, setCompany] = useState("");
  const [custodian, setCustodian] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { setPicked(null); setPerson(""); setCompany(""); setCustodian(""); setNote(""); setMode("person"); } }, [open]);
  const id = asset?.id ?? picked;
  const ready = !!id && (mode === "person" ? !!person : !!company || !!custodian);
  return (
    <StudioSheet open={open} onClose={onClose} width={520} icon={<UserPlus size={15} />} title={asset ? `Hand over ${asset.name}` : "Hand over an asset"}
      footer={<Foot pending={pending} disabled={!ready} label="Hand over" onClose={onClose} form="handover-form" />}>
      <form id="handover-form" className="st-form flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        if (!id) return;
        run(() => mode === "person"
          ? assignAssetAction(id, Number(person), note.trim() || null)
          : assignAssetSharedAction(id, company ? Number(company) : null, custodian ? Number(custodian) : null), "Handed over.");
      }}>
        {!asset && <Field label="Which asset (in the store)"><AssetPick assets={pool} value={picked} onChange={setPicked} placeholder="Find an asset…" /></Field>}
        <Seg value={mode} onChange={setMode} options={[["person", "To a person"], ["team", "Shared with a team"]]} />
        {mode === "person" ? (
          <>
            <Field label="Who gets it"><SelectFieldControlled value={person} onChange={setPerson} options={opts(lists.people)} placeholder="Choose a person" /></Field>
            <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. with charger and bag" className={FIELD} /></Field>
            <p className="m-0 text-xs text-[var(--sh-muted,var(--st-muted))]">It comes back to the store on its own when they leave. Print the handover receipt from the asset afterwards.</p>
          </>
        ) : (
          <>
            <Field label="Team (company)"><SelectFieldControlled value={company} onChange={setCompany} options={opts(lists.companies)} placeholder="Choose a company" /></Field>
            <Field label="Looked after by"><SelectFieldControlled value={custodian} onChange={setCustodian} options={opts(lists.people, "Nobody in particular")} placeholder="Custodian" /></Field>
          </>
        )}
      </form>
    </StudioSheet>
  );
}

/** SelectField's controlled twin (the sheets need the value to enable Save). */
function SelectFieldControlled({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  return <FluidSelect value={value} options={options} onSelect={onChange} placeholder={placeholder} className="w-full" />;
}

/* ----------------------------------------------------------------- return -- */

export function ReturnSheet({ open, onClose, asset, pool }: { open: boolean; onClose: () => void; asset: AssetRow | null; pool: AssetRow[] }) {
  const { pending, run } = useAct(onClose);
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { setPicked(null); setNote(""); } }, [open]);
  const id = asset?.id ?? picked;
  const a = asset ?? pool.find((x) => x.id === picked) ?? null;
  return (
    <StudioSheet open={open} onClose={onClose} width={520} icon={<Undo2 size={15} />} title={asset ? `Return ${asset.name}` : "Return to the store"}
      footer={<Foot pending={pending} disabled={!id} label="Back to the store" onClose={onClose} form="return-form" />}>
      <form id="return-form" className="st-form flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (id) run(() => returnAssetAction(id, note.trim() || null), "Back in the store."); }}>
        {!asset && <Field label="Which asset (handed out)"><AssetPick assets={pool} value={picked} onChange={setPicked} placeholder="Find by asset or person…" /></Field>}
        {a && <p className="m-0 text-[13px]">{a.name} comes back from <b className="font-medium">{a.assignedToName ?? a.assignedToCompanyName ?? "its holder"}</b>.</p>}
        <Field label="Condition / note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. screen scratched" className={FIELD} /></Field>
      </form>
    </StudioSheet>
  );
}

/* ---------------------------------------------------------------- service -- */

export function ServiceSheet({ open, onClose, asset, pool, vendors }: {
  open: boolean; onClose: () => void; asset: AssetRow | null; pool: AssetRow[]; vendors: Opt[];
}) {
  const { pending, run } = useAct(onClose);
  const [picked, setPicked] = useState<number | null>(null);
  const [kind, setKind] = useState<AssetServiceKind>("service");
  useEffect(() => { if (open) { setPicked(null); setKind(asset?.status === "maintenance" ? "repair" : "service"); } }, [open, asset?.status]);
  const id = asset?.id ?? picked;
  const status = asset?.status ?? pool.find((x) => x.id === picked)?.status;
  return (
    <StudioSheet open={open} onClose={onClose} width={560} icon={<Wrench size={15} />} title={asset ? `Log work on ${asset.name}` : "Log a service or repair"}
      footer={<Foot pending={pending} disabled={!id} label="Log it" onClose={onClose} form="service-form" />}>
      <form id="service-form" className="st-form grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        if (!id) return;
        const fd = new FormData(e.currentTarget);
        fd.set("assetId", String(id));
        fd.set("kind", kind);
        run(() => addAssetServiceAction(fd), "Logged.");
      }}>
        {!asset && <Field label="Which asset" className="sm:col-span-2"><AssetPick assets={pool} value={picked} onChange={setPicked} placeholder="Find an asset…" /></Field>}
        <div className="sm:col-span-2"><Seg value={kind} onChange={setKind} options={(Object.keys(ASSET_SERVICE_LABELS) as AssetServiceKind[]).map((k) => [k, ASSET_SERVICE_LABELS[k]])} /></div>
        <Field label="When"><span className="st-date block"><DateInput name="happenedOn" defaultValue={ymd(new Date().toISOString())} /></span></Field>
        <Field label="Done by"><SelectField name="vendorId" defaultValue="" options={opts(vendors, "In-house / not recorded")} /></Field>
        <Field label="Cost (TZS)"><input name="cost" inputMode="decimal" placeholder="0" className={FIELD} /></Field>
        <Field label="Afterwards">
          <SelectField name="after" defaultValue={status === "maintenance" ? "in_store" : ""} options={[
            { value: "", label: "Leave it as it is" },
            { value: "maintenance", label: "It stays in the workshop" },
            { value: "in_store", label: "Back in the store, working" },
          ]} />
        </Field>
        <Field label="What was done" className="sm:col-span-2"><textarea name="notes" rows={3} placeholder="e.g. replaced battery, cleaned fan" className={AREA} /></Field>
        <p className="m-0 text-xs text-[var(--sh-muted,var(--st-muted))] sm:col-span-2">Sending it to the workshop takes it back from whoever holds it. An inspection also counts as seeing it in the stock-take.</p>
      </form>
    </StudioSheet>
  );
}

/* -------------------------------------------------------------- tool form -- */

export function ToolFormSheet({ open, onClose, tool, lists }: { open: boolean; onClose: () => void; tool: SiteToolRow | null; lists: AssetLists }) {
  const { pending, run } = useAct(onClose);
  const editing = !!tool;
  return (
    <StudioSheet open={open} onClose={onClose} width={600} icon={<Truck size={15} />} title={editing ? `Edit ${tool.name}` : "Add site tools"}
      footer={<Foot pending={pending} label={editing ? "Save changes" : "Add tools"} onClose={onClose} form="tool-form" />}>
      <form id="tool-form" key={tool?.id ?? "new"} className="st-form grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => (editing ? updateSiteToolAction(tool.id, fd) : createSiteToolAction(fd)), editing ? "Saved." : "Tools added.");
      }}>
        <Field label="Tool *" className="sm:col-span-2"><input name="name" required autoFocus defaultValue={tool?.name ?? ""} placeholder="e.g. Wheelbarrow" className={FIELD} /></Field>
        <Field label="Specification" className="sm:col-span-2"><input name="specification" defaultValue={tool?.specification ?? ""} placeholder="Size, make, power…" className={FIELD} /></Field>
        <Field label="How many"><input name="quantity" inputMode="numeric" defaultValue={tool?.quantity ?? 1} className={FIELD} /></Field>
        <Field label="Warn me at or below"><input name="minQty" inputMode="numeric" defaultValue={tool?.minQty ?? 0} placeholder="0 = never" className={FIELD} /></Field>
        <Field label="Site"><Combobox name="location" options={lists.locations} defaultValue={tool?.location ?? ""} placeholder="Which site" className="w-full" /></Field>
        <Field label="Company"><SelectField name="companyId" defaultValue={tool?.companyId ? String(tool.companyId) : ""} options={opts(lists.companies, "No company")} /></Field>
        <Field label="Condition">
          <SelectField name="condition" defaultValue={tool?.condition ?? "good"} options={(Object.keys(TOOL_CONDITION_LABELS) as ToolCondition[]).map((k) => ({ value: k, label: TOOL_CONDITION_LABELS[k] }))} />
        </Field>
        <Field label="Bought on"><span className="st-date block"><DateInput name="purchasedDate" defaultValue={ymd(tool?.purchasedDate ?? null)} /></span></Field>
        <Field label="Remark" className="sm:col-span-2"><input name="remark" defaultValue={tool?.remark ?? ""} className={FIELD} /></Field>
      </form>
    </StudioSheet>
  );
}

/* ------------------------------------------------------------- tool moves -- */

const MOVE_WORD: Record<SiteToolMovementRow["type"], string> = { created: "Added", transfer: "Moved", condition: "Condition", write_off: "Written off", adjust: "Counted" };

export function ToolMoveSheet({ open, onClose, tool, locations, start = "count" }: {
  open: boolean; onClose: () => void; tool: SiteToolRow | null; locations: string[]; start?: "count" | "move" | "writeoff";
}) {
  const { pending, run } = useAct(onClose);
  const [mode, setMode] = useState<"count" | "move" | "writeoff">(start);
  const [qty, setQty] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<SiteToolMovementRow[] | null>(null);
  useEffect(() => {
    if (!open || !tool) return;
    setMode(start); setQty(start === "count" ? String(tool.quantity) : ""); setTo(""); setReason(""); setHistory(null);
    let live = true;
    void listSiteToolMovementsAction(tool.id).then((r) => { if (live) setHistory(r.ok ? r.rows : []); });
    return () => { live = false; };
  }, [open, tool, start]);
  if (!tool) return null;
  const n = Number(qty);
  const valid = Number.isInteger(n) && (mode === "count" ? n >= 0 : n > 0 && n <= tool.quantity) && (mode !== "move" || !!to.trim());
  return (
    <StudioSheet open={open} onClose={onClose} width={560} icon={<ArrowRightLeft size={15} />} title={tool.name}
      footer={<Foot pending={pending} disabled={!valid} label={mode === "count" ? "Save the count" : mode === "move" ? "Move them" : "Write off"} onClose={onClose} form="move-form" />}>
      <form id="move-form" className="st-form flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        if (mode === "count") run(() => setSiteToolQuantityAction(tool.id, n), "Count saved.");
        else if (mode === "move") run(() => transferSiteToolAction(tool.id, n, to.trim()), `Moved ${n} to ${to.trim()}.`);
        else run(() => writeOffSiteToolAction(tool.id, n, reason.trim() || null), `${n} written off.`);
      }}>
        <div className="text-[13px] text-[var(--sh-sub,var(--st-sub))]">{tool.quantity} at {tool.location ?? "no site"}{tool.companyName ? ` · ${tool.companyName}` : ""}</div>
        <Seg value={mode} onChange={(m) => { setMode(m); setQty(m === "count" ? String(tool.quantity) : ""); }} options={[["count", "Count"], ["move", "Move to a site"], ["writeoff", "Write off"]]} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={mode === "count" ? "How many are there now" : "How many"}><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" autoFocus className={FIELD} /></Field>
          {mode === "move" && <Field label="To which site"><Combobox options={locations.filter((l) => l !== tool.location)} defaultValue="" onInput={setTo} onCommit={setTo} placeholder="Site" className="w-full" /></Field>}
          {mode === "writeoff" && <Field label="Why"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lost, broken beyond repair…" className={FIELD} /></Field>}
        </div>
        <div className="mt-1">
          <div className="mb-1.5 text-xs text-[var(--sh-muted,var(--st-muted))]">What has happened to it</div>
          {history == null ? <div className="py-3 text-xs text-[var(--sh-muted,var(--st-muted))]"><Loader2 size={13} className="inline animate-spin" /> Loading…</div>
            : history.length === 0 ? <div className="py-2 text-xs text-[var(--sh-muted,var(--st-muted))]">Nothing recorded yet.</div>
            : (
              <ul className="m-0 flex max-h-[200px] list-none flex-col overflow-y-auto p-0">
                {history.map((h) => (
                  <li key={h.id} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-[var(--sh-line,var(--st-line-soft))] py-1.5 text-xs last:border-0">
                    <span className="text-[var(--sh-muted,var(--st-muted))]">{day(h.createdAt)}</span>
                    <span className="truncate">{MOVE_WORD[h.type]}{h.toLocation ? ` → ${h.toLocation}` : ""}{h.toCondition ? ` → ${h.toCondition.replace("_", " ")}` : ""}{h.reason ? ` · ${h.reason}` : ""}</span>
                    <span className="tabular-nums">{h.quantity ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </form>
    </StudioSheet>
  );
}

/* ------------------------------------------------------------ vendor form -- */

export function VendorFormSheet({ open, onClose, vendor, companies }: { open: boolean; onClose: () => void; vendor: VendorRow | null; companies: Opt[] }) {
  const { pending, run } = useAct(onClose);
  const editing = !!vendor;
  return (
    <StudioSheet open={open} onClose={onClose} width={580} icon={<Building2 size={15} />} title={editing ? `Edit ${vendor.name}` : "Add a supplier"}
      footer={<Foot pending={pending} label={editing ? "Save changes" : "Add supplier"} onClose={onClose} form="vendor-form" />}>
      <form id="vendor-form" key={vendor?.id ?? "new"} className="st-form grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => (editing ? updateVendorAction(vendor.id, fd) : createVendorAction(fd)), editing ? "Saved." : "Supplier added.");
      }}>
        <Field label="Name *" className="sm:col-span-2"><input name="name" required autoFocus defaultValue={vendor?.name ?? ""} className={FIELD} /></Field>
        <Field label="Kind"><Combobox name="category" options={[...VENDOR_CATEGORIES]} defaultValue={vendor?.category ?? ""} placeholder="Supplier, Contractor…" className="w-full" /></Field>
        <Field label="Works mainly with"><SelectField name="companyId" defaultValue={vendor?.companyId ? String(vendor.companyId) : ""} options={opts(companies, "Every company")} /></Field>
        <Field label="Contact person"><input name="contactName" defaultValue={vendor?.contactName ?? ""} className={FIELD} /></Field>
        <Field label="Phone"><input name="phone" type="tel" defaultValue={vendor?.phone ?? ""} className={FIELD} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={vendor?.email ?? ""} className={FIELD} /></Field>
        <Field label="Where"><input name="location" defaultValue={vendor?.location ?? ""} className={FIELD} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={vendor?.notes ?? ""} className={AREA} /></Field>
      </form>
    </StudioSheet>
  );
}

function SheetNote({ children }: { children: ReactNode }) {
  return <p className="m-0 text-xs text-[var(--sh-muted,var(--st-muted))]">{children}</p>;
}

/* ----------------------------------------------------------------- import -- */

export function ImportSheet({ open, onClose, what, companies }: { open: boolean; onClose: () => void; what: "assets" | "tools"; companies: Opt[] }) {
  const { pending, run } = useAct(onClose);
  const [text, setText] = useState("");
  const [company, setCompany] = useState("");
  useEffect(() => { if (open) { setText(""); setCompany(""); } }, [open]);
  const rows = useMemo(() => (what === "assets" ? parseAssetPaste(text) : parseToolPaste(text)), [text, what]);
  const noun = what === "assets" ? "asset" : "tool";
  return (
    <StudioSheet open={open} onClose={onClose} width={640} icon={<FileUp size={15} />} title={`Import ${noun}s from a spreadsheet`}
      footer={<Foot pending={pending} disabled={rows.length === 0} label={`Import ${rows.length || ""} ${noun}${rows.length === 1 ? "" : "s"}`.replace("  ", " ")} onClose={onClose} form="import-form" />}>
      <form id="import-form" className="st-form flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        const co = company ? Number(company) : null;
        run(async () => {
          const r = what === "assets" ? await importAssetsAction(parseAssetPaste(text), co) : await importSiteToolsAction(parseToolPaste(text), co);
          return r;
        }, `Imported ${rows.length} ${noun}${rows.length === 1 ? "" : "s"}.`);
      }}>
        <SheetNote>
          Copy the rows from Excel <b className="font-medium">with the header line</b> and paste them below.{" "}
          {what === "assets"
            ? "Recognised: Asset ID, Category, Device Type, Brand, Model, Serial Number, Assigned To, Department, Handover date, Location, Notes. Everything arrives in the store — hand things over afterwards."
            : "Recognised: Tool / Equipment name, Quantity, Specification, Location / Site, Condition, Purchased date, Remark."}
        </SheetNote>
        <Field label="Belongs to company"><SelectFieldControlled value={company} onChange={setCompany} options={opts(companies, "No company")} placeholder="No company" /></Field>
        <Field label="Paste rows">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={cn(AREA, "whitespace-pre font-mono text-xs")}
            placeholder={what === "assets" ? "Asset ID\tCategory\tDevice Type\tBrand\tModel\nLPT-001\tComputer\tLaptop\tLenovo\tIdeaPad 3i" : "Tool/Equipment Name\tQuantity\tSpecification\tLocation/Site\tCondition\nSpanner\t4\t30cm\tPolice Post\tGood"} />
        </Field>
        {text.trim() && <SheetNote>{rows.length ? <>{rows.length} row{rows.length === 1 ? "" : "s"} ready · first: <b className="font-medium">{rows[0].name}</b></> : "No rows found — make sure the first line is the header."}</SheetNote>}
      </form>
    </StudioSheet>
  );
}
