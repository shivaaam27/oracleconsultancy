"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { CocozuriInvoiceSheet } from "@/components/cocozuri-invoice-sheet";
import type { CzCustomer, CzPrice, CzProduct } from "@/lib/cocozuri-shared";

/* ------------------------------------------------------------------ *
 * Editing a DRAFT invoice.
 *
 * ⚠️ A DRAFT ONLY, AND THAT IS THE WHOLE RULE. An issued invoice is answered
 * with a credit note, never edited — the business's own habit and the general
 * ledger's second rule at once. But a draft has been sent to nobody and acted on
 * by nothing, and cancelling it and typing the whole thing again was never a
 * rule: it was a missing screen. The server refuses an issued one by number, so
 * this button simply never appears on one.
 * ------------------------------------------------------------------ */

export function CocozuriInvoiceEdit({
  invoice, customers, products, prices, defaultVat,
}: {
  invoice: {
    id: number;
    number: string;
    docType: "invoice" | "credit_note";
    customerName: string;
    branchName: string | null;
    reference: string | null;
    lines: {
      productId: number | null;
      description: string;
      brand: string | null;
      packSize: number | null;
      packUnit: string | null;
      uom: string | null;
      qty: number;
      unitPrice: number;
    }[];
  };
  customers: CzCustomer[];
  products: CzProduct[];
  prices: CzPrice[];
  defaultVat: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent hover:text-accent">
        <Pencil size={13} /> Edit
      </button>

      {open && (
        <CocozuriInvoiceSheet
          customers={customers}
          products={products}
          prices={prices}
          defaultVat={defaultVat}
          docType={invoice.docType}
          existing={{
            id: invoice.id,
            number: invoice.number,
            customerName: invoice.customerName,
            branchName: invoice.branchName,
            reference: invoice.reference,
            /* ⚠️ The numbers become strings because the form types them, and an
               empty box and a zero are different things there — the same reason
               a missing price is refused and a zero one is allowed. */
            lines: invoice.lines.map((l) => ({
              productId: l.productId,
              description: l.description,
              brand: l.brand,
              packSize: l.packSize,
              packUnit: l.packUnit,
              uom: l.uom,
              qty: String(l.qty),
              unitPrice: String(l.unitPrice),
            })),
          }}
          onClose={() => setOpen(false)} />
      )}
    </>
  );
}
