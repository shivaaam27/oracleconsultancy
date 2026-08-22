"use client";

// TAX RATES — the list, and the form that edits it (Phase 3).
//
// ⚠️ The point of this screen is that **the rules are data, not code.** The one
// rate seeded as fact is the statutory standard VAT rate; everything else
// arrives unconfirmed and says so, loudly, until somebody who knows the law
// ticks it off. That is the plan's "do not guess the rules" made visible.
//
// ⚠️ Imports `ledger-tax-shared`, never `ledger-tax`.

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Percent, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, FieldLabel, Input, Textarea } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { FluidSelect } from "@/components/fluid-select";
import { cn } from "@/lib/cn";
import {
  APPLIES_TO, TAX_KINDS, TAX_TREATMENTS, TREATMENT_LABELS, ratePercentLabel,
  type TaxRate,
} from "@/lib/ledger-tax-shared";
import {
  archiveTaxRateAction, createTaxRateAction, deleteTaxRateAction,
  seedTaxRatesAction, updateTaxRateAction,
} from "@/app/ledger/tax-actions";

type Account = { id: number; number: string; name: string };

export function LedgerTaxRates({
  companyId, companyName, rates, accounts,
}: {
  companyId: number;
  companyName: string;
  rates: TaxRate[];
  accounts: Account[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaxRate | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => (showArchived ? rates : rates.filter((r) => !r.archived)),
    [rates, showArchived],
  );
  const unconfirmed = visible.filter((r) => !r.archived && !r.confirmed);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not work.");
      else setEditing(null);
    });
  };

  if (rates.length === 0) {
    return (
      <>
        {error && <Problem>{error}</Problem>}
        <div className="rounded-xl border border-border bg-bg-elev p-8">
          <EmptyState
            icon={<Percent className="h-5 w-5" />}
            title={`${companyName} has no tax rates yet`}
            hint="Start from the standard list — VAT at the statutory rate for sales and purchases, plus zero-rated, exempt and the common withholding rates. Everything except the standard VAT rate arrives marked as needing confirmation, because only you and your accountant can settle those."
            action={
              <Button onClick={() => run(() => seedTaxRatesAction(companyId))} loading={pending}>
                Set up the tax rates
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {error && <Problem>{error}</Problem>}

      {/* ⚠️ The plan says in as many words: do not guess the rules. This is that
          warning, on the screen, naming exactly what is unsettled. */}
      {unconfirmed.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn-soft px-3 py-2 text-base text-warn">
          <strong className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {unconfirmed.length} rate{unconfirmed.length === 1 ? "" : "s"} still to confirm
          </strong>
          <span className="mt-0.5 block">
            Which supplies are zero-rated, which are exempt, and what withholding applies to whom are
            questions for whoever files your returns — not something this system should decide. The figures
            below are a starting point. Check each one, then tick &ldquo;confirmed&rdquo; so the VAT return stops
            flagging it.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Show archived
        </label>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => run(() => seedTaxRatesAction(companyId))} loading={pending}>
            Top up from the standard list
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> Rate
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-base">
            <thead>
              <tr data-list-head className="border-b border-border text-left">
                <Th className="w-[36%]">Rate</Th>
                <Th className="w-16">Tax</Th>
                <Th className="w-20 text-right">Percent</Th>
                <Th className="w-28">Applies to</Th>
                <Th className="w-32">Treatment</Th>
                <Th>Posts to</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const acc = accounts.find((a) => a.id === r.accountId);
                return (
                  <tr
                    key={r.id}
                    data-list-row
                    onClick={() => setEditing(r)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 last:border-0 hover:bg-bg-muted/60",
                      r.archived && "opacity-55",
                    )}
                  >
                    <Td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate">{r.name}</span>
                        {r.isDefault && <Badge tone="accent">default</Badge>}
                        {/* Small dot and a word, never a coloured block. */}
                        {!r.confirmed && !r.archived && (
                          <span className="flex items-center gap-1 text-xs text-warn">
                            <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
                            to confirm
                          </span>
                        )}
                        {r.archived && <Badge>archived</Badge>}
                      </span>
                    </Td>
                    <Td className="text-fg-muted">{r.kind}</Td>
                    <Td className="tabular text-right">{ratePercentLabel(r.percent)}</Td>
                    <Td className="text-fg-muted">{r.appliesTo}</Td>
                    <Td className="text-fg-muted">
                      {TREATMENT_LABELS[r.treatment as keyof typeof TREATMENT_LABELS] ?? r.treatment}
                    </Td>
                    <Td className="text-fg-muted">
                      {acc ? `${acc.number} · ${acc.name}` : <span className="text-fg-subtle">— not set —</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3 py-1.5 text-sm text-fg-subtle">
          {visible.length} of {rates.length} shown · a document freezes the percent it was raised with, so
          correcting a rate here never changes a figure already recorded
        </div>
      </div>

      {editing && (
        <RateSheet
          key={editing === "new" ? "new" : editing.id}
          rate={editing === "new" ? null : editing}
          accounts={accounts}
          busy={pending}
          onClose={() => { setEditing(null); setError(null); }}
          onSave={(f) => run(() =>
            editing === "new"
              ? createTaxRateAction({ companyId, ...f })
              : updateTaxRateAction(editing.id, f))}
          onArchive={(a) => editing !== "new" && run(() => archiveTaxRateAction(editing.id, a))}
          onDelete={() => editing !== "new" && run(() => deleteTaxRateAction(editing.id))}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── the form ───── */

type Fields = {
  name: string;
  kind: string;
  percent: string;
  appliesTo: string;
  treatment: string;
  accountId: number | null;
  isDefault: boolean;
  confirmed: boolean;
  notes: string | null;
};

function RateSheet({
  rate, accounts, busy, onClose, onSave, onArchive, onDelete,
}: {
  rate: TaxRate | null;
  accounts: Account[];
  busy: boolean;
  onClose: () => void;
  onSave: (f: Fields) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState<Fields>({
    name: rate?.name ?? "",
    kind: rate?.kind ?? "VAT",
    percent: rate?.percent ?? "",
    appliesTo: rate?.appliesTo ?? "both",
    treatment: rate?.treatment ?? "standard",
    accountId: rate?.accountId ?? null,
    isDefault: rate?.isDefault ?? false,
    confirmed: rate?.confirmed ?? false,
    notes: rate?.notes ?? null,
  });
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={rate ? rate.name : "New tax rate"}
      icon={<Percent className="h-4 w-4" />}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(f)} loading={busy}>Save</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel>Name</FieldLabel>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VAT on sales — standard 18%" />
        </div>

        <div>
          <FieldLabel>Which tax</FieldLabel>
          <FluidSelect
            value={f.kind}
            options={TAX_KINDS.map((k) => ({ value: k, label: k === "VAT" ? "VAT" : "Withholding" }))}
            onSelect={(v) => set("kind", v)}
          />
        </div>
        <div>
          <FieldLabel>Percent</FieldLabel>
          <Input
            value={f.percent}
            inputMode="decimal"
            onChange={(e) => set("percent", e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="18"
            className="tabular"
          />
          <p className="mt-1 text-xs text-fg-subtle">A percentage — type 18, not 0.18.</p>
        </div>

        <div>
          <FieldLabel>Applies to</FieldLabel>
          <FluidSelect
            value={f.appliesTo}
            options={APPLIES_TO.map((a) => ({
              value: a,
              label: a === "sales" ? "What we sell" : a === "purchases" ? "What we buy" : "Both",
            }))}
            onSelect={(v) => set("appliesTo", v)}
          />
        </div>
        <div>
          <FieldLabel>Treatment</FieldLabel>
          <FluidSelect
            value={f.treatment}
            options={TAX_TREATMENTS.map((t) => ({ value: t, label: TREATMENT_LABELS[t] }))}
            onSelect={(v) => set("treatment", v)}
          />
          {/* ⚠️ The distinction that most often goes wrong. */}
          <p className="mt-1 text-xs text-fg-subtle">
            Zero-rated is <b>taxable</b> at 0% and counts in your turnover. Exempt sits outside VAT and does
            not. They are not the same thing.
          </p>
        </div>

        <div className="sm:col-span-2">
          <FieldLabel>Posts to</FieldLabel>
          <FluidSelect
            value={f.accountId === null ? "" : String(f.accountId)}
            options={[{ value: "", label: "— not set —" },
              ...accounts.map((a) => ({ value: String(a.id), label: `${a.number} · ${a.name}` }))]}
            onSelect={(v) => set("accountId", v === "" ? null : Number(v))}
            placeholder="— not set —"
          />
          <p className="mt-1 text-xs text-fg-subtle">
            Where this tax will land in the books once the documents start posting themselves. It can be left
            blank — the rate still works out figures either way.
          </p>
        </div>

        <label className="col-span-full flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2">
          <input
            type="checkbox"
            checked={f.isDefault}
            onChange={(e) => set("isDefault", e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="text-base">
            Offer this one first
            <span className="block text-xs text-fg-subtle">
              On a new document of that kind. Only one rate can be the default for each tax and side.
            </span>
          </span>
        </label>

        {/* ⚠️ The honesty switch. Ticking it is a deliberate act by somebody who
            has actually checked, and it is what stops the return flagging. */}
        <label className={cn(
          "col-span-full flex items-start gap-2 rounded-lg border px-3 py-2",
          f.confirmed ? "border-border bg-bg" : "border-warn/40 bg-warn-soft",
        )}>
          <input
            type="checkbox"
            checked={f.confirmed}
            onChange={(e) => set("confirmed", e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="text-base">
            Confirmed against the law
            <span className="block text-xs text-fg-subtle">
              Tick this only once whoever files the returns has agreed the rate and what it applies to. Until
              then the VAT return shows it as unconfirmed — which is the honest state, not a nag.
            </span>
          </span>
        </label>

        <div className="col-span-full">
          <FieldLabel>Notes</FieldLabel>
          <Textarea
            rows={2}
            value={f.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            placeholder="What this covers, and who confirmed it."
          />
        </div>

        {rate && (
          <div className="col-span-full mt-1 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={() => onArchive(!rate.archived)} loading={busy}>
              {rate.archived ? "Bring back into use" : "Archive"}
            </Button>
            <span className="text-xs text-fg-subtle">
              Archiving stops it being offered. Documents already raised with it keep their own frozen
              percent and are unaffected.
            </span>
            <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={onDelete} loading={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ───────────────────────────────────────────────────────────────── bits ─── */

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-base text-danger">
      {children}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle", className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}
