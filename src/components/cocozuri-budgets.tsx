"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Lock, Plus, RotateCcw, Trash2, Wallet, X } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { BottomSheet } from "@/components/bottom-sheet";
import { FluidSelect } from "@/components/fluid-select";
import { FIELD, SearchInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { money } from "@/lib/cocozuri-shared";
import type { CzStockLocation } from "@/lib/cocozuri-stock-shared";
import {
  budgetMonth, budgetUsage,
  type CzBudget, type CzBudgetStatus, type CzPurchase,
} from "@/lib/cocozuri-buy-shared";
import {
  closeBudgetAction, createBudgetAction, decideBudgetAction,
  deleteBudgetAction, reopenBudgetAction, updateBudgetAction,
} from "@/app/cocozuri/actions";
import { typedNumber, typedNumberOr, hasPositive } from "@/lib/typed-number";

/* ------------------------------------------------------------------ *
 * Money somebody has said may be spent.
 *
 * ⚠️ THIS EXISTS BECAUSE THE OWNER ASKED FOR IT BY NAME: "someone approves a
 * budget" (plan §5a) — not just a purchase, a budget. So the approval is a
 * PERSON AND A MOMENT, shown on the row, and never a tick nobody signed.
 *
 * ⚠️ NOTHING IS STORED BUT THE AMOUNT. What has been spent and what is left are
 * worked out from the approved purchases every time this page is opened, which
 * is why they cannot go stale the way the workbook's hand-typed totals did.
 * ------------------------------------------------------------------ */

/* ⚠️ THE KIT'S FIELD, not a local one. Seven files had grown their own
   `const INPUT` and no two agreed — see the note on `FIELD` in ui.tsx. */
const INPUT = FIELD;

type Row = CzBudget & {
  periodLabel: string;
  locationLabel: string;
  statusLabel: string;
  amountLabel: string;
  leftLabel: string;
  spent: number;
  left: number;
  over: boolean;
  count: number;
};

const STATUS_LABEL: Record<CzBudgetStatus, string> = {
  draft: "Draft",
  submitted: "Waiting",
  approved: "Approved",
  rejected: "Turned down",
  closed: "Closed",
};

export function CocozuriBudgets({
  budgets, purchases, locations, people, openNew,
}: {
  budgets: CzBudget[];
  /** Every purchase — what has been spent is derived from them, never stored. */
  purchases: CzPurchase[];
  locations: CzStockLocation[];
  people: { id: number; name: string }[];
  openNew?: boolean;
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CzBudgetStatus | null>(null);
  const [editing, setEditing] = useState<CzBudget | null>(null);
  const [adding, setAdding] = useState(!!openNew);
  const [busy, setBusy] = useState<number | null>(null);

  // ⚠️ The flag is consumed, or Back re-opens the form — see the note on the
  // payments page, where leaving it in the address recorded a payment twice.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/budgets");
  }, [openNew]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return budgets
      .filter((b) => (status == null ? true : b.status === status))
      .map((b) => {
        const use = budgetUsage(b, purchases);
        return {
          ...b,
          periodLabel: `${short(b.startsOn)} – ${short(b.endsOn)}`,
          locationLabel: b.locationName ?? "Anywhere",
          statusLabel: STATUS_LABEL[b.status],
          amountLabel: money(b.amount),
          leftLabel: money(use.remaining),
          spent: use.spent,
          left: use.remaining,
          over: use.over,
          count: use.count,
        };
      })
      .filter((b) => !term || b.title.toLowerCase().includes(term) || b.locationLabel.toLowerCase().includes(term));
  }, [budgets, purchases, q, status]);

  const counts = useMemo(() => {
    const m = new Map<CzBudgetStatus, number>();
    for (const b of budgets) m.set(b.status, (m.get(b.status) ?? 0) + 1);
    return m;
  }, [budgets]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All budgets", count: budgets.length, href: "#", active: status == null, onSelect: () => setStatus(null) },
    ...(["draft", "submitted", "approved", "rejected", "closed"] as const)
      .filter((s) => counts.has(s))
      .map((s) => ({
        key: s, label: STATUS_LABEL[s], count: counts.get(s)!, href: "#",
        active: status === s, group: "Status",
        tone: s === "approved" ? ("success" as const) : s === "rejected" ? ("danger" as const) : undefined,
        onSelect: () => setStatus(s),
      })),
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_budget!.listColumns, {
    overrides: {
      title: (r) => (
        <span className="min-w-0 truncate text-sm text-fg">
          {r.title}
          {/* ⚠️ WHO APPROVED IT, ON THE ROW. That is the one question a budget
              exists to answer, and burying it in a drawer answers it for nobody. */}
          {r.decidedBy && (
            <span className="ml-1.5 text-xs text-fg-subtle">
              {r.status === "approved" ? "approved by" : "decided by"} {r.decidedBy}
            </span>
          )}
        </span>
      ),
      leftLabel: (r) => (
        <span className={`tabular text-sm ${r.over ? "text-danger" : r.left === r.amount ? "text-fg-subtle" : "text-fg"}`}
          title={`${money(r.spent)} spent across ${r.count} purchase${r.count === 1 ? "" : "s"}`}>
          {r.leftLabel}
        </span>
      ),
    },
  });

  async function decide(r: Row, decision: "approved" | "rejected") {
    const who = window.prompt(
      decision === "approved"
        ? `Approve "${r.title}" — ${r.amountLabel}?\n\nWho is approving it?`
        : `Turn down "${r.title}"?\n\nWho is deciding?`,
      "",
    );
    if (who === null) return;
    if (!who.trim()) { toast("A decision needs a name against it.", { tone: "danger" }); return; }
    // ⚠️ A refusal must say why, or the same request simply comes back.
    let note: string | null = null;
    if (decision === "rejected") {
      note = window.prompt("Why was it turned down?");
      if (note === null) return;
      if (!note.trim()) { toast("Say why it was turned down.", { tone: "danger" }); return; }
    }
    setBusy(r.id);
    const res = await decideBudgetAction(r.id, decision, { name: who.trim() }, note);
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Could not save the decision.", { tone: "danger" }); return; }
    toast(decision === "approved" ? `"${r.title}" approved by ${who.trim()}.` : `"${r.title}" turned down.`, { tone: "success" });
    start(() => {});
  }

  async function reopen(r: Row) {
    const why = window.prompt(`Reopen "${r.title}"?\n\nThe approval is cleared — it was against a figure that is about to change.\n\nWhy?`);
    if (why === null) return;
    setBusy(r.id);
    const res = await reopenBudgetAction(r.id, why || null);
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Could not reopen it.", { tone: "danger" }); return; }
    toast(`"${r.title}" is a draft again.`, { tone: "success" });
    start(() => {});
  }

  async function close(r: Row) {
    if (!window.confirm(`Close "${r.title}"? It stops being offered on new purchases. What was spent against it stays on the record.`)) return;
    const res = await closeBudgetAction(r.id);
    if (!res.ok) { toast(res.error ?? "Could not close it.", { tone: "danger" }); return; }
    toast("Closed.", { tone: "success" });
    start(() => {});
  }

  async function remove(r: Row) {
    if (!window.confirm(`Remove "${r.title}"?`)) return;
    const res = await deleteBudgetAction(r.id);
    if (!res.ok) { toast(res.error ?? "Could not remove it.", { tone: "danger" }); return; }
    toast("Removed.", { tone: "success" });
    start(() => {});
  }

  const approved = rows.filter((r) => r.status === "approved");
  const overrun = approved.filter((r) => r.over).length;

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        listKey="cz_budget"
        filters={rail}
        total={budgets.length}
        shown={rows.length}
        exportName="cocozuri-budgets"
        onRowClick={(r) => setEditing(r.status === "approved" || r.status === "closed" ? null : r)}
        rowActions={(r) => (
          <span className="flex items-center gap-1.5">
            {busy === r.id && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
            {(r.status === "draft" || r.status === "submitted") && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); void decide(r, "approved"); }}
                  className="text-fg-subtle hover:text-success" title="Approve it">
                  <Check size={13} />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); void decide(r, "rejected"); }}
                  className="text-fg-subtle hover:text-danger" title="Turn it down">
                  <X size={13} />
                </button>
              </>
            )}
            {(r.status === "approved" || r.status === "rejected") && (
              <button type="button" onClick={(e) => { e.stopPropagation(); void reopen(r); }}
                className="text-fg-subtle hover:text-warn" title="Reopen it — the approval is cleared">
                <RotateCcw size={13} />
              </button>
            )}
            {r.status !== "closed" && (
              <button type="button" onClick={(e) => { e.stopPropagation(); void close(r); }}
                className="text-fg-subtle hover:text-fg" title="Close it">
                <Lock size={13} />
              </button>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); void remove(r); }}
              className="text-fg-subtle hover:text-danger" title="Remove it">
              <Trash2 size={13} />
            </button>
          </span>
        )}
        footerNote={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{money(approved.reduce((t, r) => t + r.amount, 0))} approved</span>
            <span className="text-fg-subtle tabular">{money(approved.reduce((t, r) => t + r.spent, 0))} of it spent</span>
            {overrun > 0 && <span className="text-danger">{overrun} overrun</span>}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Budget or place…"
              wrapperClassName="w-[16rem]" className="h-8 text-sm" />
            <span className="grow" />
            <button type="button" onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Set a budget
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Wallet size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">No budgets set.</p>
            <p className="max-w-[30rem] text-sm text-fg-subtle">
              Set an amount for a period — and, if you want, for one place — and somebody approves
              it. Purchases are then checked against it: going over is allowed, because the goods
              were bought, but somebody has to say so.
            </p>
          </div>
        }
      />

      {(adding || editing) && (
        <BudgetSheet
          budget={editing}
          locations={locations}
          people={people}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </>
  );
}

