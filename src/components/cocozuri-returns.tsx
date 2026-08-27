"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, PackageOpen, Plus, Undo2 } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { qty as qtyText, todayInDar, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import {
  CZ_RETURN_KIND_LABEL, CZ_RETURN_STATUS_LABEL, bookInBlockers, daysWaiting, returnCheck,
  type CzReturn, type CzReturnKind, type CzReturnStatus,
} from "@/lib/cocozuri-return-shared";
import { czDate } from "@/lib/cocozuri-shared";
import { bookReturnAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 6 — returns, repairs and damage.
 *
 * ⚠️ THE GAP BETWEEN "CAME BACK" AND "SORTED" IS THE POINT, exactly as the gap
 * between sent and arrived is on a transfer. Chocolate sitting on a bench being
 * repacked is neither sellable nor written off, and today it is invisible —
 * which is how breakage becomes "a gap in the count" instead of a number
 * somebody manages.
 * ------------------------------------------------------------------ */

type ShelfItem = {
  id: number;
  name: string;
  uom: string;
  productId: number | null;
  batches: { id: number; batchNo: string }[];
};

type Row = CzReturn & {
  subject: string;
  from: string;
  statusLabel: string;
  cameBackLabel: string;
  goodLabel: string;
  scrappedLabel: string;
  scrapped: number;
  onBench: number;
  waiting: number | null;
};

export function CocozuriReturns({
  returns, locations, customers, invoices, openNew,
}: {
  returns: CzReturn[];
  locations: CzStockLocation[];
  customers: { id: number; name: string }[];
  invoices: { id: number; number: string; customerId: number; issueDate: string }[];
  openNew?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CzReturnStatus | null>(null);
  const [kind, setKind] = useState<CzReturnKind | null>(null);
  const [booking, setBooking] = useState(!!openNew);
  const today = todayInDar();

  // ⚠️ The flag is consumed, or Back re-opens the sheet.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/returns");
  }, [openNew]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return returns
      .filter((r) => (status == null ? true : r.status === status))
      .filter((r) => (kind == null ? true : r.kind === kind))
      .map((r) => {
        const c = returnCheck(r);
        const first = r.lines[0];
        const more = r.lines.length - 1;
        return {
          ...r,
          subject: first
            ? `${first.itemName}${more > 0 ? ` and ${more} more` : ""}`
            : "nothing listed",
          from:
            r.kind === "customer"
              // ⚠️ "Not named" said plainly, never as a warning — same as the
              // supplier on a purchase. What it costs is that no credit note
              // can be raised until somebody says, and the record says so.
              ? `from ${r.customerName ?? "somebody not named"}${r.invoiceNumber ? ` · ${r.invoiceNumber}` : ""}`
              : `found at ${r.locationName ?? "a shelf"}`,
          statusLabel: CZ_RETURN_STATUS_LABEL[r.status],
          // ⚠️ One date format for the whole module — see `czDate`.
          onDate: czDate(r.onDate),
          cameBackLabel: qtyText(c.cameBack),
          goodLabel: c.good > 0 ? qtyText(c.good) : "—",
          scrappedLabel: c.scrapped > 0 ? qtyText(c.scrapped) : "—",
          scrapped: c.scrapped,
          onBench: c.beingRepaired,
          waiting: daysWaiting(r, today),
        };
      })
      .filter((r) =>
        !term ||
        r.reference.toLowerCase().includes(term) ||
        r.from.toLowerCase().includes(term) ||
        r.lines.some((l) => l.itemName.toLowerCase().includes(term)));
  }, [returns, q, status, kind, today]);

  const counts = useMemo(() => {
    const m = new Map<CzReturnStatus, number>();
    for (const r of returns) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [returns]);

  const kindCounts = useMemo(() => {
    const m = new Map<CzReturnKind, number>();
    for (const r of returns) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [returns]);

  const rail: RecordFilter[] = [
    {
      key: "all", label: "Everything", count: returns.length, href: "#",
      active: status == null && kind == null,
      onSelect: () => { setStatus(null); setKind(null); },
    },
    ...(["open", "settled", "cancelled"] as const)
      .filter((s) => counts.has(s))
      .map((s) => ({
        key: s, label: CZ_RETURN_STATUS_LABEL[s], count: counts.get(s)!, href: "#",
        active: status === s, group: "Status",
        tone: s === "open" ? ("warn" as const) : s === "settled" ? ("success" as const) : undefined,
        onSelect: () => { setStatus(s); setKind(null); },
      })),
    ...(["customer", "internal"] as const)
      .filter((k) => kindCounts.has(k))
      .map((k) => ({
        key: k, label: CZ_RETURN_KIND_LABEL[k], count: kindCounts.get(k)!, href: "#",
        active: kind === k, group: "Where from",
        onSelect: () => { setKind(k); setStatus(null); },
      })),
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_return!.listColumns, {
    overrides: {
      subject: (r) => (
        <span className="min-w-0 truncate text-sm text-fg">
          {r.subject}
          <span className="ml-1.5 text-xs text-fg-subtle">{r.from}</span>
          {/* ⚠️ Chocolate left on a bench is neither sellable nor written off.
              A week of it is worth saying out loud. */}
          {r.onBench > 0 && r.waiting != null && r.waiting >= 1 && (
            <span className="ml-1.5 text-xs text-warn">
              {qtyText(r.onBench)} waiting {r.waiting} day{r.waiting === 1 ? "" : "s"}
            </span>
          )}
        </span>
      ),
      scrappedLabel: (r) => (
        <span className={`tabular text-sm ${r.scrapped > 0 ? "text-danger" : "text-fg-subtle"}`}>
          {r.scrappedLabel}
        </span>
      ),
    },
  });

  const onBench = rows.reduce((s, r) => s + r.onBench, 0);
  const thrown = rows.reduce((s, r) => s + r.scrapped, 0);

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        listKey="cz_return"
        filters={rail}
        total={returns.length}
        shown={rows.length}
        exportName="cocozuri-returns"
        rowHref={(r) => `/cocozuri/returns/${encodeURIComponent(r.reference)}`}
        footerNote={
          <span className="flex flex-wrap items-center gap-3">
            {onBench > 0 && <span className="text-warn">{qtyText(onBench)} still being looked at</span>}
            {thrown > 0 && <span className="text-danger">{qtyText(thrown)} thrown away</span>}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, customer, chocolate…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <CocozuriHelp title="Returns and damage">
              <p>
                <strong>One document, two doors, and only one of them moves stock inwards.</strong> A
                customer&rsquo;s return left the books the day it was sold, so booking it in puts the
                chocolate back on the shelf. Breakage found here never went anywhere, so booking it
                moves nothing at all. They look identical on the screen and they are not.
              </p>
              <p>
                <strong>&ldquo;Repairing&rdquo; is the gap between booking in and sorting out</strong>
                &mdash; what has come back, less what has been repacked and what has been thrown. It
                is the exact twin of a transfer&rsquo;s stock in transit. You can settle a return
                more than once: five bars repacked today and five thrown next week is the real case.
              </p>
              <p>
                <strong>A scrap must say what kind of loss it was and what actually happened.</strong>
                Naming the kind is not enough.
              </p>
              <p>
                <strong>The credit note is a link, not a second document.</strong> It is priced off
                the <em>original</em> invoice rather than today&rsquo;s list, credits what came back
                rather than what was repacked, and lands as a draft.
              </p>
              <p>
                <strong>A sales return reverses the sale but does not put the cost back</strong>
                &mdash; nothing ever took the cost of that sale out of stock, so it is still sitting
                there and putting it back would count the same chocolate twice. Writing damaged stock
                <em>off</em> is different and is posted, at what it cost, never at what it would have
                sold for.
              </p>
            </CocozuriHelp>
            <button type="button" onClick={() => setBooking(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Record a return
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Undo2 size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing has come back yet.</p>
            <p className="max-w-[32rem] text-sm text-fg-subtle">
              Record what a customer sends back, or what is found damaged on a shelf. Say afterwards
              what was repacked and what went in the bin — that is what turns breakage from a gap in
              a count into a figure somebody can do something about.
            </p>
          </div>
        }
      />

      {booking && (
        <BookSheet
          locations={locations}
          customers={customers}
          invoices={invoices}
          onClose={() => setBooking(false)}
          onBooked={(ref) => router.push(`/cocozuri/returns/${encodeURIComponent(ref)}`)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Booking it in
 * ------------------------------------------------------------------ */

function BookSheet({
  locations, customers, invoices, onClose, onBooked,
}: {
  locations: CzStockLocation[];
  customers: { id: number; name: string }[];
  invoices: { id: number; number: string; customerId: number; issueDate: string }[];
  onClose: () => void;
  onBooked: (reference: string) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<CzReturnKind>("customer");
  const [locationId, setLocationId] = useState<number>(
    locations.find((l) => /shop/i.test(l.name))?.id ?? locations[0]?.id ?? 0,
  );
  const [onDate, setOnDate] = useState(todayInDar());
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [batches, setBatches] = useState<Record<number, number | null>>({});
  const [q, setQ] = useState("");

  // What the shelf carries. ⚠️ Fetched rather than shipped with the page —
  // 323 items across three places is far too much to send just in case.
  useEffect(() => {
    if (!locationId) { setItems([]); return; }
    let alive = true;
    setLoading(true);
    fetch(`/api/cocozuri/return-options?location=${locationId}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (alive) { setItems(d.items ?? []); setAmounts({}); setBatches({}); } })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [locationId]);

  const forCustomer = useMemo(
    () => (customerId == null ? [] : invoices.filter((i) => i.customerId === customerId)),
    [invoices, customerId],
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const typed = items.filter((i) => typedNumberOr(amounts[i.id]) > 0);
    if (!term) return typed.length ? [...typed, ...items.filter((i) => !typed.includes(i))].slice(0, 400) : items.slice(0, 400);
    return items.filter((i) => i.name.toLowerCase().includes(term)).slice(0, 400);
  }, [items, q, amounts]);

  const lines = items
    .filter((i) => typedNumberOr(amounts[i.id]) > 0)
    .map((i) => ({ itemId: i.id, qty: typedNumberOr(amounts[i.id]), batchId: batches[i.id] ?? null }));

  const blockers = bookInBlockers({ kind, locationId: locationId || null, onDate, lines });

  async function save() {
    setBusy(true);
    const res = await bookReturnAction({
      kind,
      locationId,
      onDate,
      customerId: kind === "customer" ? customerId : null,
      invoiceId: kind === "customer" ? invoiceId : null,
      receivedBy: receivedBy || null,
      notes: notes || null,
      lines,
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not record it.", { tone: "danger" }); return; }
    toast(
      kind === "customer"
        ? `${res.reference} is back on the shelf. Say next what is fit to sell and what is not.`
        : `${res.reference} recorded. Nothing has moved yet — say what is being thrown away.`,
      { tone: "success" },
    );
    if (res.reference) onBooked(res.reference);
    else onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title="Record a return" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        {/* ⚠️ The one question that changes what happens: did it come from
            outside, or was it already ours? */}
        <div className="flex flex-wrap gap-1.5">
          {(["customer", "internal"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`h-8 rounded-md px-2.5 text-sm ${
                kind === k ? "bg-accent text-accent-fg" : "border border-border text-fg-muted hover:text-fg"}`}>
              {CZ_RETURN_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={kind === "customer" ? "Back onto which shelf" : "Found where"}>
            <FluidSelect value={String(locationId)} onSelect={(v) => setLocationId(Number(v))}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
          </Field>
          <Field label="Date">
            <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={FIELD} />
          </Field>
          {kind === "customer" ? (
            <>
              <Field label="Who sent it back">
                <FluidSelect
                  value={customerId == null ? "" : String(customerId)}
                  onSelect={(v) => { setCustomerId(v ? Number(v) : null); setInvoiceId(null); }}
                  placeholder="Not named"
                  options={[
                    { value: "", label: "Not named" },
                    ...customers.map((c) => ({ value: String(c.id), label: c.name })),
                  ]} />
              </Field>
              <Field label="Sold on which invoice">
                <FluidSelect
                  value={invoiceId == null ? "" : String(invoiceId)}
                  onSelect={(v) => setInvoiceId(v ? Number(v) : null)}
                  placeholder={customerId == null ? "Name the customer first" : "Not said"}
                  options={[
                    { value: "", label: "Not said" },
                    ...forCustomer.map((i) => ({ value: String(i.id), label: `${i.number} · ${czDate(i.issueDate)}` })),
                  ]} />
              </Field>
            </>
          ) : (
            <Field label="Who found it">
              <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className={FIELD} placeholder="A name" />
            </Field>
          )}
        </div>

        {kind === "customer" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Who took it in">
              <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className={FIELD} placeholder="A name" />
            </Field>
            <Field label="Anything worth saying">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={FIELD} placeholder="Optional" />
            </Field>
          </div>
        )}

        {/* ⚠️ Said before anything is typed, because the two kinds do different
            things to the stock and somebody should know which they picked. */}
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          {kind === "customer"
            ? "This puts the chocolate back on the shelf — it left the books the day it was sold. What is fit to sell and what goes in the bin is decided afterwards."
            : "This moves nothing yet. The chocolate is already on the shelf; it comes off when you say it has been thrown away."}
        </p>

        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a chocolate…" className="text-sm" />

        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_130px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span>Batch</span>
            <span className="text-right">{kind === "customer" ? "Came back" : "Damaged"}</span>
          </div>
          <div className="max-h-[20rem] overflow-y-auto">
            {loading && <p className="px-3 py-6 text-center text-sm text-fg-subtle">Reading the shelf…</p>}
            {!loading && shown.map((i) => (
              <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_130px_110px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={i.name}>{i.name}</span>
                {/* ⚠️ A returned crate is the first place a bad batch shows
                    itself. If the form never asks, the thread back to the
                    morning it was made is cut. */}
                {i.batches.length > 0 ? (
                  <FluidSelect
                    value={batches[i.id] == null ? "" : String(batches[i.id])}
                    onSelect={(v) => setBatches((b) => ({ ...b, [i.id]: v ? Number(v) : null }))}
                    placeholder="Not known"
                    options={[
                      { value: "", label: "Not known" },
                      ...i.batches.map((b) => ({ value: String(b.id), label: b.batchNo })),
                    ]} />
                ) : (
                  <span className="text-xs text-fg-subtle">—</span>
                )}
                <input
                  value={amounts[i.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [i.id]: e.target.value }))}
                  inputMode="decimal"
                  className={`${FIELD} text-right tabular`}
                  placeholder="–"
                  aria-label={`Quantity of ${i.name}`}
                />
              </div>
            ))}
            {!loading && shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-fg-subtle">Nothing on that shelf matches.</p>
            )}
          </div>
        </div>

        {lines.length > 0 && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            <strong className="text-fg">{lines.length}</strong> line{lines.length === 1 ? "" : "s"} ·{" "}
            <strong className="text-fg">{qtyText(lines.reduce((s, l) => s + l.qty, 0))}</strong>{" "}
            {kind === "customer" ? "coming back." : "damaged."}
          </p>
        )}

        {blockers.length > 0 && lines.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <PackageOpen size={13} />} Record it
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /* ⚠️ `justify-end`, AND IT IS NOT COSMETIC. A grid cell stretches to the
     tallest row, so a label that wraps onto two lines pushed ITS control down
     while a one-line label left its control at the top — the boxes in one row
     sat at two different heights. Pushing label and control to the BOTTOM of
     the cell lines every control up whatever the labels do. */
  return (
    <label className="flex h-full flex-col justify-end gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}
