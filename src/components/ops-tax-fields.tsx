"use client";

// THE TAX FIELDS on an ops document (Phase 3).
//
// One control, used on a sales invoice, on a purchase line and on a payment, so
// the three cannot drift into asking the question three different ways.
//
// ⚠️ **THE INCLUSIVE TOGGLE IS THREE-STATE**, and that is the whole point of
// this component. "Includes VAT" / "plus VAT" / *unset* are genuinely different
// answers: the same 1,180,000 is either 1,180,000 + VAT or 1,000,000 with
// 180,000 already inside it. A two-state switch would have to default to one of
// them, and every invoice nobody touched would silently claim that answer. So
// the third state exists, it is the default, and the VAT return reports those
// invoices as unknown rather than guessing.
//
// ⚠️ Imports `ledger-tax-shared`, never `ledger-tax`.

import { useMemo } from "react";
import { FluidSelect } from "@/components/fluid-select";
import { cn } from "@/lib/cn";
import { ratePercentLabel, splitTax, type TaxRate } from "@/lib/ledger-tax-shared";
import { fmtMoney } from "@/lib/money-format";

export type TaxFieldValue = {
  rateId: number | null;
  /** ⚠️ Frozen onto the document when the rate is chosen. */
  percent: string | null;
  /** true · false · null = nobody has said. */
  inclusive: boolean | null;
};

export function OpsTaxFields({
  rates, side, value, onChange, amount, currency, label, className, inputCls,
}: {
  rates: TaxRate[];
  /** Which rates to offer, and what to call the tax. */
  side: "sales" | "purchases" | "wht";
  value: TaxFieldValue;
  onChange: (v: TaxFieldValue) => void;
  /** What the tax is worked out on, so the split can be previewed. */
  amount: string | number | null;
  currency?: string | null;
  label?: string;
  className?: string;
  inputCls?: string;
}) {
  const usable = useMemo(() => {
    const kind = side === "wht" ? "WHT" : "VAT";
    return rates.filter((r) =>
      !r.archived
      && r.kind === kind
      && (side === "wht"
        ? true
        : r.appliesTo === side || r.appliesTo === "both"));
  }, [rates, side]);

  const chosen = usable.find((r) => r.id === value.rateId) ?? null;
  const split = splitTax(amount, value.percent, value.inclusive);

  const pick = (v: string) => {
    if (v === "") { onChange({ rateId: null, percent: null, inclusive: value.inclusive }); return; }
    const r = usable.find((x) => String(x.id) === v);
    // ⚠️ The percent is COPIED onto the document here, not looked up later.
    // Correcting the rate afterwards must never re-write a document already
    // raised — see the schema comment on `tax_percent`.
    onChange({ rateId: r ? r.id : null, percent: r?.percent ?? null, inclusive: value.inclusive });
  };

  const taxWord = side === "wht" ? "Withholding" : "VAT";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-5">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-fg-subtle">
            {label ?? taxWord}
          </span>
          <FluidSelect
            value={value.rateId === null ? "" : String(value.rateId)}
            options={[
              { value: "", label: `No ${taxWord.toLowerCase()}` },
              ...usable.map((r) => ({
                value: String(r.id),
                label: `${r.name}${r.confirmed ? "" : " — to confirm"}`,
              })),
            ]}
            onSelect={pick}
            placeholder={`No ${taxWord.toLowerCase()}`}
            buttonClassName="h-8 w-full"
          />
        </div>

        <div className="sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-fg-subtle">Rate</span>
          <div className={cn(inputCls, "flex h-8 items-center justify-end tabular text-fg-muted")}>
            {ratePercentLabel(value.percent)}
          </div>
        </div>

        {side !== "wht" && (
          <div className="sm:col-span-5">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-fg-subtle">
              The value above
            </span>
            {/* ⚠️ Three buttons, not a switch. "Not said" is a real answer and
                has to be reachable — and it is where a document starts. */}
            <div className="flex gap-1">
              {[
                { v: false as const, label: "+ VAT" },
                { v: true as const, label: "includes VAT" },
                { v: null, label: "not said" },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => onChange({ ...value, inclusive: o.v })}
                  className={cn(
                    "h-8 flex-1 rounded-md border text-[11px]",
                    value.inclusive === o.v
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-bg text-fg-muted hover:text-fg",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* What that actually means, in money, before it is saved. */}
      {value.rateId !== null && (
        <p className="text-[11px] text-fg-subtle">
          {split ? (
            <>
              Net <b className="tabular text-fg-muted">{fmtMoney(split.net, currency, { decimals: 2 })}</b>
              {" · "}{taxWord.toLowerCase()}{" "}
              <b className="tabular text-fg-muted">{fmtMoney(split.tax, currency, { decimals: 2 })}</b>
              {" · "}total <b className="tabular text-fg-muted">{fmtMoney(split.gross, currency, { decimals: 2 })}</b>
            </>
          ) : value.inclusive === null ? (
            <span className="text-warn">
              Say whether that value already includes the {taxWord.toLowerCase()} — until then this document
              is left out of the return rather than guessed at.
            </span>
          ) : (
            <span className="text-warn">Needs a value before the {taxWord.toLowerCase()} can be worked out.</span>
          )}
          {chosen && !chosen.confirmed && (
            <span className="ml-1 text-warn">· this rate has not been confirmed yet</span>
          )}
        </p>
      )}
    </div>
  );
}
