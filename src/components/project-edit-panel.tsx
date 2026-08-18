"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EDIT THE PROJECT — the typed fields, in one place.
//
// Phase 1 built a read-only record, which was fine until Phases 5 and 6 arrived:
// **physical completion drives the entire payment plan** (a stage becomes
// billable when completion passes its threshold) and **the meal rate prices the
// whole meals sheet**. Both are typed figures with no way to type them.
//
// Everything here is a STORED field. Nothing derived is editable, because
// nothing derived is stored — that is the rule the whole module is built on.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { updateProjectAction } from "@/app/projects/actions";
import { MoneyInput } from "./money-input";
import { FluidSelect } from "./fluid-select";
import { CURRENCIES, currencyLabel } from "@/lib/money-format";

export type EditableProject = {
  id: number;
  name: string;
  variant: string | null;
  client: string | null;
  location: string | null;
  poNumber: string | null;
  startDate: string | null;
  durationDays: number | null;
  quotationValue: string | null;
  poValue: string | null;
  additionalWork: string | null;
  vatRate: string | null;
  whtRate: string | null;
  completionPct: string | null;
  mealRate: string | null;
  currency: string;
  notes: string | null;
};

/** 0.98 → "98" for the box; the action turns it back into a fraction. */
function asPercent(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 10) : "";
}

export function ProjectEditPanel({ project }: { project: EditableProject }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [f, setF] = useState({
    name: project.name,
    variant: project.variant ?? "",
    client: project.client ?? "",
    location: project.location ?? "",
    poNumber: project.poNumber ?? "",
    startDate: project.startDate?.slice(0, 10) ?? "",
    durationDays: project.durationDays ? String(project.durationDays) : "",
    quotationValue: project.quotationValue ?? "",
    poValue: project.poValue ?? "",
    additionalWork: project.additionalWork ?? "",
    vatRate: asPercent(project.vatRate),
    whtRate: asPercent(project.whtRate),
    completionPct: asPercent(project.completionPct),
    mealRate: project.mealRate ?? "",
    currency: project.currency,
    notes: project.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
          <Pencil size={13} /> Edit details
        </button>
        {/* ⚠️ The save itself is instant; re-rendering the record from the
            server takes a few seconds on this link. Without this line the old
            figure sits there looking like a save that did not happen — which
            is exactly how it read during testing. `pending` covers the whole
            transition, `router.refresh()` included, so it clears when the new
            numbers are actually on screen. */}
        {pending && (
          <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
            <Loader2 size={12} className="animate-spin" /> Updating the record…
          </span>
        )}
        {saved && !pending && <span className="text-[11px] text-success">Saved</span>}
      </span>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-bg-elev p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium">Edit project</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-fg-subtle hover:text-fg">
          <X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <F label="Project name"><I value={f.name} onChange={(v) => set("name", v)} /></F>
        <F label="Build type"><I value={f.variant} onChange={(v) => set("variant", v)} /></F>
        <F label="Client"><I value={f.client} onChange={(v) => set("client", v)} /></F>
        <F label="Location"><I value={f.location} onChange={(v) => set("location", v)} /></F>
        <F label="PO number"><I value={f.poNumber} onChange={(v) => set("poNumber", v)} /></F>
        <F label="Start date"><I type="date" value={f.startDate} onChange={(v) => set("startDate", v)} /></F>
        <F label="Duration (days)"><I value={f.durationDays} onChange={(v) => set("durationDays", v)} /></F>
        <F label="Currency">
          <FluidSelect
            value={f.currency}
            options={CURRENCIES.map((c) => ({ value: c.code, label: currencyLabel(c.code) }))}
            onSelect={(v) => set("currency", v)}
            buttonClassName="h-8 w-full justify-between" className="w-full"
          />
        </F>
        <F label="Quotation (excl. VAT)">
          <MoneyInput value={f.quotationValue} onChange={(v) => set("quotationValue", v)} currency={f.currency} />
        </F>
        <F label="PO value (incl. VAT)">
          <MoneyInput value={f.poValue} onChange={(v) => set("poValue", v)} currency={f.currency} />
        </F>
        <F label="Additional work (incl. VAT)" hint="variations agreed after the PO">
          <MoneyInput value={f.additionalWork} onChange={(v) => set("additionalWork", v)} currency={f.currency} />
        </F>
        <F label="VAT rate %" hint="0 if zero-rated"><I value={f.vatRate} onChange={(v) => set("vatRate", v)} right /></F>
        <F label="Withholding tax %"><I value={f.whtRate} onChange={(v) => set("whtRate", v)} right /></F>

        <F label="Work completed %" hint="drives the payment plan">
          <I value={f.completionPct} onChange={(v) => set("completionPct", v)} right />
        </F>
        <F label="Meal rate per day" hint="prices the meals sheet">
          <MoneyInput value={f.mealRate} onChange={(v) => set("mealRate", v)} currency={f.currency} />
        </F>
      </div>

      <F label="Notes" className="mt-3">
        <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-accent" />
      </F>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={pending}
          onClick={() => start(async () => {
            setError(null);
            const res = await updateProjectAction(project.id, {
              ...f,
              durationDays: f.durationDays ? Number(f.durationDays) : null,
            });
            if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
            setSaved(true);
            setTimeout(() => setSaved(false), 1800);
            setOpen(false);
            router.refresh();
          })}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save changes
        </button>
        {saved && <span className="text-[11px] text-success">Saved</span>}
        <span className="text-[11px] text-fg-subtle">
          Percentages: type 98 for 98%. Everything else on the record is worked out from these.
        </span>
      </div>
    </section>
  );
}

function F({ label, hint, className, children }: {
  label: string; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">
        {label}{hint && <span className="ml-1 normal-case tracking-normal opacity-60">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function I({ value, onChange, type, right }: {
  value: string; onChange: (v: string) => void; type?: string; right?: boolean;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent",
        right && "tabular text-right")} />
  );
}
