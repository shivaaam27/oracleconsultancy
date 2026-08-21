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
 * business's own habit and the general ledger's rule both at once, and it is the
 * reason there is no Edit button here at all.
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

  const btn = "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors";

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
              toast(`${number} issued.`, { tone: "success" });
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
