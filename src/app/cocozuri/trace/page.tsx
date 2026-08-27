import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, Radar, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriTracePicker } from "@/components/cocozuri-trace";
import { cocozuriCompany } from "@/lib/cocozuri";
import { czDate } from "@/lib/cocozuri-shared";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";
import { allLots, batchesUsing, expiringStock, traceBatch } from "@/lib/cocozuri-trace";
import { invoicesCarrying } from "@/lib/cocozuri-despatch";
import { EXPIRY_LABEL, STEP_LABEL, expiryState } from "@/lib/cocozuri-trace-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trace — CocoZuri" };

/**
 * Stage 9 — where a bar came from, and where a bag went.
 *
 * ⚠️ THIS IS THE SCREEN THE WHOLE PROGRAMME EXISTS FOR. On the day somebody
 * rings up about a chocolate with a date on it, there are only two questions:
 * **what went into it**, and **where did the rest go**. Both are answerable
 * here, from the stock ledger, because every movement carries its lot.
 */
export default async function CocozuriTracePage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Trace" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const [lots, expiring] = await Promise.all([allLots(), expiringStock()]);
  const chosen = sp.batch ? await traceBatch(sp.batch) : null;
  const usedIn = sp.batch ? await batchesUsing(sp.batch) : [];
  /* ⚠️ THE OTHER HALF OF A RECALL, AND THE STOCK LEDGER CANNOT ANSWER IT. It
     knows a lot left the building; only the invoice knows WHO GOT IT, because an
     invoice line names a product. This is the list somebody rings round. */
  const wentTo = sp.batch ? await invoicesCarrying(sp.batch) : [];

  const expired = expiring.rows.filter((r) => r.state === "expired");
  const critical = expiring.rows.filter((r) => r.state === "critical");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trace"
        sub={`${lots.length} lot${lots.length === 1 ? "" : "s"} on record · ${company.name}`}
      />

      <CocozuriTracePicker lots={lots} chosen={sp.batch ?? null} />

      {/* ------------------------------ the trace ------------------------------ */}
      {chosen && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile label={chosen.source === "purchase" ? "Bought in" : "Made"} value={qtyText(chosen.madeQty)} />
            <Tile label="Still on a shelf" value={qtyText(chosen.onHand)} />
            <Tile label={chosen.source === "purchase" ? "Delivered" : "Made on"} value={czDate(chosen.madeOn)} />
            <Tile
              label={EXPIRY_LABEL[expiryState(chosen.expiresOn, expiring.today)]}
              value={chosen.expiresOn ? czDate(chosen.expiresOn) : "nobody has said"}
              tone={chosen.expiresOn == null ? "warn"
                : expiryState(chosen.expiresOn, expiring.today) === "expired" ? "danger" : undefined} />
          </div>

          {/* ⚠️ Backward: what went in, and which lot of each. */}
          {chosen.wentIn.length > 0 && (
            <Section
              icon={<ArrowUp size={13} />}
              title={`What went into ${chosen.batchNo}`}
              hint="Each line names the lot it came out of, so the thread runs on to the delivery and the supplier.">
              {chosen.wentIn.map((s, i) => (
                <Step key={i} step={s} />
              ))}
            </Section>
          )}

          {/* ⚠️ Forward: where it went. */}
          <Section
            icon={<ArrowDown size={13} />}
            title={`Where ${chosen.batchNo} went`}
            hint="Every movement that carries this lot, in the order it happened.">
            {chosen.wentOut.length === 0
              ? <p className="px-3 py-3 text-sm text-fg-subtle">Nothing has moved yet.</p>
              : chosen.wentOut.map((s, i) => <Step key={i} step={s} />)}
          </Section>

          {/* ⚠️ THE RECALL QUESTION, answered the other way round: a supplier
              says a bag was bad, and this is what was made from it. */}
          {usedIn.length > 0 && (
            <Section
              icon={<Radar size={13} />}
              title={`What was made from ${chosen.batchNo}`}
              hint="If this one turns out to be bad, this is exactly what has to come off the shelves — and nothing else.">
              {usedIn.map((b) => (
                <div key={b.batchNo} className="grid grid-cols-[130px_minmax(0,1fr)_100px_100px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                  <Link href={`/cocozuri/trace?batch=${encodeURIComponent(b.batchNo)}`}
                    className="truncate text-sm text-accent hover:underline">{b.batchNo}</Link>
                  <span className="min-w-0 truncate text-sm text-fg">{b.itemName ?? "—"}</span>
                  <span className="text-right text-sm tabular text-fg-subtle">{czDate(b.madeOn)}</span>
                  <span className="text-right text-sm tabular text-fg-muted">{qtyText(b.qtyUsed)} used</span>
                </div>
              ))}
            </Section>
          )}

          {/* ⚠️ WHO GOT IT — the half nothing could answer before. A movement
              says a lot left the kitchen; only the invoice says it went to
              Garden Market, because an invoice line names a PRODUCT. */}
          <Section
            icon={<Truck size={13} />}
            title={`Who got ${chosen.batchNo}`}
            hint="Every invoice that carried this lot, newest first — the list to ring round. Recorded when the invoice was issued, and correctable on it.">
            {wentTo.length === 0
              ? (
                <p className="px-3 py-3 text-sm text-fg-subtle">
                  No invoice records carrying this lot. Invoices issued before lots were recorded
                  carry none — which is not the same as nothing having gone out.
                </p>
              )
              : wentTo.map((w, i) => (
                <div key={`${w.number}#${i}`} className="grid grid-cols-[100px_120px_minmax(0,1fr)_110px_90px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                  <span className="truncate text-sm tabular text-fg-muted">{czDate(w.issueDate)}</span>
                  <Link href={`/cocozuri/invoices/${encodeURIComponent(w.number)}`}
                    className="truncate text-sm text-accent hover:underline">{w.number}</Link>
                  <span className="min-w-0 truncate text-sm text-fg" title={w.description}>
                    {w.customerName ?? "—"}
                    <span className="ml-1.5 text-xs text-fg-subtle">{w.description}</span>
                  </span>
                  <span className="truncate text-sm text-fg-subtle">
                    {w.status === "issued" ? "Issued" : w.status === "cancelled" ? "Cancelled" : w.status}
                  </span>
                  <span className="text-right text-sm tabular text-fg-muted">{qtyText(w.qty)}</span>
                </div>
              ))}
          </Section>
        </>
      )}

      {/* --------------------------- what is going off --------------------------- */}
      {(expired.length > 0 || critical.length > 0) && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            {expired.length > 0 && <><strong>{expired.length}</strong> lot{expired.length === 1 ? " is" : "s are"} past their date. </>}
            {critical.length > 0 && <><strong>{critical.length}</strong> more go off within a fortnight.</>}
          </span>
        </p>
      )}

      <Section
        icon={<Radar size={13} />}
        title="What is on a shelf, soonest off first"
        hint={
          expiring.undated > 0
            ? `${qtyText(expiring.undated)} of it carries no date at all — which is the finding that matters most in a food business.`
            : "Everything on a shelf that belongs to a lot."
        }>
        {/* ⚠️ THIS TABLE HAD NO HEADER ROW. Five columns — lot, chocolate, shelf,
            how many, when it goes off — and nothing at the top saying which was
            which. The reader was left to infer it from the values. */}
        {expiring.rows.length > 0 && (
          <div className="grid grid-cols-[130px_minmax(0,1fr)_110px_100px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Lot</span>
            <span>What</span>
            <span>Where</span>
            <span className="text-right">On hand</span>
            <span className="text-right">Goes off</span>
          </div>
        )}
        {expiring.rows.length === 0
          ? (
            <p className="px-3 py-4 text-sm text-fg-subtle">
              Nothing is tracked by lot yet. A lot is made when a batch is closed, or when a delivery
              is approved with a date typed against the line.
            </p>
          )
          : expiring.rows.slice(0, 40).map((r) => (
            <div key={r.lot.batchId} className="grid grid-cols-[130px_minmax(0,1fr)_110px_100px_110px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
              <Link href={`/cocozuri/trace?batch=${encodeURIComponent(r.lot.batchNo)}`}
                className="truncate text-sm text-accent hover:underline">{r.lot.batchNo}</Link>
              <span className="min-w-0 truncate text-sm text-fg" title={r.itemName}>{r.itemName}</span>
              <span className="truncate text-sm text-fg-subtle">{r.locationName ?? "—"}</span>
              <span className="text-right text-sm tabular text-fg-muted">{qtyText(r.lot.onHand)}</span>
              <span className={`text-right text-sm tabular ${
                r.state === "expired" ? "text-danger"
                  : r.state === "critical" ? "text-warn"
                  : r.state === "unknown" ? "text-fg-subtle" : "text-fg-muted"}`}>
                {r.lot.expiresOn ? czDate(r.lot.expiresOn) : "no date"}
                {r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft <= 60 && ` · ${r.daysLeft}d`}
              </span>
            </div>
          ))}
      </Section>
    </div>
  );
}

