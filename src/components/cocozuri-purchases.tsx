"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { BookOpen, Check, Loader2, Plus, ShoppingCart, Trash2, Undo2, X } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { SearchInput } from "@/components/ui";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { useToast } from "@/components/toast";
import { CocozuriPurchaseSheet } from "@/components/cocozuri-purchase-sheet";
import { czDate, money } from "@/lib/cocozuri-shared";
import type { CzStockItem, CzStockLocation } from "@/lib/cocozuri-stock-shared";
import {
  paidFromLabel, purchaseTotals, supplierLabel,
  type CzBudget, type CzPurchase,
} from "@/lib/cocozuri-buy-shared";
import {
  approvePurchaseAction, cancelPurchaseAction, deletePurchaseAction,
  postPurchaseAction, unpostPurchaseAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * What was bought.
 *
 * ⚠️ THREE STATES, AND THE MIDDLE ONE IS THE WHOLE POINT. A draft has been
 * typed and nothing more — no stock, no books, no commitment. Approving it is
 * what puts the goods on the shelf at their landed cost, and it carries
 * somebody's name and the moment they did it. Cancelling reverses those
 * movements rather than erasing them.
 *
 * ⚠️ A PURCHASE WITH NO SUPPLIER IS NORMAL HERE and is never flagged as a
 * problem — the owner was explicit that raw materials are often bought at
 * random or out of somebody's own pocket, and a system that nags about it is a
 * system people stop using.
 * ------------------------------------------------------------------ */

type Row = CzPurchase & {
  supplier: string;
  purchasedLabel: string;
  paidLabel: string;
  statusLabel: string;
  totalLabel: string;
  total: number;
  vatUnknown: boolean;
};

const STATUS_TONE: Record<CzPurchase["status"], "warn" | "success" | "danger"> = {
  draft: "warn",
  approved: "success",
  cancelled: "danger",
};

export function CocozuriPurchases({
  purchases, budgets, locations, items, vendors, people, openNew, books, booksReady, booksReason,
}: {
  purchases: CzPurchase[];
  budgets: CzBudget[];
  locations: CzStockLocation[];
  items: CzStockItem[];
  vendors: { id: number; name: string }[];
  people: { id: number; name: string }[];
  openNew?: boolean;
  /** purchaseId → whether it is in the books. Resolved server-side in ONE query. */
  books: Record<number, "unposted" | "posted" | "reversed">;
  booksReady: boolean;
  booksReason: string | null;
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CzPurchase["status"] | null>(null);
  const [recording, setRecording] = useState(!!openNew);
  const [editing, setEditing] = useState<CzPurchase | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  /**
   * ⚠️ THE `?new=1` FLAG IS TAKEN OUT OF THE ADDRESS AS SOON AS IT HAS BEEN
   * USED. `revalidatePath("/cocozuri/purchases")` does not invalidate the
   * client's cached entry for `/cocozuri/purchases?new=1` — different keys — so
   * on the deep link the purchase saves and the list does not move, and
   * pressing the button again records it twice. Measured on the payments page,
   * and it is the same trap here.
   */
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/purchases");
  }, [openNew]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return purchases
      .filter((p) => (status == null ? true : p.status === status))
      .map((p) => {
        const t = purchaseTotals(p.lines, p.vatRate, p.taxInclusive, p.freightAmount);
        return {
          ...p,
          supplier: supplierLabel(p),
          purchasedLabel: czDate(p.purchasedOn),
          paidLabel: paidFromLabel(p.paidFrom),
          statusLabel: p.status === "draft" ? "Draft" : p.status === "approved" ? "Approved" : "Cancelled",
          total: t.payable,
          totalLabel: money(t.payable, p.currency),
          vatUnknown: !t.vatKnown,
        };
      })
      .filter((p) =>
        !term ||
        p.reference.toLowerCase().includes(term) ||
        p.supplier.toLowerCase().includes(term) ||
        (p.supplierRef ?? "").toLowerCase().includes(term) ||
        p.lines.some((l) => l.description.toLowerCase().includes(term)));
  }, [purchases, q, status]);

  const counts = useMemo(() => {
    const m = new Map<CzPurchase["status"], number>();
    for (const p of purchases) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return m;
  }, [purchases]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All purchases", count: purchases.length, href: "#", active: status == null, onSelect: () => setStatus(null) },
    ...(["draft", "approved", "cancelled"] as const)
      .filter((s) => counts.has(s))
      .map((s) => ({
        key: s,
        label: s === "draft" ? "Waiting to be approved" : s === "approved" ? "Approved" : "Cancelled",
        count: counts.get(s)!,
        href: "#", active: status === s, group: "Status",
        tone: STATUS_TONE[s], onSelect: () => setStatus(s),
      })),
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_purchase!.listColumns, {
    overrides: {
      supplier: (r) => (
        <span className="min-w-0 truncate text-sm text-fg" title={r.lines.map((l) => l.description).join(", ")}>
          {/* ⚠️ "Not named" is shown as a plain, quiet fact rather than a
              warning. It is a legitimate answer here. */}
          <span className={r.supplier === "Not named" ? "text-fg-subtle" : undefined}>{r.supplier}</span>
          <span className="ml-1.5 text-xs text-fg-subtle">
            {r.lines.length} line{r.lines.length === 1 ? "" : "s"}
          </span>
        </span>
      ),
      totalLabel: (r) => (
        <span className="tabular text-sm text-fg">
          {r.totalLabel}
          {/* A quiet mark, not a column of its own. */}
          {books[r.id] === "posted" && (
            <BookOpen size={11} className="ml-1 inline-block align-[-1px] text-success" aria-label="In the books" />
          )}
          {books[r.id] === "reversed" && (
            <Undo2 size={11} className="ml-1 inline-block align-[-1px] text-warn" aria-label="Taken back out of the books" />
          )}
          {/* ⚠️ A rated purchase nobody has answered the VAT question on. The
              total shown is the goods as typed and the split is not offered —
              said, rather than quietly resolved one way. */}
          {r.vatUnknown && (
            <span className="ml-1 text-xs text-warn" title={`Carries VAT at ${r.vatRate}% and nobody has said whether the prices include it`}>?</span>
          )}
        </span>
      ),
    },
  });

  async function approve(r: Row, acknowledgeOverBudget = false) {
    const who = window.prompt(
      `Approve ${r.reference} — ${r.totalLabel}?\n\nThis puts the goods on the shelf at what they cost, freight and all.\n\nWho is approving it?`,
      "",
    );
    if (who === null) return;
    if (!who.trim()) { toast("An approval needs a name against it.", { tone: "danger" }); return; }
    await runApproval(r, who.trim(), acknowledgeOverBudget);
  }

  async function runApproval(r: Row, who: string, acknowledgeOverBudget: boolean) {
    setBusy(r.id);
    const res = await approvePurchaseAction(r.id, { name: who }, { acknowledgeOverBudget });
    setBusy(null);
    if (!res.ok) {
      // ⚠️ An overrun is a decision, not a dead end. The goods were bought; the
      // question is whether somebody is willing to say so.
      if (res.overBy != null && !acknowledgeOverBudget) {
        if (window.confirm(`${res.error}\n\nApprove it anyway?`)) {
          await runApproval(r, who, true);
          return;
        }
        return;
      }
      toast(res.error ?? "Could not approve it.", { tone: "danger" });
      return;
    }
    toast(`${r.reference} approved — ${r.lines.length} line${r.lines.length === 1 ? "" : "s"} on the shelf.`, { tone: "success" });
    start(() => {});
  }

  async function post(r: Row) {
    setBusy(r.id);
    const res = await postPurchaseAction(r.id);
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Could not post it.", { tone: "danger" }); return; }
    toast(`${r.reference} is in the books.`, { tone: "success" });
    start(() => {});
  }

  async function reverse(r: Row) {
    const why = window.prompt(`Take ${r.reference} back out of the books? The original entries and their reversal both stay on the record.\n\nWhy?`);
    if (why === null) return;
    setBusy(r.id);
    const res = await unpostPurchaseAction(r.id, why || null);
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Could not reverse it.", { tone: "danger" }); return; }
    toast("Taken out of the books, with a reversal on the record.", { tone: "success" });
    start(() => {});
  }

  async function cancel(r: Row) {
    const why = window.prompt(
      r.status === "approved"
        ? `Cancel ${r.reference}? This takes the stock back off the shelf with an opposite movement — nothing is erased.\n\nWhy?`
        : `Cancel ${r.reference}?\n\nWhy?`,
    );
    if (why === null) return;
    setBusy(r.id);
    const res = await cancelPurchaseAction(r.id, why || null);
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Could not cancel it.", { tone: "danger" }); return; }
    toast(`${r.reference} cancelled.`, { tone: "success" });
    start(() => {});
  }

  async function remove(r: Row) {
    if (!window.confirm(`Remove the draft ${r.reference}? Nothing has moved, so there is nothing to reverse.`)) return;
    const res = await deletePurchaseAction(r.id);
    if (!res.ok) { toast(res.error ?? "Could not remove it.", { tone: "danger" }); return; }
    toast("Draft removed.", { tone: "success" });
    start(() => {});
  }

  const waiting = purchases.filter((p) => p.status === "draft").length;
  const total = rows.reduce((t, r) => t + r.total, 0);

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        listKey="cz_purchase"
        filters={rail}
        total={purchases.length}
        shown={rows.length}
        exportName="cocozuri-purchases"
        onRowClick={(r) => setEditing(r.status === "draft" ? r : null)}
        rowActions={(r) => (
          <span className="flex items-center gap-1.5">
            {busy === r.id && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
            {r.status === "draft" && (
              <button type="button" onClick={(e) => { e.stopPropagation(); void approve(r); }}
                className="text-fg-subtle hover:text-success" title="Approve — this puts it on the shelf">
                <Check size={13} />
              </button>
            )}
            {r.status === "approved" && books[r.id] !== "posted" && books[r.id] !== "reversed" && booksReady && (
              <button type="button" onClick={(e) => { e.stopPropagation(); void post(r); }}
                className="text-fg-subtle hover:text-accent" title="Post to the ledger">
                <BookOpen size={13} />
              </button>
            )}
            {books[r.id] === "posted" && (
              <button type="button" onClick={(e) => { e.stopPropagation(); void reverse(r); }}
                className="text-fg-subtle hover:text-warn" title="Take it back out of the books">
                <Undo2 size={13} />
              </button>
            )}
            {r.status !== "cancelled" && (
              <button type="button" onClick={(e) => { e.stopPropagation(); void cancel(r); }}
                className="text-fg-subtle hover:text-warn" title="Cancel it">
                <X size={13} />
              </button>
            )}
            {r.status === "draft" && (
              <button type="button" onClick={(e) => { e.stopPropagation(); void remove(r); }}
                className="text-fg-subtle hover:text-danger" title="Remove this draft">
                <Trash2 size={13} />
              </button>
            )}
          </span>
        )}
        footerNote={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{money(total)} shown</span>
            {waiting > 0 && (
              <span className="text-warn">
                {waiting} waiting to be approved — nothing is on the shelf until somebody approves it
              </span>
            )}
            {!booksReady && booksReason && <span className="text-fg-subtle">{booksReason}</span>}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, supplier, item…"
              wrapperClassName="w-[16rem]" className="h-8 text-sm" />
            <span className="grow" />
            <CocozuriHelp title="Buying">
              <p>
                <strong>Approving is what makes a purchase count.</strong> A draft moves no stock and
                reaches no books &mdash; which is what makes it safe to type while the delivery is
                still coming through the door. Approving writes the delivery onto the shelf;
                cancelling writes it back off the opposite way, never by erasing.
              </p>
              <p>
                <strong>A supplier is optional and always will be.</strong> Materials are often
                bought at random or out of somebody&rsquo;s own pocket, and a form insisting on a
                supplier simply would not get filled in. A purchase nobody records never reaches the
                books at all.
              </p>
              <p>
                <strong>Who paid decides who is owed.</strong> Bank or cash box was settled the day
                it was bought. On credit, the supplier is owed. Bought with somebody&rsquo;s own
                money, <em>that person</em> is owed it back &mdash; not the supplier, and not the
                bank, because the money never left it.
              </p>
              <p>
                <strong>Freight goes into the stock, spread across the lines by value.</strong>
                Booking it as an expense would make the almonds look cheaper than they were, and
                every batch costed from them wrong the same way.
              </p>
              <p>
                <strong>&ldquo;Does the price include VAT&rdquo; has three answers</strong> &mdash;
                yes, no, and nobody has said. The same 1,180,000 is either plus VAT or includes it,
                so a rated purchase nobody has answered for cannot be approved.
              </p>
            </CocozuriHelp>
            <button type="button" onClick={() => setRecording(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Record a purchase
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ShoppingCart size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing bought yet.</p>
            <p className="max-w-[30rem] text-sm text-fg-subtle">
              Record what came in — raw materials, packaging, anything you count. A supplier is
              optional: a kilo of flour off the market, bought with somebody&rsquo;s own money, is
              recorded exactly the same way, and the person who paid is shown as owed it back.
            </p>
          </div>
        }
      />

      {(recording || editing) && (
        <CocozuriPurchaseSheet
          purchase={editing}
          budgets={budgets}
          locations={locations}
          items={items}
          vendors={vendors}
          people={people}
          onClose={() => { setRecording(false); setEditing(null); }}
        />
      )}
    </>
  );
}
