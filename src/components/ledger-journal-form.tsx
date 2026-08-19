"use client";

// ONE JOURNAL ENTRY — write it, check it, post it (Phase 1).
//
// This screen is where a person meets the five rules, so it has to explain them
// rather than merely obey them:
//
//   · The running Dr/Cr/difference strip is always on screen, and **Post is
//     dead until the difference is nil**. `checkVoucher()` — the same pure
//     function the engine runs — decides, so the screen can never say "ready"
//     to something the server will refuse.
//   · Once posted, every field goes read-only and the only button left is
//     Reverse. Not "disabled in the UI": the server refuses too.
//   · What it actually put in the books is shown underneath, from `gl_entries`.
//     A voucher that claims to be posted and shows nothing there is a bug you
//     can see.
//
// ⚠️ Imports `ledger-shared`, never a server ledger file.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Badge, Button, FieldLabel, Input, Textarea } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { FluidSelect } from "@/components/fluid-select";
import { cn } from "@/lib/cn";
import {
  BASE_CURRENCY, checkVoucher, eatDay, isBaseCurrency, ledgerAmount, num,
  voucherTotals,
  type GlAccount, type GlEntry, type JournalEntry, type JournalLine, type VoucherLine,
} from "@/lib/ledger-shared";
import {
  deleteJournalAction, postJournalAction, reverseJournalAction,
  saveJournalLinesAction, updateJournalAction,
} from "@/app/ledger/actions";

type Row = {
  key: string;
  accountId: number;
  debit: string;
  credit: string;
  party: string;
  costCentre: string;
  remarks: string;
};

let nextKey = 0;
const blank = (): Row => ({
  key: `r${nextKey++}`, accountId: 0, debit: "", credit: "", party: "", costCentre: "", remarks: "",
});

function toRows(lines: JournalLine[]): Row[] {
  if (lines.length === 0) return [blank(), blank()];
  return lines.map((l) => ({
    key: `l${l.id}`,
    accountId: l.accountId,
    // A nil side shows blank, not "0.00" — the same reason the ledger columns do.
    debit: (num(l.debit) ?? 0) > 0 ? String(num(l.debit)) : "",
    credit: (num(l.credit) ?? 0) > 0 ? String(num(l.credit)) : "",
    party: l.party ?? "",
    costCentre: l.costCentre ?? "",
    remarks: l.remarks ?? "",
  }));
}

