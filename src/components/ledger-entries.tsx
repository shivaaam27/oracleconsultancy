"use client";

// THE ENTRIES — the books, raw (Phase 1).
//
// ⚠️ This is not the general ledger REPORT. It is the feed of `gl_entries`
// itself, so the spine can be seen working before Phase 2 builds trial balance,
// P&L, balance sheet and statements on top of it. Which is also why it shows
// reversals rather than hiding them: a reversal is a fact of the record.
//
// ⚠️ Filters go through `useUrlFilters`, not `useState` — the forward rule in
// CLAUDE.md. A list filtered with component state has nothing for a saved view
// to save, and this list will want saved views the moment Phase 2 lands.

import { useMemo } from "react";
import { Scale } from "lucide-react";
import { Button, EmptyState, Input } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { cn } from "@/lib/cn";
import { useUrlFilters } from "@/lib/use-url-filters";
import {
  ledgerAmount, num, runningBalance, signedBalance,
  type GlAccount, type GlEntry,
} from "@/lib/ledger-shared";

export function LedgerEntries({
  companyId, accounts, entries, health, filters,
}: {
  companyId: number;
  accounts: GlAccount[];
  entries: GlEntry[];
  health: { ok: boolean; debit: number; credit: number; difference: number };
  filters: { account: string; from: string; to: string; party: string };
}) {
  const { values, set, reset, dirty } = useUrlFilters(
    { account: "", from: "", to: "", party: "" },
    { debounceKeys: ["party"] },
  );

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const chosen = filters.account ? byId.get(Number(filters.account)) : undefined;

  // A running balance only means something down ONE account, in date order.
  const rows = useMemo(() => {
    if (!chosen) return entries.map((e) => ({ ...e, balance: null as number | null }));
    return runningBalance(entries, chosen.rootType);
  }, [entries, chosen]);

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    for (const e of entries) { debit += num(e.debit) ?? 0; credit += num(e.credit) ?? 0; }
    return { debit, credit };
  }, [entries]);

  return (
    <>
      {!health.ok && (
        <div className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <strong>The books do not balance.</strong> Across everything, debits {ledgerAmount(health.debit)} against
          credits {ledgerAmount(health.credit)} — out by {ledgerAmount(Math.abs(health.difference))}. Every
          voucher is checked before it is written, so something got in another way.
        </div>
      )}

      {/* ── the filter strip ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-bg-elev p-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Account</span>
          <FluidSelect
            value={values.account}
            options={[
              { value: "", label: "Every account" },
              ...accounts.filter((a) => !a.isGroup)
                .map((a) => ({ value: String(a.id), label: `${a.number} · ${a.name}` })),
            ]}
            onSelect={(v) => set({ account: v })}
            buttonClassName="h-8 min-w-[220px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">From</span>
          <Input type="date" value={values.from} onChange={(e) => set({ from: e.target.value })} className="h-8" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">To</span>
          <Input type="date" value={values.to} onChange={(e) => set({ to: e.target.value })} className="h-8" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Against</span>
          <Input
            value={values.party}
            onChange={(e) => set({ party: e.target.value })}
            placeholder="A customer or supplier"
            className="h-8 w-48"
          />
        </label>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={reset} className="mb-0.5">Clear</Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elev p-8">
          <EmptyState
            icon={<Scale className="h-5 w-5" />}
            title={dirty ? "Nothing matches those filters" : "Nothing has been posted yet"}
            hint={
              dirty
                ? "Widen the dates, or clear the filters."
                : "The books are empty. Post a journal entry, and the two sides of it will appear here."
            }
            action={
              dirty
                ? <Button variant="ghost" onClick={reset}>Clear the filters</Button>
                : <Button onClick={() => { window.location.href = `/ledger/journals?co=${companyId}`; }}>Go to journals</Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-28">Date</Th>
                  {!chosen && <Th className="w-[26%]">Account</Th>}
                  <Th className="w-36">Document</Th>
                  <Th>Against / note</Th>
                  <Th className="w-32 text-right">Debit</Th>
                  <Th className="w-32 text-right">Credit</Th>
                  {chosen && <Th className="w-36 text-right">Balance</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const a = byId.get(e.accountId);
                  return (
                    <tr
                      key={e.id}
                      data-list-row
                      className={cn("border-b border-border/60 last:border-0", e.isReversal && "text-fg-muted")}
                    >
                      <Td className="tabular">{e.postingDate?.slice(0, 10) ?? "—"}</Td>
                      {!chosen && (
                        <Td>
                          <span className="tabular text-fg-subtle">{a?.number}</span>{" "}
                          <span>{a?.name ?? "—"}</span>
                        </Td>
                      )}
                      <Td>
                        <span className="block truncate">{e.voucherNo ?? e.voucherType}</span>
                        <span className="text-[11px] text-fg-subtle">
                          {e.voucherType}{e.isReversal ? " · reversal" : ""}
                        </span>
                      </Td>
                      <Td>
                        <span className="block truncate">
                          {e.party ?? <span className="text-fg-subtle">—</span>}
                        </span>
                        {e.remarks && <span className="block truncate text-[11px] text-fg-subtle">{e.remarks}</span>}
                      </Td>
                      <Td className="tabular text-right">{ledgerAmount(num(e.debit))}</Td>
                      <Td className="tabular text-right">{ledgerAmount(num(e.credit))}</Td>
                      {chosen && (
                        <Td className={cn("tabular text-right", (e.balance ?? 0) < 0 && "text-danger")}>
                          {/* ⚠️ "0.00", not blank. A blank debit or credit cell
                              means "nothing on this side" and is right; a blank
                              running balance reads as missing data rather than
                              as "back to nothing", which is the opposite of
                              what a reversal is trying to show you. */}
                          {ledgerAmount(e.balance) || "0.00"}
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-bg-muted/50 font-medium">
                  <Td colSpan={chosen ? 3 : 4} className="text-fg-muted">
                    {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                    {chosen && ` on ${chosen.number} · ${chosen.name}`}
                  </Td>
                  <Td className="tabular text-right">{ledgerAmount(totals.debit)}</Td>
                  <Td className="tabular text-right">{ledgerAmount(totals.credit)}</Td>
                  {chosen && (
                    <Td className="tabular text-right">
                      {ledgerAmount(signedBalance(chosen.rootType, totals.debit, totals.credit)) || "0.00"}
                    </Td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-border px-3 py-1.5 text-[12px] text-fg-subtle">
            Reversals are shown, not hidden — they are part of the record, and they cancel by arithmetic rather
            than by anything being removed. The reports that read these entries come next.
          </p>
        </div>
      )}
    </>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle", className)}>
      {children}
    </th>
  );
}

function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-3 py-1.5 align-middle", className)}>{children}</td>;
}
