"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Truck } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { qty as qtyText, todayInDar, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import {
  CZ_TRANSFER_STATUS_LABEL, daysInTransit, sendBlockers, transferCheck,
  type CzTransfer, type CzTransferPair, type CzTransferStatus,
} from "@/lib/cocozuri-transfer-shared";
import { sendTransferAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Kitchen → shop.
 *
 * ⚠️ THE GAP BETWEEN "SENT" AND "ARRIVED" IS THE WHOLE POINT. The kitchen says
 * 20 and the shop counts 18: recording one figure at both ends is exactly what
 * makes the shop's opening stock a mystery today, and then a stock-take blames
 * the shop for something that went missing in a crate.
 * ------------------------------------------------------------------ */

type Row = CzTransfer & {
  route: string;
  statusLabel: string;
  sentLabel: string;
  receivedLabel: string;
  varianceLabel: string;
  variance: number | null;
  waiting: number | null;
};

export function CocozuriTransfers({
  transfers, locations, openNew,
}: {
  transfers: CzTransfer[];
  locations: CzStockLocation[];
  openNew?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CzTransferStatus | null>(null);
  const [sending, setSending] = useState(!!openNew);
  const today = todayInDar();

  // ⚠️ The flag is consumed, or Back re-opens the sheet.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/transfers");
  }, [openNew]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return transfers
      .filter((t) => (status == null ? true : t.status === status))
      .map((t) => {
        const c = transferCheck(t);
        return {
          ...t,
          route: `${t.fromLocationName ?? "?"} → ${t.toLocationName ?? "?"}`,
          statusLabel: CZ_TRANSFER_STATUS_LABEL[t.status],
          sentLabel: qtyText(c.sent),
          receivedLabel: c.received == null ? "—" : qtyText(c.received),
          // ⚠️ Nothing until somebody counts. A blank is not a zero.
          varianceLabel: c.variance == null || c.variance === 0 ? "—" : qtyText(-c.variance),
          variance: c.variance,
          waiting: daysInTransit(t, today),
        };
      })
      .filter((t) =>
        !term ||
        t.reference.toLowerCase().includes(term) ||
        t.route.toLowerCase().includes(term) ||
        t.lines.some((l) => l.itemName.toLowerCase().includes(term)));
  }, [transfers, q, status, today]);

  const counts = useMemo(() => {
    const m = new Map<CzTransferStatus, number>();
    for (const t of transfers) m.set(t.status, (m.get(t.status) ?? 0) + 1);
    return m;
  }, [transfers]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All transfers", count: transfers.length, href: "#", active: status == null, onSelect: () => setStatus(null) },
    ...(["sent", "received", "cancelled"] as const)
      .filter((s) => counts.has(s))
      .map((s) => ({
        key: s, label: CZ_TRANSFER_STATUS_LABEL[s], count: counts.get(s)!, href: "#",
        active: status === s, group: "Status",
        tone: s === "sent" ? ("warn" as const) : s === "received" ? ("success" as const) : undefined,
        onSelect: () => setStatus(s),
      })),
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_transfer!.listColumns, {
    overrides: {
      route: (r) => (
        <span className="min-w-0 truncate text-sm text-fg">
          {r.route}
          <span className="ml-1.5 text-xs text-fg-subtle">
            {r.lines.length} line{r.lines.length === 1 ? "" : "s"}
          </span>
          {/* ⚠️ A transfer nobody has confirmed after a day is almost always one
              somebody forgot — the same reasoning as a batch left open. */}
          {r.waiting != null && r.waiting >= 1 && (
            <span className="ml-1.5 text-xs text-warn">waiting {r.waiting} day{r.waiting === 1 ? "" : "s"}</span>
          )}
        </span>
      ),
      varianceLabel: (r) => (
        <span className={`tabular text-sm ${r.variance != null && r.variance < 0 ? "text-danger" : "text-fg-subtle"}`}>
          {r.varianceLabel}
        </span>
      ),
    },
  });

  const onWay = transfers.filter((t) => t.status === "sent").length;
  const lost = rows.reduce((s, r) => s + (r.variance != null && r.variance < 0 ? -r.variance : 0), 0);

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        listKey="cz_transfer"
        filters={rail}
        total={transfers.length}
        shown={rows.length}
        exportName="cocozuri-transfers"
        rowHref={(r) => `/cocozuri/transfers/${encodeURIComponent(r.reference)}`}
        footerNote={
          <span className="flex flex-wrap items-center gap-3">
            {onWay > 0 && <span className="text-warn">{onWay} on the way — nobody has counted them yet</span>}
            {lost > 0 && <span className="text-danger">{qtyText(lost)} never arrived</span>}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, place, chocolate…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <button type="button" onClick={() => setSending(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Send stock
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Truck size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing has been sent yet.</p>
            <p className="max-w-[30rem] text-sm text-fg-subtle">
              Record what leaves the kitchen, and what the shop actually counts when it gets there.
              The two are separate figures on purpose — the difference is stock that went missing in
              between, and it is the thing nobody can see today.
            </p>
          </div>
        }
      />

      {sending && (
        <SendSheet
          locations={locations}
          onClose={() => setSending(false)}
          onSent={(ref) => router.push(`/cocozuri/transfers/${encodeURIComponent(ref)}`)}
        />
      )}
    </>
  );
}

