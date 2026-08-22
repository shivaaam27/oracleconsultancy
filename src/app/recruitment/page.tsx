// The recruitment desk — where the agency's work is read from (Phase 1).
//
// Deliberately small for now. The needs-attention list (permits, unpaid
// invoices, check-ins outstanding, the VAT threshold) is Phase 4, and rather
// than draw an empty version of it this page names what is not here yet and
// which phase brings it. See memory/recruitment_module_plan.md.

import Link from "next/link";
import { Briefcase, Users, Building2, ArrowRight, Send, CalendarClock, ShieldCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui";
import {
  agencyCompanyId, listJobOrders, listCandidates, listClients,
  listShortlistsWithClient, listInterviews, listPlacements,
} from "@/lib/recruitment";
import {
  isOpenOrder, orderFee, guaranteeState, expectedCheckIns, checkInTally, daysBetween,
} from "@/lib/recruitment-shared";
import { tzs, USD_TZS, VAT_RATE, feeFor } from "@/lib/recruitment-money";
import { fmtDate } from "@/lib/recruitment-shared";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recruitment desk" };

export default async function RecruitmentPage() {
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const [orders, candidates, clients, withClient, interviews, placements] = await Promise.all([
    listJobOrders(companyId),
    listCandidates(companyId),
    listClients(companyId),
    listShortlistsWithClient(companyId),
    listInterviews(companyId),
    listPlacements(companyId),
  ]);

  const now = new Date();
  // Interviews that have happened and whose outcome nobody has written down.
  const noOutcome = interviews.filter((i) => new Date(i.scheduledFor) < now && i.outcome === "Pending").length;
  const liveGuarantees = placements.filter((p) => guaranteeState(p.startedOn, p.endedOn) === "live").length;
  // Conversations owed and late, across every placement.
  const checkInsLate = placements.reduce(
    (n, p) => n + checkInTally(expectedCheckIns(p.startedOn, p.checkIns, now)).overdue, 0,
  );
  // The longest a shortlist has been sitting with a client without an answer.
  const longestWait = withClient.reduce((max, s) => {
    if (!s.sentToClientOn) return max;
    return Math.max(max, daysBetween(new Date(s.sentToClientOn), now));
  }, 0);
  // A candidate put forward with no written reasoning is a promise not kept.
  const noReasoning = withClient.filter((s) => !s.matchNote?.trim()).length;

  const open = orders.filter((o) => isOpenOrder(o.stage));
  // What the open book is worth if every role is filled at the salary agreed.
  // NOT a forecast — Oracle's own workbook is clear that ten a month is a
  // ceiling, not a plan, so this is only "the fees on the table today".
  const onTheTable = open
    .filter((o) => o.clientId != null)
    .reduce((sum, o) => sum + (orderFee(o.monthlyGrossUsd)?.netTZS ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recruitment"
        sub="Indian professionals for Tanzanian employers. The fee is one month of the placed candidate's gross salary, plus 18% VAT, payable in full on offer acceptance."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile href="/recruitment/orders" icon={<Briefcase size={15} />} label="Open roles" figure={String(open.length)} note={`${orders.length} in the book`} />
        <Tile href="/recruitment/candidates" icon={<Users size={15} />} label="Candidates" figure={String(candidates.length)} note="in the pool" />
        <Tile href="/recruitment/clients" icon={<Building2 size={15} />} label="Clients" figure={String(clients.length)} note="employers" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile href="/recruitment/shortlists" icon={<Send size={15} />} label="With the client" figure={String(withClient.length)}
          note={longestWait > 0 ? `longest wait ${longestWait} days` : "awaiting a decision"} />
        <Tile href="/recruitment/interviews" icon={<CalendarClock size={15} />} label="Interviews" figure={String(interviews.filter((i) => new Date(i.scheduledFor) >= now && i.outcome === "Pending").length)}
          note={noOutcome > 0 ? `${noOutcome} with no outcome written` : "coming up"} />
        <Tile href="/recruitment/placements" icon={<ShieldCheck size={15} />} label="In the first month" figure={String(liveGuarantees)}
          note={`${placements.length} placed in all`} />
      </div>

      {(checkInsLate > 0 || noReasoning > 0) && (
        <section className="rounded-lg border border-warn/30 bg-warn-soft/40 px-3 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle size={13} className="text-warn" /> Owed
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-fg-muted">
            {checkInsLate > 0 && (
              <li>
                · <Link href="/recruitment/placements?view=owed" className="text-accent underline">
                  {checkInsLate} check-in{checkInsLate === 1 ? "" : "s"} overdue
                </Link>{" "}
                — the written record is what a disputed placement is decided on.
              </li>
            )}
            {noReasoning > 0 && (
              <li>
                · <Link href="/recruitment/shortlists" className="text-accent underline">
                  {noReasoning} candidate{noReasoning === 1 ? " is" : "s are"} in front of a client with no written reasoning
                </Link>{" "}
                — that is the thing the profile promises them.
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <div className="flex items-center gap-2 border-b border-border bg-bg-subtle px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Open roles</span>
          <Link href="/recruitment/orders" className="ml-auto text-xs text-accent hover:underline">
            All job orders
          </Link>
        </div>
        {open.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-subtle">
            Nothing open. Raise a job order when a brief is agreed.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {/* Oldest first — the role that has been open longest is the one
                being let down (DESIGN_SYSTEM.md §12, worst first). */}
            {[...open]
              .sort((a, b) => (a.openedOn ?? "").localeCompare(b.openedOn ?? ""))
              .slice(0, 8)
              .map((o) => {
                const fee = o.clientId == null ? null : feeFor(o.monthlyGrossUsd);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/recruitment/orders/${encodeURIComponent(o.ref)}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 transition-colors hover:bg-bg-subtle"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium">{o.title}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          <span className="font-mono">{o.ref}</span>
                          {" · "}
                          {o.clientName ?? "Oracle's own hiring"}
                          {o.openedOn ? ` · opened ${fmtDate(o.openedOn)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-fg-muted">{o.stage}</span>
                      <span className="w-[110px] shrink-0 text-right tabular text-sm">
                        {o.clientId == null ? "—" : fee ? tzs(fee.netTZS) : "not agreed"}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
        {open.length > 8 && (
          <p className="border-t border-border bg-bg-subtle px-3 py-1.5 text-xs text-fg-muted">
            8 of {open.length} shown.{" "}
            <Link href="/recruitment/orders" className="text-accent hover:underline">See them all</Link>
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <div className="border-b border-border bg-bg-subtle px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Fees on the table</span>
        </div>
        <div className="px-3 py-3">
          <p className="tabular text-[22px] font-semibold">TZS {tzs(onTheTable)}</p>
          <p className="mt-1 text-sm text-fg-muted">
            One month of gross on every open role where a salary has been agreed, at{" "}
            {tzs(USD_TZS)}/USD. Not a forecast, and not counting VAT — the {Math.round(VAT_RATE * 100)}%
            is collected for TRA and is never income.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-bg-subtle px-3 py-3">
        <p className="text-sm font-medium">What is not here yet</p>
        <ul className="mt-1.5 space-y-1 text-sm text-fg-muted">
          <li>· The invoice, and posting it to the ledger — Phase 3.</li>
          <li>· Permit renewals, the 10:1 ratio, the VAT threshold and the launch registrations — Phase 4.</li>
        </ul>
      </section>
    </div>
  );
}

function Tile({ href, icon, label, figure, note }: {
  href: string; icon: React.ReactNode; label: string; figure: string; note: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-bg-elev px-3 py-3 transition-colors hover:border-accent/40"
    >
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.04em] text-fg-subtle">
        {icon} {label}
      </span>
      <span className="mt-1.5 block tabular text-[24px] font-semibold leading-none">{figure}</span>
      <span className="mt-1 flex items-center gap-1 text-sm text-fg-muted">
        {note}
        <ArrowRight size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </Link>
  );
}
