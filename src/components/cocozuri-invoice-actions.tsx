"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Printer, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { cancelInvoiceAction, issueInvoiceAction } from "@/app/cocozuri/actions";

/**
 * The buttons above an invoice.
 *
 * ⚠️ ISSUING IS ONE-WAY, and the confirm says so. After it, the document is the
 * customer's — it cannot be edited, only answered with a credit note. That is the
 * business's own habit and the general ledger's rule both at once.
 *
 * ⚠️ A DRAFT, HOWEVER, CAN BE EDITED, and the Edit button beside these comes
 * from `CocozuriInvoiceEdit`. It appears on a draft and never on an issued one —
 * that was never a rule about drafts, only a screen nobody had built, and the
 * only route was cancelling and typing the whole thing again.
 */
export function CocozuriInvoiceActions({
  id, status, number,
}: {
  id: number;
  status: "draft" | "issued" | "cancelled";
  number: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const btn = "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors";

  return (
    <>
      {status === "draft" && (
        <>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              if (!confirm(`Issue ${number}? After this it cannot be edited — only corrected with a credit note.`)) return;
              setBusy("issue");
              const res = await issueInvoiceAction(id);
              setBusy(null);
              if (!res.ok) { toast(res.error ?? "Could not issue it.", { tone: "danger" }); return; }
              /* ⚠️ THE INVOICE ISSUED EITHER WAY — refusing to issue it because a
                 note about which lots went could not be written would be the
                 tail wagging the dog. But it must SAY SO, or somebody believes
                 the recall record is complete when it is empty. */
              if (res.despatchNote) toast(res.despatchNote, { tone: "warn" });
              else toast(`${number} issued.`, { tone: "success" });
              router.refresh();
            }}
            className={`${btn} bg-accent text-accent-fg hover:opacity-90 disabled:opacity-60`}
          >
            {busy === "issue" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Issue
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              if (!confirm(`Cancel draft ${number}?`)) return;
              setBusy("cancel");
              const res = await cancelInvoiceAction(id);
              setBusy(null);
              if (!res.ok) { toast(res.error ?? "Could not cancel it.", { tone: "danger" }); return; }
              toast(`${number} cancelled.`, { tone: "success" });
              router.refresh();
            }}
            className={`${btn} border border-border text-fg-muted hover:text-danger`}
          >
            <X size={13} /> Cancel
          </button>
        </>
      )}

      <button type="button" onClick={() => window.print()} className={`${btn} border border-border text-fg-muted hover:text-fg`}>
        <Printer size={13} /> Print
      </button>
    </>
  );
}