function SendSheet({
  locations, onClose, onSent,
}: {
  locations: CzStockLocation[];
  onClose: () => void;
  onSent: (reference: string) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState<number>(locations.find((l) => /kitchen/i.test(l.name))?.id ?? locations[0]?.id ?? 0);
  const [to, setTo] = useState<number>(locations.find((l) => /shop/i.test(l.name))?.id ?? locations[1]?.id ?? 0);
  const [onDate, setOnDate] = useState(todayInDar());
  const [sentBy, setSentBy] = useState("");
  const [pairs, setPairs] = useState<CzTransferPair[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");

  // The two shelves, paired by product. ⚠️ Fetched rather than guessed — the
  // pairing is a fact about the data, not something a form can work out.
  useEffect(() => {
    if (!from || !to || from === to) { setPairs([]); return; }
    let alive = true;
    setLoading(true);
    fetch(`/api/cocozuri/transfer-options?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : { pairs: [] }))
      .then((d) => { if (alive) { setPairs(d.pairs ?? []); setAmounts({}); } })
      .catch(() => { if (alive) setPairs([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const withQty = pairs.filter((p) => typedNumberOr(amounts[p.from.id]) > 0);
    if (!term) return withQty.length ? [...withQty, ...pairs.filter((p) => !withQty.includes(p))].slice(0, 400) : pairs.slice(0, 400);
    return pairs.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 400);
  }, [pairs, q, amounts]);

  const lines = pairs
    .filter((p) => typedNumberOr(amounts[p.from.id]) > 0)
    .map((p) => ({ fromItemId: p.from.id, toItemId: p.to?.id ?? 0, qty: typedNumberOr(amounts[p.from.id]) }));

  const blockers = sendBlockers({
    fromLocationId: from || null,
    toLocationId: to || null,
    onDate,
    lines: lines.map((l) => ({ toItemId: l.toItemId || null, sentQty: l.qty })),
  });

  async function send() {
    setBusy(true);
    const res = await sendTransferAction({ fromLocationId: from, toLocationId: to, onDate, sentBy: sentBy || null, lines });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not send it.", { tone: "danger" }); return; }
    toast(`${res.reference} is on its way. It is off the shelf and not yet on the other one.`, { tone: "success" });
    if (res.reference) onSent(res.reference);
    else onClose();
  }

  const unpairable = pairs.filter((p) => p.problem).length;

  return (
    <BottomSheet open onClose={onClose} title="Send stock" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="From">
            <FluidSelect value={String(from)} onSelect={(v) => setFrom(Number(v))}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
          </Field>
          <Field label="To">
            <FluidSelect value={String(to)} onSelect={(v) => setTo(Number(v))}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
          </Field>
          <Field label="Date">
            <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={FIELD} />
          </Field>
          <Field label="Who is sending it">
            <input value={sentBy} onChange={(e) => setSentBy(e.target.value)} className={FIELD} placeholder="A name" />
          </Field>
        </div>

        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a chocolate…" className="text-sm" />

        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span className="text-right">Sending</span>
          </div>
          <div className="max-h-[20rem] overflow-y-auto">
            {loading && <p className="px-3 py-6 text-center text-sm text-fg-subtle">Reading both shelves…</p>}
            {!loading && shown.map((p) => (
              <div key={p.from.id} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={p.problem ?? p.name}>
                  {p.name}
                  {/* ⚠️ A line that cannot be paired is SHOWN with its reason,
                      never quietly dropped — that is how somebody spends ten
                      minutes wondering where a chocolate went. */}
                  {p.problem && <span className="ml-1.5 text-xs text-warn">{p.problem}</span>}
                </span>
                <input
                  value={amounts[p.from.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [p.from.id]: e.target.value }))}
                  disabled={!!p.problem}
                  inputMode="decimal"
                  className={`${FIELD} text-right tabular disabled:opacity-40`}
                  placeholder="–"
                  aria-label={`Sending of ${p.name}`}
                />
              </div>
            ))}
            {!loading && shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-fg-subtle">
                {from === to ? "Pick two different places." : "Nothing on that shelf matches."}
              </p>
            )}
          </div>
          {unpairable > 0 && (
            <p className="border-t border-border bg-bg-subtle px-2.5 py-1.5 text-xs text-fg-subtle">
              {unpairable} of {pairs.length} cannot be sent — the receiving list has no line for them,
              or they are not linked to a product. Add them on the stock book.
            </p>
          )}
        </div>

        {lines.length > 0 && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            <strong className="text-fg">{lines.length}</strong> line{lines.length === 1 ? "" : "s"} ·{" "}
            <strong className="text-fg">{qtyText(lines.reduce((s, l) => s + l.qty, 0))}</strong> going.
            {" "}This takes it off the sending shelf now; the other end says what actually arrived.
          </p>
        )}

        {blockers.length > 0 && lines.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void send()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Truck size={13} />} Send it
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
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
