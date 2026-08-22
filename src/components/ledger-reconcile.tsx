"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Landmark, Loader2, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { money } from "@/lib/cocozuri-shared";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import { recBlockers, type BankRec, type RecCheck, type RecEntry } from "@/lib/ledger-reconcile-shared";
import {
  closeRecAction, createRecAction, deleteRecAction, reopenRecAction, setClearedAction,
} from "@/app/ledger/reconcile-actions";

/* ------------------------------------------------------------------ *
 * Ticking a bank statement off against the books.
 *
 * ⚠️ IT NEVER EDITS AN ENTRY. Ticking one writes a row that POINTS at it, so the
 * books stay append-only — the ledger's second rule — and un-ticking is just
 * removing that row.
 * ------------------------------------------------------------------ */

export function LedgerRecList({
  companyId, recs, accounts,
}: {
  companyId: number;
  recs: BankRec[];
  accounts: { id: number; label: string; type: string | null }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAdding(true)} disabled={accounts.length === 0}
          title={accounts.length === 0 ? "No bank or cash account in the chart yet." : undefined}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
          <Plus size={13} /> Start a reconciliation
        </button>
      </div>

      {recs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-bg-elev py-10 text-center">
          <Landmark size={20} className="text-fg-subtle" />
          <p className="text-base font-medium text-fg-muted">No statement has been reconciled yet.</p>
          <p className="max-w-[34rem] text-sm text-fg-subtle">
            Type the balance the bank says, tick off what has cleared, and what is left is money the
            books know about and the bank has not seen — a cheque written and not presented, usually.
            That is not an error; it is the whole reason this exists.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
          <div className="min-w-[36rem]">
            <div className="grid grid-cols-[110px_minmax(0,1fr)_140px_100px_90px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              <span>Statement</span>
              <span>Account</span>
              <span className="text-right">The bank says</span>
              <span className="text-right">State</span>
              <span></span>
            </div>
            {recs.map((r) => (
              <div key={r.id} className="grid grid-cols-[110px_minmax(0,1fr)_140px_100px_90px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                <Link href={`/ledger/reconcile/${r.id}?co=${companyId}`} className="truncate text-sm text-accent hover:underline">
                  {r.statementDate}
                </Link>
                <span className="min-w-0 truncate text-sm text-fg">{r.accountName ?? `Account #${r.accountId}`}</span>
                <span className="text-right text-sm tabular text-fg-muted">{money(r.statementBalance)}</span>
                <span className={`text-right text-sm ${r.status === "closed" ? "text-success" : "text-warn"}`}>
                  {r.status === "closed" ? "Agreed" : "Open"}
                </span>
                <span className="flex items-center justify-end gap-1">
                  {r.status === "closed" ? (
                    <button type="button" disabled={busy} title="Reopen"
                      onClick={() => void run("Reopened.", () => reopenRecAction(r.id))}
                      className="h-7 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                      <LockOpen size={12} />
                    </button>
                  ) : (
                    <button type="button" disabled={busy} title="Remove"
                      onClick={() => {
                        if (!window.confirm("Remove this reconciliation? What has been ticked off goes with it; no entry is touched.")) return;
                        void run("Removed. No entry was changed.", () => deleteRecAction(r.id));
                      }}
                      className="h-7 rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && <NewSheet companyId={companyId} accounts={accounts} onClose={() => setAdding(false)}
        onMade={(id) => router.push(`/ledger/reconcile/${id}?co=${companyId}`)} />}
    </>
  );
}

function NewSheet({
  companyId, accounts, onClose, onMade,
}: {
  companyId: number;
  accounts: { id: number; label: string; type: string | null }[];
  onClose: () => void;
  onMade: (id: number) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0);
  const [statementDate, setStatementDate] = useState(todayInDar());
  const [balance, setBalance] = useState("");

  const blockers = recBlockers({ accountId: accountId || null, statementDate, statementBalance: typedNumberOr(balance) });

  async function save() {
    setBusy(true);
    const res = await createRecAction(companyId, {
      accountId, statementDate, statementBalance: typedNumberOr(balance),
    });
    setBusy(false);
    if (!res.ok || !res.id) { toast(res.error ?? "Could not start it.", { tone: "danger" }); return; }
    onMade(res.id);
  }

  return (
    <BottomSheet open onClose={onClose} title="Start a reconciliation" maxWidth="max-w-xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Which account</span>
          <FluidSelect value={String(accountId)} onSelect={(v) => setAccountId(Number(v))}
            options={accounts.map((a) => ({ value: String(a.id), label: a.label }))} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Statement date</span>
            <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Balance the bank says</span>
            <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal"
              className={`${FIELD} text-right tabular`} placeholder="0" />
          </label>
        </div>
        {blockers.length > 0 && balance !== "" && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Start
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ *
 * One statement
 * ------------------------------------------------------------------ */

export function LedgerRecDetail({
  rec, entries, check,
}: {
  rec: BankRec;
  entries: RecEntry[];
  check: RecCheck;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  const closed = rec.status === "closed";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="The books say" value={money(check.ledgerBalance)} />
        <Tile label="The bank says" value={money(check.statementBalance)} />
        <Tile label="Not cleared yet"
          value={`${check.unclearedCount} · ${money(check.unclearedIn + check.unclearedOut)}`} />
        <Tile label="Difference" value={money(check.difference)}
          tone={check.agrees ? "success" : "danger"} />
      </div>

      {/* ⚠️ The sum written out, because it is the whole feature and people get
          it backwards. */}
      <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
        The books hold everything; the bank has only seen what cleared. So the statement should equal
        the books <strong className="text-fg">less</strong> what is still outstanding. A cheque
        written and not presented is money gone in the books and still sitting at the bank — that is
        not an error, it is exactly what this screen is for.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {closed ? (
          <button type="button" disabled={busy}
            onClick={() => void run("Reopened.", () => reopenRecAction(rec.id))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
            <LockOpen size={13} /> Reopen
          </button>
        ) : (
          <button type="button" disabled={busy || !check.agrees}
            title={check.agrees ? undefined : "It does not agree yet."}
            onClick={() => void run("Agreed and closed.", () => closeRecAction(rec.id))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            <Lock size={13} /> It agrees — close it
          </button>
        )}
        {!closed && check.unclearedCount > 0 && (
          <button type="button" disabled={busy}
            onClick={() => void run("Everything ticked off.",
              () => setClearedAction(rec.id, entries.filter((e) => !e.clearedOn).map((e) => e.entryId), true))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
            <CheckCircle2 size={13} /> Tick everything off
          </button>
        )}
      </div>

      {/* ⚠️ Refused rather than allowed: a reconciliation that does not agree is
          a note saying nobody looked, and the next person believes it. */}
      {!closed && !check.agrees && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            <strong>{money(Math.abs(check.difference))}</strong> apart. Find it before closing this
            off — most often it is something the bank has that the books do not: a charge, interest,
            or a payment nobody wrote down.
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[70px_100px_minmax(0,1fr)_130px_120px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Cleared</span>
            <span>Date</span>
            <span>What</span>
            <span>Reference</span>
            <span className="text-right">Amount</span>
          </div>
          {entries.map((e) => (
            <div key={e.entryId} className="grid grid-cols-[70px_100px_minmax(0,1fr)_130px_120px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
              <input type="checkbox" checked={!!e.clearedOn} disabled={busy || closed}
                onChange={(ev) => void run(ev.target.checked ? "Ticked off." : "Un-ticked.",
                  () => setClearedAction(rec.id, [e.entryId], ev.target.checked))}
                className="h-4 w-4 accent-[var(--accent)] disabled:opacity-40"
                aria-label={`Cleared, entry ${e.entryId}`} />
              <span className="text-sm text-fg-muted">{e.postingDate}</span>
              <span className="min-w-0 truncate text-sm text-fg" title={e.remarks ?? ""}>
                {e.voucherType}
                {e.party && <span className="ml-1.5 text-xs text-fg-subtle">{e.party}</span>}
              </span>
              <span className="truncate text-sm text-fg-subtle">{e.voucherNo ?? "—"}</span>
              <span className={`text-right text-sm tabular ${e.amount < 0 ? "text-danger" : "text-success"}`}>
                {money(e.amount)}
              </span>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">
              Nothing has been posted to that account up to this date.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-lg font-semibold leading-none tabular ${
        tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}
