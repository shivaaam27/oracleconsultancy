"use client";

// One job order — the role, and what it is worth.
//
// The fee panel is the point of this screen: it shows the whole calculation
// rather than a single figure, so the number on an invoice can always be
// explained from the salary that was agreed in writing.

import { AlertTriangle, Info } from "lucide-react";
import { RecruitmentRecord } from "./recruitment-record";
import { JOB_ORDER_FORM } from "@/lib/recruitment-fields";
import { toOrderPatch, orderFormValues } from "./recruitment-orders-list";
import { updateJobOrderAction, archiveJobOrderAction, deleteJobOrderAction } from "@/app/recruitment/actions";
import { DangerZone } from "./recruitment-danger-zone";
import { orderFee, seniorityLabel, fmtDate, stageProgress, isLiveOnShortlist } from "@/lib/recruitment-shared";
import { usd, tzs, VAT_RATE, USD_TZS } from "@/lib/recruitment-money";
import { ShortlistPanel, type ShortlistRow, type InterviewRow, type PoolCandidate } from "./recruitment-shortlist-panel";
import { PlacementPanel, type PlacementRow } from "./recruitment-placement-panel";

export type OrderRecordData = {
  id: number;
  ref: string;
  title: string;
  clientId: number | null;
  clientName: string | null;
  sector: string | null;
  seniority: string | null;
  monthlyGrossUsd: string | null;
  stage: string;
  openedOn: string | null;
  signedOn: string | null;
  targetStartOn: string | null;
  permitExpiry: string | null;
  notes: string | null;
  archived: boolean;
};

export function RecruitmentOrderRecord({
  order, clients, shortlist, interviews, placements, pool,
}: {
  order: OrderRecordData;
  clients: { id: number; name: string }[];
  shortlist: ShortlistRow[];
  interviews: InterviewRow[];
  placements: PlacementRow[];
  /** Everyone in the pool, so a candidate can be put forward without leaving. */
  pool: PoolCandidate[];
}) {
  const internal = order.clientId == null;
  const fee = orderFee(order.monthlyGrossUsd);
  const progress = Math.round(stageProgress(order.stage) * 100);
  const live = shortlist.filter((s) => isLiveOnShortlist(s.stage)).length;

  return (
    <RecruitmentRecord
      title={order.title}
      code={order.ref}
      subtitle={[
        internal ? "Oracle's own hiring" : order.clientName,
        order.sector,
        order.seniority ? seniorityLabel(order.seniority) : null,
      ].filter(Boolean).join(" · ") || undefined}
      status={order.archived ? "Archived" : order.stage}
      backHref="/recruitment/orders"
      backLabel="All job orders"
      groups={JOB_ORDER_FORM}
      values={orderFormValues(order)}
      dynamicOptions={{ clientId: clients.map((c) => ({ value: String(c.id), label: c.name })) }}
      archived={order.archived}
      onSave={(v) => updateJobOrderAction(order.id, order.ref, toOrderPatch(v))}
      onArchive={(a) => archiveJobOrderAction(order.id, a)}
      extraTabs={[
        {
          id: "shortlist",
          label: "Shortlist",
          count: live || undefined,
          content: (
            <ShortlistPanel
              orderRef={order.ref}
              jobOrderId={order.id}
              order={{
                title: order.title,
                sector: order.sector,
                seniority: order.seniority,
                monthlyGrossUsd: order.monthlyGrossUsd,
              }}
              rows={shortlist}
              interviews={interviews}
              pool={pool}
              hasPlacement={placements.some((p) => !p.endedOn)}
            />
          ),
        },
        {
          id: "placement",
          label: "The first month",
          count: placements.length || undefined,
          content: <PlacementPanel orderRef={order.ref} placements={placements} internal={internal} />,
        },
      ]}
      banner={
        !internal && !order.signedOn ? (
          <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft/50 px-3 py-2 text-[12px] text-fg">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
            <span>
              <strong>The Job Order is not signed yet.</strong> The salary on it is what the fee is
              calculated from, so it is agreed in writing before the search starts.
            </span>
          </p>
        ) : null
      }
      sidebar={
        <div className="space-y-3">
          <Panel title="Progress">
            <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <Row label="Stage" value={order.stage} />
            <Row label="Opened" value={fmtDate(order.openedOn) ?? "—"} />
            <Row label="Target start" value={fmtDate(order.targetStartOn) ?? "—"} />
          </Panel>

          <Panel title={internal ? "No fee" : "The fee"}>
            {internal ? (
              <p className="text-[12px] text-fg-muted">
                Oracle is hiring for itself, so there is no fee, no invoice and no guarantee.
              </p>
            ) : !fee ? (
              <p className="text-[12px] text-fg-muted">
                No salary agreed yet, so there is no fee to show. It is one month of the gross,
                whatever that turns out to be.
              </p>
            ) : (
              <>
                <Row label="Monthly gross" value={usd(fee.grossUSD)} />
                <Row label={`at ${tzs(USD_TZS)}/USD`} value={tzs(fee.grossTZS)} />
                <div className="my-1.5 border-t border-border" />
                <Row label="Fee — one month" value={tzs(fee.netTZS)} strong />
                <Row label={`VAT at ${Math.round(VAT_RATE * 100)}%`} value={tzs(fee.vatTZS)} />
                <div className="my-1.5 border-t border-border" />
                <Row label="Invoice total" value={tzs(fee.totalTZS)} strong />
                <p className="flex items-start gap-1.5 pt-2 text-[11px] text-fg-subtle">
                  <Info size={11} className="mt-0.5 shrink-0" />
                  <span>
                    Payable in full when the candidate accepts. VAT is collected for TRA and is
                    never Oracle&rsquo;s income.
                  </span>
                </p>
              </>
            )}
          </Panel>

          <Panel title="The client's obligations">
            <p className="text-[12px] text-fg-muted">
              Permits, visas, flights and relocation are the employer&rsquo;s own arrangements,
              paid direct at the official amount. Oracle does not handle them and takes no margin
              on them.
            </p>
            {order.permitExpiry && (
              <Row label="Permit expires" value={fmtDate(order.permitExpiry) ?? "—"} />
            )}
          </Panel>

          <DangerZone
            what="job order"
            name={order.ref}
            alsoGoes={shortlist.length > 0
              ? `Its shortlist of ${shortlist.length} goes with it.`
              : undefined}
            onDelete={() => deleteJobOrderAction(order.id)}
            backHref="/recruitment/orders"
          />
        </div>
      }
    />
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <div className="border-b border-border bg-bg-subtle px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</span>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">{children}</div>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <span className={strong ? "text-[13px] font-medium tabular" : "text-[12px] tabular"}>{value}</span>
    </div>
  );
}
