"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Loader2, Undo2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { postInvoiceAction, unpostInvoiceAction } from "@/app/cocozuri/actions";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Is this document in the books?
 *
 * ⚠️ POSTING IS A BUTTON, NOT A SIDE EFFECT. The ledger's fifth rule is that
 * nothing lands in the accounts silently, so raising and issuing an invoice
 * leaves it OUT of the books until somebody says otherwise. This strip is where
 * that is said — and where it says plainly why it cannot be, which matters
 * because the commonest reason is an empty chart of accounts, not a bug.
 *
 * ⚠️ REVERSED IS A THIRD STATE, not "unposted again". A reversed document keeps
 * both its original entries and their mirrors in the general ledger for ever,
 * and it cannot be re-posted — you raise a new document. Showing it as simply
 * "not posted" would invite somebody to post it twice.
 * ------------------------------------------------------------------ */

export function CocozuriBooksStrip({
  invoiceId, number, state, ready, reason,
}: {
  invoiceId: number;
  number: string;
  state: "unposted" | "posted" | "reversed";
  /** False when the chart of accounts cannot serve a posting yet. */
  ready: boolean;
  reason: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function post() {
    setBusy(true);
    const res = await postInvoiceAction(invoiceId);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not post it.", { tone: "danger" }); return; }
    toast(`${number} is in the books.`, { tone: "success" });
    router.refresh();
  }

  async function reverse() {
    const why = prompt(`Take ${number} back out of the books? Both the original entries and their reversal stay on the record.\n\nWhy?`);
    if (why === null) return;
    setBusy(true);
    const res = await unpostInvoiceAction(invoiceId, why || null);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not reverse it.", { tone: "danger" }); return; }
    toast(`${number} taken out of the books, with a reversal on the record.`, { tone: "success" });
    router.refresh();
  }

  const tone =
    state === "posted" ? "border-success/30 bg-success/10 text-success"
      : state === "reversed" ? "border-warn/30 bg-warn/10 text-warn"
        : "border-border bg-bg-subtle text-fg-muted";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-[12.5px] print:hidden", tone)}>
      <span className="inline-flex items-center gap-1.5 font-medium">
        <BookOpen size={13} />
        {state === "posted" ? "In the books"
          : state === "reversed" ? "Taken back out of the books"
            : "Not in the books"}
      </span>

      <span className="text-[11.5px] opacity-80">
        {state === "posted"
          ? "It shows in the trial balance, the P&L and the VAT return."
          : state === "reversed"
            ? "Its entries and their reversal both stay on the record. Raise a new document rather than posting this one again."
            : ready
              ? "Nothing reaches the accounts until it is posted."
              : (reason ?? "It cannot be posted yet.")}
      </span>

      <span className="grow" />

      {state === "posted" && (
        <>
          <Link href="/ledger/entries" className="text-[12px] underline-offset-2 hover:underline">
            See the entries
          </Link>
          <button type="button" onClick={() => void reverse()} disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-current/30 px-2 text-[12px] font-medium hover:bg-current/10 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Reverse
          </button>
        </>
      )}

      {state === "unposted" && ready && (
        <button type="button" onClick={() => void post()} disabled={busy}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />} Post to the ledger
        </button>
      )}

      {state === "unposted" && !ready && (
        <Link href="/ledger?co=" className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[12px] font-medium text-fg-muted hover:text-fg">
          Set the ledger up
        </Link>
      )}
    </div>
  );
}
