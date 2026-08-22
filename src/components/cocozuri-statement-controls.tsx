"use client";

import { useRouter } from "next/navigation";
import { Printer, X } from "lucide-react";

/* ------------------------------------------------------------------ *
 * The statement's period, and printing it.
 *
 * ⚠️ THE PERIOD LIVES IN THE ADDRESS, not in component state. That is the same
 * rule the ledger reports follow and the reason a statement can be bookmarked,
 * sent to an accountant or reloaded and still show the same thing. It is also
 * what makes the printed page match the screen — a print is a reload.
 * ------------------------------------------------------------------ */

export function CocozuriStatementControls({
  customerId, from, to,
}: {
  customerId: number;
  from?: string;
  to?: string;
}) {
  const router = useRouter();

  function go(next: { from?: string; to?: string }) {
    const p = new URLSearchParams();
    const f = next.from ?? from;
    const t = next.to ?? to;
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    const q = p.toString();
    router.push(`/cocozuri/statements/${customerId}${q ? `?${q}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <label className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        From
        <input type="date" value={from ?? ""} onChange={(e) => go({ from: e.target.value })} className={INPUT} />
      </label>
      <label className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        To
        <input type="date" value={to ?? ""} onChange={(e) => go({ to: e.target.value })} className={INPUT} />
      </label>
      {(from || to) && (
        <button type="button" onClick={() => router.push(`/cocozuri/statements/${customerId}`)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-fg-muted hover:text-fg">
          <X size={12} /> Whole account
        </button>
      )}
      <button type="button" onClick={() => window.print()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[12px] text-fg-muted hover:text-fg">
        <Printer size={13} /> Print / PDF
      </button>
    </div>
  );
}

const INPUT = "h-7 rounded-md border border-border bg-bg px-1.5 text-[12px] text-fg outline-none focus:border-accent";
