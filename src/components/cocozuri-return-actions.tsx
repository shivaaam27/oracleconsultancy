"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Ban, BookOpen, CheckCircle2, Loader2, Receipt, Trash2, Undo2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";
import { money } from "@/lib/cocozuri-shared";
import { typedNumberOr } from "@/lib/typed-number";
import {
  CZ_LOSS_REASONS, returnCheck, settleBlockers,
  type CzLossReason, type CzReturn, type CzScrapValue,
} from "@/lib/cocozuri-return-shared";
import {
  cancelReturnAction, postWriteOffAction, raiseCreditNoteAction,
  settleReturnAction, unpostWriteOffAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * What happens to a return.
 *
 * ⚠️ SORTING IS WHAT TAKES THE SCRAP OFF THE SHELF, and only the scrap — what
 * was repacked is already there. It can be done in more than one go: the
 * remainder is chocolate still on the bench, which is the circled "(repairing)"
 * in the notes and neither sellable nor written off until somebody says.
 * ------------------------------------------------------------------ */

export function CocozuriReturnActions({
  czReturn: r, scrap, booksState, postingReady, postingReason,
}: {
  czReturn: CzReturn;
  scrap: CzScrapValue;
  booksState: "unposted" | "posted" | "reversed";
  postingReady: boolean;
  postingReason: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sorting, setSorting] = useState(false);
  const check = returnCheck(r);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return false; }
    toast(label, { tone: "success" });
    router.refresh();
    return true;
  }

  const cancelled = r.status === "cancelled";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!cancelled && check.beingRepaired > 0.0005 && (
          <button type="button" onClick={() => setSorting(true)} disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            <CheckCircle2 size={13} /> Say what happened to it
          </button>
        )}

        {/* The money half: a credit note, which already exists as a document. */}
        {!cancelled && r.kind === "customer" && (
          r.creditNoteId ? (
            <Link href={`/cocozuri/invoices/${encodeURIComponent(r.creditNoteNumber ?? "")}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
              <Receipt size={13} /> {r.creditNoteNumber ?? "Credit note"}
            </Link>
          ) : (
            /* ⚠️ Held back, WITH THE REASON, rather than offered and then
               refused. Nobody has to say who it came from to write the goods
               down — but they do to credit somebody for them. */
            <button type="button" disabled={busy || r.customerId == null || r.invoiceId == null}
              title={
                r.customerId == null ? "Nobody has said who these came back from."
                  : r.invoiceId == null ? "Say which invoice they were sold on — today's price list is not what they were charged."
                  : undefined
              }
              onClick={() => void run("The credit note is a draft — check it, then issue it.", async () => {
                const res = await raiseCreditNoteAction(r.id);
                return { ok: res.ok, error: res.error };
              })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
              <Receipt size={13} /> Credit the customer
            </button>
          )
        )}

        {/* The books: only once the sorting is done, because anything on the
            bench might still be sold. */}
        {!cancelled && r.status === "settled" && check.scrapped > 0 && (
          booksState === "posted" ? (
            <button type="button" disabled={busy}
              onClick={() => {
                const why = window.prompt("Taking a write-off back out of the books. Why?");
                if (why == null) return;
                void run("Taken back out — with a reversal, not an erasure.", () => unpostWriteOffAction(r.id, why));
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
              <BookOpen size={13} /> Take out of the books
            </button>
          ) : (
            <button type="button" disabled={busy || !postingReady}
              title={postingReady ? undefined : postingReason ?? undefined}
              onClick={() => void run("The loss is in the books.", () => postWriteOffAction(r.id))}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
              <BookOpen size={13} /> Write it off in the books
            </button>
          )
        )}

        {!cancelled && (
          <button type="button" disabled={busy}
            onClick={() => {
              const why = window.prompt("Cancelling puts everything this did back. Why?");
              if (!why?.trim()) return;
              void run("Cancelled — reversed, not erased.", () => cancelReturnAction(r.id, why));
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-subtle hover:text-danger disabled:opacity-60">
            <Ban size={13} /> Cancel
          </button>
        )}
      </div>

      {/* ⚠️ The write-off value, said with its footing. A total with a silent
          zero in it reads as cheap, and this is the figure that decides whether
          breakage is worth chasing. */}
      {check.scrapped > 0 && (
        <p className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${
          scrap.complete ? "border-border bg-bg-elev text-fg-muted" : "border-warn/30 bg-warn/10 text-warn"}`}>
          <Trash2 size={14} className="mt-px shrink-0" />
          <span>
            {qtyText(check.scrapped)} thrown away, which cost{" "}
            <strong className="text-fg">{scrap.complete ? "" : "at least "}{money(scrap.value)}</strong>
            {!scrap.complete && (
              <> — nothing has ever been bought or made at a known cost for{" "}
                <strong>{scrap.unknown.slice(0, 3).join(", ")}</strong>, so that much is missing from the figure.</>
            )}
            {scrap.complete && r.status !== "settled" && " so far."}
            {booksState === "posted" && " It is in the books."}
            {booksState === "reversed" && " Its posting has been reversed."}
          </span>
        </p>
      )}

      {sorting && (
        <SortSheet czReturn={r} busy={busy} onClose={() => setSorting(false)}
          onDone={async (input) => {
            const ok = await run(
              "Recorded. What was thrown away has come off the shelf.",
              () => settleReturnAction(r.id, input),
            );
            if (ok) setSorting(false);
          }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Sorting it
 * ------------------------------------------------------------------ */

type SortInput = {
  decided: { lineId: number; good: number; scrap: number }[];
  lossKind: CzLossReason | null;
  lossNote: string | null;
  onDate: string;
};

function SortSheet({
  czReturn: r, busy, onClose, onDone,
}: {
  czReturn: CzReturn;
  busy: boolean;
  onClose: () => void;
  onDone: (input: SortInput) => void;
}) {
  const [good, setGood] = useState<Record<number, string>>({});
  const [scrap, setScrap] = useState<Record<number, string>>({});
  const [lossKind, setLossKind] = useState<CzLossReason | null>(r.lossKind ?? null);
  const [lossNote, setLossNote] = useState(r.lossNote ?? "");
  const [onDate, setOnDate] = useState(todayInDar());

  const rows = useMemo(
    () => r.lines.map((l) => {
      const decided = (l.goodQty ?? 0) + (l.scrapQty ?? 0);
      return {
        line: l,
        left: Math.max(0, Math.round((l.qty - decided) * 1000) / 1000),
        good: typedNumberOr(good[l.id]),
        scrap: typedNumberOr(scrap[l.id]),
      };
    }),
    [r.lines, good, scrap],
  );

  const blockers = settleBlockers({
    lines: rows.map((x) => ({
      lineId: x.line.id,
      qty: x.line.qty,
      goodSoFar: x.line.goodQty ?? 0,
      scrapSoFar: x.line.scrapQty ?? 0,
      good: x.good,
      scrap: x.scrap,
    })),
    lossKind,
    lossNote,
  });

  const scrapping = rows.some((x) => x.scrap > 0);
  const stillLeft = rows.reduce((s, x) => s + Math.max(0, x.left - x.good - x.scrap), 0);

  return (
    <BottomSheet open onClose={onClose} title="What happened to it" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        {/* ⚠️ Said plainly: only the bin moves stock. */}
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          What was repacked is already on the shelf and needs no movement. What is thrown away comes
          off it now. Anything you leave blank stays on the bench, and you can come back to it.
        </p>

        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span className="text-right">On the bench</span>
            <span className="text-right">Repacked</span>
            <span className="text-right">Thrown</span>
          </div>
          <div className="max-h-[20rem] overflow-y-auto">
            {rows.map((x) => (
              <div key={x.line.id} className="grid grid-cols-[minmax(0,1fr)_90px_110px_110px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={x.line.itemName}>
                  {x.line.itemName}
                  {x.line.batchNo && <span className="ml-1.5 text-xs text-fg-subtle">{x.line.batchNo}</span>}
                </span>
                <span className="text-right text-sm tabular text-fg-muted">{qtyText(x.left)}</span>
                <input value={good[x.line.id] ?? ""} onChange={(e) => setGood((g) => ({ ...g, [x.line.id]: e.target.value }))}
                  inputMode="decimal" disabled={x.left <= 0}
                  className={`${FIELD} text-right tabular disabled:opacity-40`} placeholder="–"
                  aria-label={`Repacked, ${x.line.itemName}`} />
                <input value={scrap[x.line.id] ?? ""} onChange={(e) => setScrap((s) => ({ ...s, [x.line.id]: e.target.value }))}
                  inputMode="decimal" disabled={x.left <= 0}
                  className={`${FIELD} text-right tabular disabled:opacity-40`} placeholder="–"
                  aria-label={`Thrown away, ${x.line.itemName}`} />
              </div>
            ))}
          </div>
        </div>

        {/* ⚠️ Note #12: a loss must say where it belongs AND why. Naming the kind
            is not enough — "handling" tells nobody whether a crate was dropped
            or a shelf collapsed. */}
        {scrapping && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2.5">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Where does the loss belong</span>
            <div className="flex flex-wrap gap-1.5">
              {CZ_LOSS_REASONS.map((k) => (
                <button key={k.key} type="button" onClick={() => setLossKind(k.key)} title={k.hint}
                  className={`h-8 rounded-md px-2.5 text-sm ${
                    lossKind === k.key ? "bg-accent text-accent-fg" : "border border-border text-fg-muted hover:text-fg"}`}>
                  {k.label}
                </button>
              ))}
            </div>
            {lossKind && (
              <p className="text-xs text-fg-subtle">{CZ_LOSS_REASONS.find((x) => x.key === lossKind)?.hint}</p>
            )}
            <input value={lossNote} onChange={(e) => setLossNote(e.target.value)} className={FIELD}
              placeholder="What actually happened — a crate was dropped in the van…" />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">On what date</span>
            <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={FIELD} />
          </label>
          {stillLeft > 0.0005 && (
            <p className="self-end text-sm text-warn">
              {qtyText(stillLeft)} will stay on the bench.
            </p>
          )}
        </div>

        {blockers.length > 0 && (rows.some((x) => x.good > 0 || x.scrap > 0)) && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" disabled={busy || blockers.length > 0}
            onClick={() => onDone({
              decided: rows
                .filter((x) => x.good > 0 || x.scrap > 0)
                .map((x) => ({ lineId: x.line.id, good: x.good, scrap: x.scrap })),
              lossKind,
              lossNote: lossNote || null,
              onDate,
            })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Record it
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}
