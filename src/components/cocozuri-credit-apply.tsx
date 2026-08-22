"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import { applyCreditNoteAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Which invoice this credit note answers.
 *
 * ⚠️ WITHOUT THIS A CREDIT NOTE CANNOT REDUCE AN INVOICE'S BALANCE — only the
 * customer's account as a whole — so "what is still owed on CZ-180" has no
 * answer. The master workbook already does the allocation: RETURN NOTES sits in
 * a column beside the invoice row and `BALANCE = AMOUNT − RETURNS − PAID`.
 *
 * It is deliberately not compulsory. A credit on the account, pointed at nothing
 * in particular, is a real thing; the Owed page shows it apart rather than
 * folding it into an ageing band it cannot honestly belong to.
 * ------------------------------------------------------------------ */

export function CocozuriCreditApply({
  creditNoteId, appliesTo, invoices,
}: {
  creditNoteId: number;
  appliesTo: number | null;
  /** The same customer's invoices — the server has already narrowed it, and the
   *  action refuses a cross-customer one anyway. */
  invoices: { id: number; number: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const current = invoices.find((i) => i.id === appliesTo)?.number ?? "";

  async function apply(value: string) {
    const target = invoices.find((i) => i.number === value.trim()) ?? null;
    if (value.trim() && !target) { toast("No invoice of that number for this customer.", { tone: "danger" }); return; }
    setBusy(true);
    const res = await applyCreditNoteAction(creditNoteId, target?.id ?? null);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not apply it.", { tone: "danger" }); return; }
    toast(target ? `Applied to ${target.number}.` : "Left as a credit on the account.", { tone: "success" });
    start(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 print:hidden">
      <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
        {busy || pending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
        Answers invoice
      </span>
      <div className="w-[12rem]">
        <Combobox
          defaultValue={current}
          options={invoices.map((i) => i.number)}
          onCommit={(v) => void apply(v)}
          placeholder="none — credit on account"
        />
      </div>
      <span className="text-xs text-fg-subtle">
        {appliesTo
          ? "It comes off that invoice's balance."
          : "Left blank it reduces what the customer owes overall, but no single invoice — so it cannot be aged."}
      </span>
    </div>
  );
}
