"use client";

// JOURNAL ENTRIES — the list (Phase 1).
//
// One row is one voucher. The three states it can be in are the whole story,
// so they are the first thing on the row:
//
//   **Draft** — not in the books. Editable, deletable, harmless.
//   **Posted** — in the books, and frozen for ever.
//   **Reversed** — posted, then undone by a second entry. Both still exist.
//
// ⚠️ Status is a small dot and a word, never a coloured block (Desk rule 6).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FilePlus2, NotebookPen } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ledgerAmount, type JournalEntry } from "@/lib/ledger-shared";
import { createJournalAction } from "@/app/ledger/actions";

type Totals = { debit: number; credit: number; balanced: boolean; lines: number };

const DOT: Record<string, string> = {
  Draft: "bg-fg-subtle",
  Posted: "bg-success",
  Reversed: "bg-warn",
};

export function LedgerJournals({
  companyId, entries, totals, canPost,
}: {
  companyId: number;
  entries: JournalEntry[];
  totals: Record<number, Totals>;
  /** False when the company has no postable accounts yet — the chart comes first. */
  canPost: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const startNew = () => {
    setError(null);
    start(async () => {
      const res = await createJournalAction({
        companyId,
        // Today, in Dar es Salaam — where the person typing actually is.
        postingDate: new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" }),
      });
      if (!res.ok) setError(res.error ?? "Could not start a journal entry.");
      else router.push(`/ledger/journals/${res.id}?co=${companyId}`);
    });
  };

  if (!canPost) {
    return (
      <div className="rounded-xl border border-border bg-bg-elev p-8">
        <EmptyState
          icon={<NotebookPen className="h-5 w-5" />}
          title="No chart of accounts yet"
          hint="A journal entry moves money between accounts, so the accounts have to exist first."
          action={<Button onClick={() => router.push(`/ledger?co=${companyId}`)}>Set up the chart</Button>}
        />
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-fg-muted">
          A journal is how anything is corrected, and how anything without a document of its own — depreciation,
          an accrual, capital introduced — gets into the books.
        </p>
        <Button size="sm" onClick={startNew} loading={pending}>
          <FilePlus2 className="h-3.5 w-3.5" /> New journal
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elev p-8">
          <EmptyState
            icon={<NotebookPen className="h-5 w-5" />}
            title="Nothing has been journalled yet"
            hint="Start one and it stays a draft until you post it. Nothing reaches the books until then."
            action={<Button onClick={startNew} loading={pending}>New journal</Button>}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-24">Number</Th>
                  <Th className="w-28">Date</Th>
                  <Th>What it is</Th>
                  <Th className="w-28">State</Th>
                  <Th className="w-16 text-right">Lines</Th>
                  <Th className="w-36 text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const t = totals[e.id] ?? { debit: 0, credit: 0, balanced: false, lines: 0 };
                  return (
                    <tr key={e.id} data-list-row className="border-b border-border/60 last:border-0 hover:bg-bg-muted/60">
                      <Td>
                        <Link href={`/ledger/journals/${e.id}?co=${companyId}`} className="tabular font-medium text-accent hover:underline">
                          {e.entryNo}
                        </Link>
                      </Td>
                      <Td className="tabular text-fg-muted">{e.postingDate?.slice(0, 10) ?? "—"}</Td>
                      <Td>
                        <span className="block truncate">{e.title || e.narration || <span className="text-fg-subtle">Untitled</span>}</span>
                        {e.kind !== "Manual" && <span className="text-[11px] text-fg-subtle">{e.kind}</span>}
                      </Td>
                      <Td>
                        <span className="flex items-center gap-1.5 text-fg-muted">
                          <span className={cn("h-1.5 w-1.5 rounded-full", DOT[e.status] ?? "bg-fg-subtle")} aria-hidden />
                          {e.status}
                        </span>
                      </Td>
                      <Td className="tabular text-right text-fg-muted">{t.lines || "—"}</Td>
                      <Td className="tabular text-right">
                        {ledgerAmount(t.debit) || "—"}
                        {t.lines > 0 && !t.balanced && (
                          <span className="ml-1.5 text-[11px] text-warn">out of balance</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-3 py-1.5 text-[12px] text-fg-subtle">
            {entries.length} shown · a posted entry can never be changed, only reversed
          </div>
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

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}
