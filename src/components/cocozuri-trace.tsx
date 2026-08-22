"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { SearchInput } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * Picking a lot to trace.
 *
 * ⚠️ THE CHOSEN LOT LIVES IN THE ADDRESS, not in component state. A trace is
 * the sort of thing somebody sends to a supplier or keeps open in a tab while
 * ringing round — a report is a link, exactly as on the ledger.
 * ------------------------------------------------------------------ */

export function CocozuriTracePicker({
  lots, chosen,
}: {
  lots: { batchNo: string; itemName: string | null; madeOn: string | null; expiresOn: string | null; source: string }[];
  chosen: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matched = term
      ? lots.filter((l) =>
          l.batchNo.toLowerCase().includes(term) ||
          (l.itemName ?? "").toLowerCase().includes(term))
      : lots;
    return matched.slice(0, 60);
  }, [lots, q]);

  return (
    <div className="flex flex-col gap-2">
      <SearchInput value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="A batch number, a lot number, or the name of a chocolate…" className="text-sm" />

      {lots.length === 0 ? (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-4 text-sm text-fg-subtle">
          Nothing carries a lot yet. One is made when a batch is closed, or when a delivery is
          approved with an expiry typed against the line.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((l) => (
            <button key={l.batchNo} type="button"
              onClick={() => router.push(`/cocozuri/trace?batch=${encodeURIComponent(l.batchNo)}`)}
              title={`${l.itemName ?? ""}${l.expiresOn ? ` · goes off ${l.expiresOn}` : ""}`}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm ${
                chosen === l.batchNo
                  ? "bg-accent text-accent-fg"
                  : "border border-border text-fg-muted hover:text-fg"}`}>
              {chosen === l.batchNo && <Search size={12} />}
              {l.batchNo}
              <span className="text-xs opacity-70">{l.itemName ?? ""}</span>
            </button>
          ))}
          {lots.length > shown.length && (
            <span className="inline-flex h-8 items-center text-xs text-fg-subtle">
              and {lots.length - shown.length} more — search for it.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
