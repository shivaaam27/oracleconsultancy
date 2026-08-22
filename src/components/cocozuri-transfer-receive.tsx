"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, X } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD } from "@/components/ui";
import { useToast } from "@/components/toast";
import { qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";
import { typedNumber } from "@/lib/typed-number";
import { receiveBlockers, type CzTransfer } from "@/lib/cocozuri-transfer-shared";
import { cancelTransferAction, receiveTransferAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Counting what arrived.
 *
 * ⚠️ THIS ASKS FOR WHAT THE SHOP COUNTED, NOT WHAT THE KITCHEN SENT — and it
 * starts the boxes at the sent figure only because that is right most of the
 * time, never because it is assumed. Recording the sent figure at both ends is
 * exactly what makes the shop's stock drift, and then a stock-take blames the
 * shop for something that went missing in a crate.
 * ------------------------------------------------------------------ */

export function CocozuriTransferReceive({ transfer }: { transfer: CzTransfer }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayInDar());
  const [counted, setCounted] = useState<Record<number, string>>(
    Object.fromEntries(transfer.lines.map((l) => [l.id, String(l.sentQty)])),
  );
  const [notes, setNotes] = useState<Record<number, string>>({});

  const rows = useMemo(
    () => transfer.lines.map((l) => ({
      line: l,
      receivedQty: typedNumber(counted[l.id] ?? ""),
      shortNote: notes[l.id] ?? null,
    })),
    [transfer.lines, counted, notes],
  );
  const blockers = receiveBlockers(
    rows.map((r) => ({ sentQty: r.line.sentQty, receivedQty: r.receivedQty, shortNote: r.shortNote })),
  );
  const totalSent = transfer.lines.reduce((s, l) => s + l.sentQty, 0);
  const totalIn = rows.reduce((s, r) => s + (r.receivedQty ?? 0), 0);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return false; }
    toast(label, { tone: "success" });
    router.refresh();
    return true;
  }

  if (transfer.status === "received") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success/10 px-2.5 text-sm text-success">
        <CheckCircle2 size={13} /> Arrived{transfer.receivedBy ? ` — counted by ${transfer.receivedBy}` : ""}
      </span>
    );
  }
  if (transfer.status === "cancelled") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-bg-subtle px-2.5 text-sm text-fg-subtle">
        Cancelled — the stock went back
      </span>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin text-fg-subtle" />}
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
          <PackageCheck size={13} /> Count what arrived
        </button>
        <button type="button"
          onClick={() => {
            const why = window.prompt(`Cancel ${transfer.reference}?\n\nThe stock goes back on the ${transfer.fromLocationName ?? "sending"} shelf, with an opposite movement — nothing is erased.\n\nWhy?`);
            if (why === null) return;
            void run("Cancelled. The stock went back.", () => cancelTransferAction(transfer.id, why || null));
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-danger">
          <X size={13} /> It never went
        </button>
      </div>

      {open && (
        <BottomSheet open onClose={() => setOpen(false)} title={`What arrived — ${transfer.reference}`} maxWidth="max-w-3xl">
          <div className="flex flex-col gap-3 px-1 pb-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Counted on">
                <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={FIELD} />
              </Field>
              <Field label="Who counted it">
                <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className={FIELD} placeholder="A name" />
              </Field>
            </div>

            <div className="rounded-md border border-border">
              <div className="grid grid-cols-[minmax(0,1fr)_90px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
                <span>Chocolate</span>
                <span className="text-right">Sent</span>
                <span className="text-right">Arrived</span>
              </div>
              <div className="max-h-[18rem] overflow-y-auto">
                {rows.map(({ line, receivedQty }) => {
                  const short = receivedQty != null && receivedQty < line.sentQty - 0.0005;
                  return (
                    <div key={line.id} className="border-b border-border px-2.5 py-1.5 last:border-0">
                      <div className="grid grid-cols-[minmax(0,1fr)_90px_110px] items-center gap-2">
                        <span className="min-w-0 truncate text-sm text-fg" title={line.itemName}>
                          {line.itemName}
                          {line.batchNo && <span className="ml-1.5 text-xs text-fg-subtle">{line.batchNo}</span>}
                        </span>
                        <span className="text-right text-sm tabular text-fg-subtle">{qtyText(line.sentQty)}</span>
                        <input
                          value={counted[line.id] ?? ""}
                          onChange={(e) => setCounted((c) => ({ ...c, [line.id]: e.target.value }))}
                          inputMode="decimal"
                          className={`${FIELD} text-right tabular ${short ? "border-warn" : ""}`}
                          aria-label={`Arrived of ${line.itemName}`}
                        />
                      </div>
                      {/* ⚠️ The reason appears only where there is a shortfall,
                          and it is required — a difference nobody explains is
                          the workbook's VARIANCE column all over again. */}
                      {short && (
                        <input
                          value={notes[line.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [line.id]: e.target.value }))}
                          className={`${FIELD} mt-1.5`}
                          placeholder={`${qtyText(line.sentQty - (receivedQty ?? 0))} short — what happened to them?`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
              <span className="text-fg-muted">
                {qtyText(totalSent)} sent · {qtyText(totalIn)} arrived
              </span>
              <span className={`tabular font-semibold ${totalIn < totalSent ? "text-danger" : "text-fg"}`}>
                {totalIn < totalSent ? `${qtyText(totalSent - totalIn)} missing` : "all of it"}
              </span>
            </div>

            {blockers.length > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button type="button" disabled={busy || blockers.length > 0}
                onClick={() => {
                  void (async () => {
                    const ok = await run(`${transfer.reference} received.`, () =>
                      receiveTransferAction(transfer.id, {
                        receivedBy: receivedBy || null,
                        receivedOn,
                        counted: rows
                          .filter((r) => r.receivedQty != null)
                          .map((r) => ({ lineId: r.line.id, qty: r.receivedQty!, shortNote: r.shortNote })),
                      }));
                    if (ok) setOpen(false);
                  })();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
                {busy && <Loader2 size={13} className="animate-spin" />} Put it on the shelf
              </button>
              <button type="button" onClick={() => setOpen(false)}
                className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}