export function LedgerJournalForm({
  entry, lines, accounts, postedEntries, reversalEntries = [], reversal,
}: {
  entry: JournalEntry;
  lines: JournalLine[];
  accounts: GlAccount[];
  postedEntries: GlEntry[];
  /** ⚠️ The REVERSAL's entries, which belong to a different voucher. Shown
   *  here anyway: "what did this document do to the books" is not answered by
   *  the postings alone once something has cancelled them.
   *  ⚠️ Defaulted, like `OpsTabs`'s company list: a caller that forgets it must
   *  not take the whole record down with "not iterable". */
  reversalEntries?: GlEntry[];
  reversal: JournalEntry | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reversing, setReversing] = useState(false);

  const frozen = entry.status !== "Draft";

  const [head, setHead] = useState({
    postingDate: entry.postingDate?.slice(0, 10) ?? "",
    title: entry.title ?? "",
    narration: entry.narration ?? "",
    currency: entry.currency ?? "",
    exRate: entry.exRate ?? "",
  });
  const [rows, setRows] = useState<Row[]>(() => toRows(lines));

  const postable = useMemo(
    () => accounts.filter((a) => !a.isGroup && !a.archived),
    [accounts],
  );
  const options = useMemo(
    () => postable.map((a) => ({ value: String(a.id), label: `${a.number} · ${a.name}` })),
    [postable],
  );

  /* ── the running check, from the SAME function the engine uses ────────── */
  const voucherLines: VoucherLine[] = useMemo(
    () => rows
      .filter((r) => r.accountId || r.debit || r.credit)
      .map((r) => ({
        accountId: r.accountId,
        debit: num(r.debit) ?? 0,
        credit: num(r.credit) ?? 0,
        party: r.party || null,
        costCentre: r.costCentre || null,
        remarks: r.remarks || null,
      })),
    [rows],
  );
  const totals = voucherTotals(voucherLines);
  const check = useMemo(
    () => checkVoucher(voucherLines, accounts, { companyId: entry.companyId }),
    [voucherLines, accounts, entry.companyId],
  );
  const needsRate = !isBaseCurrency(head.currency) && !(num(head.exRate) ?? 0);
  const ready = check.ok && !needsRate;

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null); setSaved(false);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not work.");
      else { setSaved(true); after?.(); router.refresh(); }
    });
  };

  const save = () => run(async () => {
    const h = await updateJournalAction(entry.id, {
      postingDate: head.postingDate,
      title: head.title || null,
      narration: head.narration || null,
      currency: head.currency || null,
      exRate: head.exRate || null,
    });
    if (!h.ok) return h;
    return saveJournalLinesAction(entry.id, voucherLines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      party: l.party,
      costCentre: l.costCentre,
      remarks: l.remarks,
    })));
  });

  const post = () => run(async () => {
    // ⚠️ Save first. Posting reads the SAVED lines, not what is on screen —
    // otherwise a person could post one voucher while looking at another.
    const s = await updateJournalAction(entry.id, {
      postingDate: head.postingDate,
      title: head.title || null,
      narration: head.narration || null,
      currency: head.currency || null,
      exRate: head.exRate || null,
      lines: voucherLines.map((l) => ({
        accountId: l.accountId, debit: l.debit, credit: l.credit,
        party: l.party, costCentre: l.costCentre, remarks: l.remarks,
      })),
    });
    if (!s.ok) return s;
    return postJournalAction(entry.id);
  });

  // ⚠️ Read the JOURNAL's status, not just its own entries. A journal is undone
  // by a second journal, so its own rows still look live — which is true of
  // them and false of the document.
  const undone = entry.status === "Reversed" || reversalEntries.length > 0;
  const bookRows = [...postedEntries, ...reversalEntries];

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div>
      )}
      {saved && !error && (
        <div className="rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-[13px] text-success">
          Saved.
        </div>
      )}

      {frozen && (
        <div className="rounded-lg border border-border bg-bg-muted px-3 py-2 text-[13px] text-fg-muted">
          <strong className="text-fg">{entry.entryNo} is in the books and can never be changed.</strong>{" "}
          That is not a setting — a posted entry is a fact, and the way to correct a fact is to post a
          reversal beside it, so both remain on the record.
          {reversal && (
            <> It was reversed by{" "}
              <a href={`/ledger/journals/${reversal.id}?co=${entry.companyId}`} className="text-accent hover:underline">
                {reversal.entryNo}
              </a>.
            </>
          )}
        </div>
      )}

      {/* ── the head ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-bg-elev p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel>Date</FieldLabel>
            <Input
              type="date"
              value={head.postingDate}
              disabled={frozen}
              onChange={(e) => setHead((h) => ({ ...h, postingDate: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>What it is</FieldLabel>
            <Input
              value={head.title}
              disabled={frozen}
              placeholder="August depreciation"
              onChange={(e) => setHead((h) => ({ ...h, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Currency</FieldLabel>
              <Input
                value={head.currency}
                disabled={frozen}
                placeholder={BASE_CURRENCY}
                onChange={(e) => setHead((h) => ({ ...h, currency: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <FieldLabel>Rate</FieldLabel>
              <Input
                value={head.exRate}
                disabled={frozen || isBaseCurrency(head.currency)}
                placeholder="—"
                onChange={(e) => setHead((h) => ({ ...h, exRate: e.target.value }))}
              />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <FieldLabel>Narration</FieldLabel>
            <Textarea
              rows={2}
              value={head.narration}
              disabled={frozen}
              placeholder="Why this entry exists — the sentence an auditor will read in two years."
              onChange={(e) => setHead((h) => ({ ...h, narration: e.target.value }))}
            />
          </div>
        </div>
        {needsRate && !frozen && (
          <p className="mt-2 text-[12px] text-warn">
            This entry is in {head.currency} and has no rate. The books are kept in shillings, and recording
            foreign money without a rate would make them fiction — so it cannot be posted until you give one.
          </p>
        )}
      </div>

      {/* ── the lines ────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr data-list-head className="border-b border-border text-left">
                <Th className="w-[30%]">Account</Th>
                <Th className="w-32 text-right">Debit</Th>
                <Th className="w-32 text-right">Credit</Th>
                <Th className="w-36">Who it is against</Th>
                <Th className="w-32">Cost centre</Th>
                <Th>Note</Th>
                {!frozen && <Th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-list-row className="border-b border-border/60 last:border-0">
                  <Td>
                    {frozen ? (
                      <span>{accountLabel(accounts, r.accountId)}</span>
                    ) : (
                      <FluidSelect
                        value={r.accountId ? String(r.accountId) : ""}
                        options={options}
                        placeholder="Choose an account…"
                        onSelect={(v) => setRow(r.key, { accountId: Number(v) })}
                        buttonClassName="h-8 w-full"
                      />
                    )}
                  </Td>
                  {/* ⚠️ A frozen entry is rendered as TEXT, not as greyed-out
                      boxes. Desk's rule is that a field is a visible box
                      BECAUSE you can type in it — so a record nobody may
                      change should not be wearing any. It also makes the
                      voucher readable, which is the point of looking at it. */}
                  <Td className="tabular text-right">
                    {frozen ? (
                      ledgerAmount(num(r.debit)) || <span className="text-fg-subtle">—</span>
                    ) : (
                      <Amount
                        value={r.debit}
                        // ⚠️ Typing in one side clears the other. A line is a
                        // debit OR a credit; letting both be typed only produces
                        // a voucher the engine will refuse.
                        onChange={(v) => setRow(r.key, { debit: v, credit: v ? "" : r.credit })}
                      />
                    )}
                  </Td>
                  <Td className="tabular text-right">
                    {frozen ? (
                      ledgerAmount(num(r.credit)) || <span className="text-fg-subtle">—</span>
                    ) : (
                      <Amount
                        value={r.credit}
                        onChange={(v) => setRow(r.key, { credit: v, debit: v ? "" : r.debit })}
                      />
                    )}
                  </Td>
                  <Td>
                    {frozen ? (
                      r.party || <span className="text-fg-subtle">—</span>
                    ) : (
                      <Input
                        value={r.party}
                        placeholder="—"
                        className="h-8"
                        onChange={(e) => setRow(r.key, { party: e.target.value })}
                      />
                    )}
                  </Td>
                  <Td>
                    {frozen ? (
                      r.costCentre || <span className="text-fg-subtle">—</span>
                    ) : (
                      <Input
                        value={r.costCentre}
                        placeholder="—"
                        className="h-8"
                        onChange={(e) => setRow(r.key, { costCentre: e.target.value })}
                      />
                    )}
                  </Td>
                  <Td>
                    {frozen ? (
                      r.remarks || <span className="text-fg-subtle">—</span>
                    ) : (
                      <Input
                        value={r.remarks}
                        placeholder="—"
                        className="h-8"
                        onChange={(e) => setRow(r.key, { remarks: e.target.value })}
                      />
                    )}
                  </Td>
                  {!frozen && (
                    <Td>
                      <button
                        type="button"
                        onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
                        className="rounded p-1 text-fg-subtle hover:text-danger"
                        aria-label="Remove line"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── the balance strip: always visible, and it decides ───────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-4 text-[13px]">
            {!frozen && (
              <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, blank()])}>
                <Plus className="h-3.5 w-3.5" /> Line
              </Button>
            )}
            <span className="text-fg-muted">Debits <b className="tabular text-fg">{ledgerAmount(totals.debit) || "0.00"}</b></span>
            <span className="text-fg-muted">Credits <b className="tabular text-fg">{ledgerAmount(totals.credit) || "0.00"}</b></span>
            {/* ⚠️ An EMPTY voucher is not "balanced" — 0 equals 0, but there is
                nothing there. Saying so would be the screen quietly agreeing
                with something the engine is about to refuse. */}
            {voucherLines.length === 0 ? (
              <span className="text-fg-subtle">Nothing on it yet</span>
            ) : (
              <span className={cn("flex items-center gap-1.5", totals.balanced ? "text-success" : "text-warn")}>
                {totals.balanced ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
                {totals.balanced
                  ? "Balanced"
                  : `Out by ${ledgerAmount(Math.abs(totals.difference)) || "0.00"}`}
              </span>
            )}
          </div>

          {!frozen && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={save} loading={pending}>Save draft</Button>
              <Button
                size="sm"
                onClick={post}
                loading={pending}
                disabled={!ready}
                title={ready ? "Write this into the books" : "It cannot be posted yet"}
              >
                Post to the books
              </Button>
            </div>
          )}
        </div>

        {/* Why Post is dead, in the same words the server would use. */}
        {!frozen && !check.ok && (
          <ul className="border-t border-border px-3 py-2 text-[12px] text-fg-muted">
            {check.errors.map((e, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── what it actually did to the books ────────────────────────────── */}
      {bookRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
              What this put in the books
            </h2>
            <Badge tone={undone ? "warn" : "success"}>
              {undone ? "reversed — nets to nothing" : "live"}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-28">Date</Th>
                  <Th>Account</Th>
                  <Th className="w-32 text-right">Debit</Th>
                  <Th className="w-32 text-right">Credit</Th>
                  <Th className="w-36">Kind</Th>
                </tr>
              </thead>
              <tbody>
                {bookRows.map((e) => {
                  const fromReversal = e.voucherId !== entry.id;
                  return (
                    <tr
                      key={`${e.voucherId}-${e.id}`}
                      data-list-row
                      className={cn("border-b border-border/60 last:border-0", (e.isReversal || fromReversal) && "text-fg-muted")}
                    >
                      <Td className="tabular">{e.postingDate?.slice(0, 10)}</Td>
                      <Td>{accountLabel(accounts, e.accountId)}</Td>
                      <Td className="tabular text-right">{ledgerAmount(num(e.debit))}</Td>
                      <Td className="tabular text-right">{ledgerAmount(num(e.credit))}</Td>
                      <Td className="text-[12px]">
                        {fromReversal ? `reversed by ${e.voucherNo ?? "a later entry"}` : e.isReversal ? "reversal" : "posting"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-3 py-1.5 text-[12px] text-fg-subtle">
            These rows are the books. Nothing here is ever edited or deleted — a reversal is written beside
            what it undoes and both stay for good.
          </p>
        </div>
      )}

      {/* ── what you may still do ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {entry.status === "Draft" && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            loading={pending}
            onClick={() => run(() => deleteJournalAction(entry.id), () => router.push(`/ledger/journals?co=${entry.companyId}`))}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete this draft
          </Button>
        )}
        {entry.status === "Posted" && !reversal && (
          <Button variant="ghost" size="sm" onClick={() => setReversing(true)}>
            <RotateCcw className="h-3.5 w-3.5" /> Reverse this entry
          </Button>
        )}
        <span className="text-[12px] text-fg-subtle">
          {entry.status === "Draft"
            ? "A draft is not in the books. Deleting it changes nothing."
            : entry.postedBy
              ? `Posted by ${entry.postedBy}${entry.postedAt ? ` on ${eatDay(entry.postedAt)}` : ""}.`
              : null}
        </span>
      </div>

      {reversing && (
        <ReverseSheet
          entry={entry}
          busy={pending}
          onClose={() => setReversing(false)}
          onConfirm={(date, reason) => run(
            () => reverseJournalAction(entry.id, { date, reason }),
            () => setReversing(false),
          )}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── reversing ── */

function ReverseSheet({
  entry, busy, onClose, onConfirm,
}: {
  entry: JournalEntry;
  busy: boolean;
  onClose: () => void;
  onConfirm: (date: string, reason: string) => void;
}) {
  const [date, setDate] = useState(entry.postingDate?.slice(0, 10) ?? "");
  const [reason, setReason] = useState("");

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Reverse ${entry.entryNo}`}
      icon={<RotateCcw className="h-4 w-4" />}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(date, reason)} loading={busy}>Write the reversal</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-fg-muted">
          This writes a <b className="text-fg">new journal entry</b> with the sides swapped, pointing back at{" "}
          {entry.entryNo}. Nothing is deleted: both entries stay in the books and their effect cancels. The new
          entry gets its own number, so the correction can be explained on the correction itself.
        </p>
        <div>
          <FieldLabel>Date of the reversal</FieldLabel>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="mt-1 text-[11px] text-fg-subtle">
            Defaults to the original date, so the month the mistake was made in goes back to nothing. Put a
            later date only if that period has already been reported and must not move.
          </p>
        </div>
        <div>
          <FieldLabel>Why</FieldLabel>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Posted to the wrong account."
          />
        </div>
      </div>
    </BottomSheet>
  );
}

/* ───────────────────────────────────────────────────────────────── bits ─── */

function accountLabel(accounts: GlAccount[], id: number): string {
  const a = accounts.find((x) => x.id === id);
  if (!a) return "—";
  return `${a.number} · ${a.name}`;
}

function Amount({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      value={value}
      inputMode="decimal"
      placeholder="—"
      className="h-8 text-right tabular"
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))}
    />
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle", className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-1.5 align-middle", className)}>{children}</td>;
}