function Section({
  icon, title, hint, children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
      <div className="min-w-[38rem]">
        <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-bg-subtle px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            {icon} {title}
          </span>
          <span className="text-xs text-fg-subtle">{hint}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Step({ step }: { step: { kind: keyof typeof STEP_LABEL; onDate: string; itemName: string; locationName: string | null; qty: number; note: string | null } }) {
  return (
    /* ⚠️ THE DATE WAS CARRIED AND NEVER SHOWN. Every step here already knew when
       it happened — the row simply did not print it — and on the one screen that
       exists for the morning somebody rings up about a bad chocolate, "when" is
       the column you follow. */
    <div className="grid grid-cols-[100px_120px_minmax(0,1fr)_110px_100px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
      <span className="truncate text-sm tabular text-fg-muted">{czDate(step.onDate)}</span>
      <span className="truncate text-sm text-fg-muted">{STEP_LABEL[step.kind]}</span>
      <span className="min-w-0 truncate text-sm text-fg" title={step.note ?? step.itemName}>
        {step.itemName}
        {step.note && <span className="ml-1.5 text-xs text-fg-subtle">{step.note}</span>}
      </span>
      <span className="truncate text-sm text-fg-subtle">{step.locationName ?? "—"}</span>
      <span className={`text-right text-sm tabular ${step.qty < 0 ? "text-fg-muted" : "text-success"}`}>
        {qtyText(step.qty)}
      </span>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-lg font-semibold leading-none tabular ${
        tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}
