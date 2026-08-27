"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, PackageCheck, Pencil, Plus, X } from "lucide-react";
import { FIELD } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { czDate } from "@/lib/cocozuri-shared";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import type { CzLot } from "@/lib/cocozuri-trace-shared";
import {
  despatchBlockers, lotSummary, unattributed,
  type CzDespatchLine,
} from "@/lib/cocozuri-despatch-shared";
import { setDespatchLotsAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Which lots went out on this invoice.
 *
 * ⚠️ IT MOVES NO STOCK AND SAYS SO. The day sheet is what takes chocolate off
 * the shelf; this is the record of WHO GOT WHICH LOT, which is the half of a
 * recall the stock ledger cannot answer because an invoice line names a product.
 *
 * ⚠️ AND IT IS A SUGGESTION UNTIL SOMEBODY SAYS OTHERWISE. What is written at
 * issue is a reading of the shelf, first-expired-first-out. The van was loaded
 * by a person, so every line can be corrected — including after issue.
 * ------------------------------------------------------------------ */

export function CocozuriDespatch({
  lines, choices,
}: {
  lines: CzDespatchLine[];
  /** The lots each line could plausibly have sent, keyed by line id. */
  choices: Record<number, CzLot[]>;
}) {
  const [editing, setEditing] = useState<number | null>(null);

  if (lines.length === 0) return null;
  const anyLots = lines.some((l) => l.lots.length > 0);

  return (
    <section className="rounded-lg border border-border bg-bg-elev print:hidden">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-bg-subtle px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
          <PackageCheck size={13} /> Which lots went out
        </span>
        <span className="text-xs text-fg-subtle">
          Read off the shelf when this was issued, soonest-expiring first. It moves no stock — the
          day sheet does that — and you can correct any line.
        </span>
      </div>

      {!anyLots && (
        <p className="border-b border-border px-3 py-2 text-sm text-fg-subtle">
          No lots recorded against this invoice. That is normal for chocolate bought or made before
          lots were kept, and for a line that is not in the catalogue.
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_minmax(0,1.1fr)_80px] items-center gap-2 border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Line</span>
            <span className="text-right">Invoiced</span>
            <span>Lots</span>
            <span className="text-right">&nbsp;</span>
          </div>
          {lines.map((line) => {
            const spare = unattributed(line);
            return (
              <div key={line.lineId}>
                <div className="grid grid-cols-[minmax(0,1fr)_90px_minmax(0,1.1fr)_80px] items-center gap-2 border-b border-border px-3 py-1.5">
                  <span className="min-w-0 truncate text-sm text-fg" title={line.description}>
                    {line.description}
                  </span>
                  <span className="text-right text-sm tabular text-fg-muted">{qtyText(line.qty)}</span>
                  <span className="min-w-0 truncate text-sm text-fg-muted" title={lotSummary(line)}>
                    {line.lots.length === 0
                      ? <span className="text-fg-subtle">no lot recorded</span>
                      : (
                        <>
                          {line.lots.map((l) => `${l.batchNo} ${qtyText(l.qty)}`).join(" · ")}
                          {/* ⚠️ SAID, NEVER HIDDEN. What no lot accounts for is an
                              ordinary fact, and a row that quietly omitted it
                              would read as a complete answer. */}
                          {spare > 0.0005 && (
                            <span className="ml-1.5 text-xs text-warn">+{qtyText(spare)} with no lot</span>
                          )}
                        </>
                      )}
                  </span>
                  <span className="flex justify-end">
                    <button type="button" onClick={() => setEditing(editing === line.lineId ? null : line.lineId)}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg">
                      <Pencil size={12} /> {editing === line.lineId ? "Close" : "Correct"}
                    </button>
                  </span>
                </div>
                {editing === line.lineId && (
                  <CorrectLine line={line} lots={choices[line.lineId] ?? []} onDone={() => setEditing(null)} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Correcting one line
 * ------------------------------------------------------------------ */

function CorrectLine({
  line, lots, onDone,
}: {
  line: CzDespatchLine;
  lots: CzLot[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ batchId: number | null; qty: string }[]>(
    line.lots.length
      ? line.lots.map((l) => ({ batchId: l.batchId, qty: String(l.qty) }))
      : [{ batchId: null, qty: "" }],
  );

  /* ⚠️ EVERY LOT OF THAT PRODUCT IS OFFERED, not only what is still on a shelf.
     An invoice is often typed days after the van left, by which time the lot it
     carried may be gone entirely — and a picker that hid it would make the true
     answer the one thing that could not be recorded. */
  const options = useMemo(() => {
    const named = new Map(lots.map((l) => [l.batchId, l]));
    for (const l of line.lots) if (!named.has(l.batchId)) {
      named.set(l.batchId, { batchId: l.batchId, batchNo: l.batchNo, itemId: 0, expiresOn: l.expiresOn, onHand: 0, source: "production", madeOn: null });
    }
    return [...named.values()].sort((a, b) =>
      (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999") || a.batchId - b.batchId);
  }, [lots, line.lots]);

  const clean = rows
    .filter((r) => r.batchId != null && typedNumberOr(r.qty) > 0)
    .map((r) => ({ batchId: r.batchId!, qty: typedNumberOr(r.qty) }));

  const blockers = despatchBlockers({
    qty: line.qty,
    lots: clean.map((c) => ({ batchId: c.batchId, batchNo: "", expiresOn: null, qty: c.qty })),
  });
  const spare = Math.round(Math.max(0, line.qty - clean.reduce((t, c) => t + c.qty, 0)) * 1000) / 1000;

  async function save() {
    setBusy(true);
    const res = await setDespatchLotsAction(line.lineId, clean);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not save.", { tone: "danger" }); return; }
    toast("Recorded which lots went out.", { tone: "success" });
    onDone();
    router.refresh();
  }

  return (
    <div className="space-y-2 border-b border-border bg-bg-subtle px-3 py-2.5">
      <p className="text-sm text-fg-muted">
        Say what really went. <strong className="text-fg">{qtyText(line.qty)}</strong> was invoiced;
        anything you do not put against a lot is recorded as having no lot, which is a true answer
        and not a gap to be filled in.
      </p>

      {/* ⚠️ AN EMPTY PICKER READS AS BROKEN. Where nothing has ever been made or
          bought under a lot for this chocolate there is nothing to choose, and a
          dropdown that opens onto one placeholder looks like a fault rather than
          an answer. Say it instead. */}
      {options.length === 0 ? (
        <p className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg-subtle">
          No lots exist for this chocolate — nothing has been made or bought under one. There is
          nothing to choose here until a batch is closed or a dated delivery is approved, and
          &ldquo;no lot recorded&rdquo; stays the true answer for this line.
        </p>
      ) : rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_32px] items-center gap-2">
          <FluidSelect
            value={r.batchId == null ? "" : String(r.batchId)}
            onSelect={(v) => setRows((rs) => rs.map((x, n) => (n === i ? { ...x, batchId: v ? Number(v) : null } : x)))}
            placeholder="Which lot"
            options={[
              { value: "", label: "Which lot" },
              ...options.map((o) => ({
                value: String(o.batchId),
                label: `${o.batchNo}${o.expiresOn ? ` · goes off ${czDate(o.expiresOn)}` : " · no date"}`,
              })),
            ]} />
          <input value={r.qty} inputMode="decimal" placeholder="How many"
            onChange={(e) => setRows((rs) => rs.map((x, n) => (n === i ? { ...x, qty: e.target.value } : x)))}
            className={`${FIELD} text-right tabular`} aria-label="How many from this lot" />
          <button type="button" aria-label="Take this lot off"
            onClick={() => setRows((rs) => (rs.length === 1 ? [{ batchId: null, qty: "" }] : rs.filter((_, n) => n !== i)))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:text-danger">
            <X size={13} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {options.length > 0 && (
          <button type="button" onClick={() => setRows((rs) => [...rs, { batchId: null, qty: "" }])}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg">
            <Plus size={13} /> Another lot
          </button>
        )}
        <span className="grow" />
        {spare > 0.0005 && (
          <span className="text-sm text-warn">{qtyText(spare)} will be recorded with no lot</span>
        )}
      </div>

      {blockers.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void save()}
          disabled={busy || blockers.length > 0 || (options.length === 0 && line.lots.length === 0)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />} Save the lots
        </button>
        <button type="button" onClick={onDone} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </div>
  );
}