function BudgetSheet({
  budget, locations, onClose,
}: {
  budget: CzBudget | null;
  locations: CzStockLocation[];
  people: { id: number; name: string }[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const month = budgetMonth(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(budget?.title ?? "");
  const [locationId, setLocationId] = useState<number | null>(budget?.locationId ?? null);
  const [startsOn, setStartsOn] = useState(budget?.startsOn ?? month.from);
  const [endsOn, setEndsOn] = useState(budget?.endsOn ?? month.to);
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "");
  const [notes, setNotes] = useState(budget?.notes ?? "");

  /** What is stopping this being saved, in words. */
  const blockers: string[] = [];
  if (!title.trim()) blockers.push("Give it a name — what the money is for.");
  if (amount.trim() === "") blockers.push("Say how much.");
  else if (typedNumber(amount) == null) blockers.push(`"${amount}" is not a figure this can read.`);
  else if (!hasPositive(amount)) blockers.push("The amount has to be more than nothing.");
  if (endsOn < startsOn) blockers.push("The budget ends before it starts.");

  async function save() {
    const input = {
      title, locationId, startsOn, endsOn,
      amount: typedNumberOr(amount),
      notes: notes || null,
    };
    setBusy(true);
    const res = budget ? await updateBudgetAction(budget.id, input) : await createBudgetAction(input);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not save it.", { tone: "danger" }); return; }
    toast(budget ? "Budget saved." : "Budget set — somebody has to approve it before it counts.", { tone: "success" });
    onClose();
    start(() => {});
  }

  return (
    <BottomSheet open onClose={onClose} title={budget ? "Edit the budget" : "Set a budget"} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <Field label="What the money is for">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT}
            placeholder="Raw materials, September" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="From">
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={INPUT} />
          </Field>
          <Field label="To">
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Amount">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
              className={`${INPUT} text-right tabular`} placeholder="0" />
          </Field>
        </div>
        <Field label="Where">
          <FluidSelect
            value={locationId == null ? "" : String(locationId)}
            onSelect={(v) => setLocationId(v ? Number(v) : null)}
            options={[
              { value: "", label: "Anywhere" },
              ...locations.map((l) => ({ value: String(l.id), label: l.name })),
            ]}
          />
          <span className="text-xs text-fg-subtle">
            A budget for one place only counts purchases that landed there.
          </span>
        </Field>
        <Field label="Note">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT}
            placeholder="Anything worth saying about this budget" />
        </Field>

        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          {/* ⚠️ Said on the form, so nobody is surprised later that a budget
              they typed is not doing anything. */}
          A budget does nothing until somebody approves it — and a purchase can only be charged to an
          approved one. Spending is measured against <strong>what leaves the bank</strong>: the full
          amount including VAT and any transit cost.
        </p>

        {/* ⚠️ A DEAD BUTTON MUST SAY WHY IT IS DEAD. This one was greyed out with
            nothing on screen to explain it — and the commonest reason was that
            the amount had been typed as "750,000", which `Number()` reads as
            NaN. Two faults in one press: an unreadable figure, and silence
            about it. */}
        {blockers.length > 0 && (title.trim() !== "" || amount.trim() !== "") && (
          <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />} {budget ? "Save it" : "Set it"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

function short(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
