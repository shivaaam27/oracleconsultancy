"use client";

import { useMemo, useState } from "react";
import { Plus, Banknote } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { SearchInput, Button, FIELD, FIELD_NUM, Textarea } from "@/components/ui";
import { SelectField } from "@/components/select-field";
import {
  bestReading, engagementOf, followerGrowth, summariseSpend, spendInMonth, capCheck,
  costPerThousand, type MktResult, type MktSpendRow,
} from "@/lib/marketing-results-shared";
import { addResultAction, addSpendAction, deleteSpendAction } from "@/app/marketing/actions";

export type ResultsPublication = {
  id: number;
  postId: number;
  postTitle: string;
  accountHandle: string;
  platform: string;
  clientId: number | null;
  companyId: number | null;
  publishedAt: string | null;
  results: MktResult[];
};

export type ClientMoney = {
  id: number;
  name: string;
  capMonthly: number | null;
};

type Named = { id: number; name: string };

const money = (n: number) => `TZS ${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
/** "2026-08" is a key, not something to show somebody. */
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
};
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-GB"));
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";

/**
 * Results and money.
 *
 * ⚠️ EVERY FIGURE HERE IS TYPED, ON PURPOSE. Reading them from Instagram is a
 * later phase that only changes a reading's `source` — the list, the sums and
 * the reports below stay exactly as they are. That is why this is worth having
 * now rather than waiting weeks on an approval that may never come.
 *
 * ⚠️ A READING IS ADDED, NEVER EDITED. Reach on day one and reach a month later
 * are different facts, and the gap between them is the only thing that shows
 * whether a post kept working.
 */
export function MarketingResults({
  publications, spend, clients, companies, campaigns, thisMonth,
}: {
  publications: ResultsPublication[];
  spend: MktSpendRow[];
  clients: ClientMoney[];
  companies: Named[];
  campaigns: Named[];
  /** YYYY-MM in Dar, worked out on the server so both halves agree. */
  thisMonth: string;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [reading, setReading] = useState<ResultsPublication | null>(null);
  const [addingSpend, setAddingSpend] = useState(false);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const measured = publications.filter((p) => p.results.length > 0);
  const unmeasured = publications.filter((p) => p.results.length === 0);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return publications
      .filter((p) => (view === "unmeasured" ? p.results.length === 0 : view === "measured" ? p.results.length > 0 : true))
      .filter((p) => !term || p.postTitle.toLowerCase().includes(term) || p.accountHandle.toLowerCase().includes(term));
  }, [publications, q, view]);

  const rail: RecordFilter[] = [
    { key: "all", label: "Everything out", count: publications.length, href: "#", active: !view, onSelect: () => setView(null) },
    ...(unmeasured.length > 0
      ? [{ key: "unmeasured", label: "No figures yet", count: unmeasured.length, href: "#", active: view === "unmeasured", group: "Measuring", tone: "info" as const, onSelect: () => setView("unmeasured") }]
      : []),
    ...(measured.length > 0
      ? [{ key: "measured", label: "Measured", count: measured.length, href: "#", active: view === "measured", group: "Measuring", onSelect: () => setView("measured") }]
      : []),
  ];

  /* ── the money, worked out on read ── */
  const totals = summariseSpend(spend);
  const monthRows = spendInMonth(spend, thisMonth);
  const monthTotals = summariseSpend(monthRows);

  /** What the free offer has cost us, per client. */
  const perClient = useMemo(() => {
    const m = new Map<number, { all: number; month: number }>();
    for (const s of spend) {
      if (s.clientId == null || s.borneBy === "client") continue;
      const e = m.get(s.clientId) ?? { all: 0, month: 0 };
      e.all += s.amount;
      if (s.onDate.slice(0, 7) === thisMonth) e.month += s.amount;
      m.set(s.clientId, e);
    }
    return m;
  }, [spend, thisMonth]);

  const columns: RecordColumn<ResultsPublication>[] = [
    {
      key: "post", label: "Post", width: "minmax(0,1.5fr)",
      render: (p) => (
        <span className="min-w-0">
          <button type="button" onClick={() => setReading(p)} className="block max-w-full truncate text-left text-base font-medium text-fg hover:text-accent">
            {p.postTitle}
          </button>
          <span className="block truncate text-xs text-fg-subtle">{p.accountHandle} · out {day(p.publishedAt)}</span>
        </span>
      ),
      csv: (p) => p.postTitle,
    },
    {
      key: "reach", label: "Reach", width: "110px", align: "right",
      render: (p) => {
        const b = bestReading(p.results);
        return <span className="tabular text-fg-muted">{num(b?.reach ?? null)}</span>;
      },
      csv: (p) => bestReading(p.results)?.reach ?? null,
    },
    {
      key: "engagement", label: "Engagement", width: "120px", align: "right", hideBelow: "md",
      render: (p) => {
        const b = bestReading(p.results);
        return <span className="tabular text-fg-muted">{num(b ? engagementOf(b) : null)}</span>;
      },
      csv: (p) => { const b = bestReading(p.results); return b ? engagementOf(b) : null; },
    },
    {
      key: "source", label: "Figures from", width: "130px", hideBelow: "lg",
      /* ⚠️ Never hidden. Ours and the platform's will disagree, and which you
         are looking at is part of the number. */
      render: (p) => {
        const b = bestReading(p.results);
        if (!b) return <span className="text-accent">not measured</span>;
        return <span className="text-fg-muted">{b.source === "platform" ? "the platform" : "typed in"}</span>;
      },
      csv: (p) => bestReading(p.results)?.source ?? "",
    },
    {
      key: "readings", label: "Readings", width: "100px", align: "right", hideBelow: "md", defaultHidden: true,
      render: (p) => <span className="tabular text-fg-subtle">{p.results.length}</span>,
      csv: (p) => p.results.length,
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── what the advertising has cost ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Money label="We have spent" value={money(totals.ours)} sub="on advertising, all time" />
        <Money label="This month" value={money(monthTotals.ours)} sub={monthName(thisMonth)} />
        <Money
          label="Clients paid themselves"
          value={money(totals.theirs)}
          sub={totals.theirs === 0 ? "nothing so far" : "not our cost"}
        />
      </div>

      {clients.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-elev">
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            <Banknote size={15} className="text-fg-subtle" />
            <span className="text-sm font-medium text-fg">What the free offer is costing us</span>
            <span className="grow" />
            <button
              type="button"
              onClick={() => setAddingSpend(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> Record spend
            </button>
          </div>
          <ul className="divide-y divide-border">
            {clients.map((c) => {
              const e = perClient.get(c.id) ?? { all: 0, month: 0 };
              const cap = capCheck(e.month, c.capMonthly);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm">
                  <span className="font-medium text-fg">{c.name}</span>
                  <span className="tabular text-fg-muted">{money(e.all)} in total</span>
                  <span className="tabular text-fg-subtle">{money(e.month)} in {monthName(thisMonth)}</span>
                  {/* ⚠️ No cap agreed is NOT a cap of zero — it says so rather
                      than claiming an overrun against a number nobody chose. */}
                  {cap.cap == null ? (
                    <span className="text-xs text-fg-subtle">no monthly limit agreed</span>
                  ) : (
                    <span className={`text-xs ${cap.over ? "text-danger" : "text-fg-subtle"}`}>
                      {cap.over ? "over the" : "of the"} {money(cap.cap)} agreed
                      {cap.usedPercent != null && ` · ${Math.round(cap.usedPercent)}% used`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        onRowClick={(p) => setReading(p)}
        filters={rail}
        listKey="mkt_result"
        exportName="marketing-results"
        total={publications.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search posts…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <span className="text-sm text-fg-subtle">Open a row to write down its figures</span>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">Nothing has gone out yet.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              Once a post is marked as out it appears here, ready for its numbers.
            </p>
          </div>
        }
      />

      {reading && (
        <ReadingSheet publication={reading} onClose={() => setReading(null)} />
      )}

      {addingSpend && (
        <SpendSheet
          clients={clients} companies={companies} campaigns={campaigns}
          spend={spend} clientName={clientName}
          onClose={() => setAddingSpend(false)}
        />
      )}
    </div>
  );
}

function Money({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      <span className="mt-1 block text-lg font-semibold tabular text-fg">{value}</span>
      <span className="mt-0.5 block text-sm text-fg-muted">{sub}</span>
    </div>
  );
}

/* ── writing down a reading ──────────────────────────────────────────────── */

function ReadingSheet({ publication, onClose }: { publication: ResultsPublication; onClose: () => void }) {
  const growth = followerGrowth(publication.results);
  const best = bestReading(publication.results);

  return (
    <BottomSheet open onClose={onClose} title={publication.postTitle}>
      <div className="flex flex-col gap-4 px-1 pb-2">
        <p className="text-sm text-fg-muted">
          {publication.accountHandle} · out {day(publication.publishedAt)}
        </p>

        {growth && (
          <p className="rounded-md bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            Followers went from <b className="text-fg">{num(growth.from)}</b> to{" "}
            <b className="text-fg">{num(growth.to)}</b> over {growth.days} day{growth.days === 1 ? "" : "s"}
            {growth.percent != null && ` — ${growth.gained >= 0 ? "up" : "down"} ${Math.abs(growth.percent).toFixed(1)}%`}.
          </p>
        )}

        <form action={addResultAction} onSubmit={onClose} className="flex flex-col gap-3">
          <input type="hidden" name="publicationId" value={publication.id} />
          <input type="hidden" name="source" value="typed" />

          <p className="text-xs text-fg-subtle">
            Put in whatever the app shows. Leave the rest empty — a blank box is not a zero, and a
            reading with nothing in it will be refused.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Reach"><input name="reach" type="number" min={0} className={FIELD_NUM} placeholder={best?.reach != null ? String(best.reach) : ""} /></Field>
            <Field label="Impressions"><input name="impressions" type="number" min={0} className={FIELD_NUM} /></Field>
            <Field label="Likes"><input name="likes" type="number" min={0} className={FIELD_NUM} /></Field>
            <Field label="Comments"><input name="comments" type="number" min={0} className={FIELD_NUM} /></Field>
            <Field label="Shares"><input name="shares" type="number" min={0} className={FIELD_NUM} /></Field>
            <Field label="Saves"><input name="saves" type="number" min={0} className={FIELD_NUM} /></Field>
            <Field label="Link clicks"><input name="clicks" type="number" min={0} className={FIELD_NUM} /></Field>
            <Field label="Followers now" hint="The account's total, for growth."><input name="followers" type="number" min={0} className={FIELD_NUM} /></Field>
          </div>

          <Button type="submit" variant="primary" className="w-full">Add this reading</Button>
        </form>

        {publication.results.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              Readings so far
            </span>
            {/* ⚠️ Every reading is kept. The point of the table is the change
                between them, so nothing is replaced. */}
            <ul className="flex flex-col divide-y divide-border">
              {[...publication.results].reverse().map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                  <span className="tabular text-fg-muted">{day(r.readAt)}</span>
                  <span className="text-fg-subtle">{r.source === "platform" ? "from the platform" : "typed in"}</span>
                  {r.reach != null && <span className="tabular text-fg-muted">{num(r.reach)} reached</span>}
                  {engagementOf(r) != null && <span className="tabular text-fg-muted">{num(engagementOf(r))} engaged</span>}
                  {r.followers != null && <span className="tabular text-fg-subtle">{num(r.followers)} followers</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ── money out ───────────────────────────────────────────────────────────── */

function SpendSheet({
  clients, companies, campaigns, spend, clientName, onClose,
}: {
  clients: ClientMoney[]; companies: Named[]; campaigns: Named[];
  spend: MktSpendRow[]; clientName: Map<number, string>; onClose: () => void;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  return (
    <BottomSheet open onClose={onClose} title="Record advertising spend">
      <div className="flex flex-col gap-4 px-1 pb-2">
        <form action={addSpendAction} onSubmit={onClose} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day"><input name="onDate" type="date" defaultValue={today} className={FIELD} required /></Field>
            <Field label="Amount"><input name="amount" type="number" min={0} step="0.01" className={FIELD_NUM} required autoFocus /></Field>
          </div>

          {/* ⚠️ The field that makes the report mean anything. */}
          <Field label="Who paid" hint="Design and posting are free; the advert money is normally ours.">
            <SelectField name="borneBy" defaultValue="us"
              options={[
                { value: "us", label: "We did — our cost" },
                { value: "client", label: "The client did" },
              ]} />
          </Field>

          <Field label="For which client" hint="Leave empty for one of our own companies.">
            <SelectField name="clientId" placeholder="None"
              options={[{ value: "", label: "None" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="…or our company">
              <SelectField name="companyId" placeholder="Not set"
                options={[{ value: "", label: "Not set" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
            </Field>
            <Field label="Campaign">
              <SelectField name="campaignId" placeholder="None"
                options={[{ value: "", label: "None" }, ...campaigns.map((c) => ({ value: String(c.id), label: c.name }))]} />
            </Field>
          </div>

          <Field label="Reference"><input name="reference" className={FIELD} placeholder="Receipt or transaction number" /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} placeholder="What it was boosting." /></Field>

          <Button type="submit" variant="primary" className="w-full">Record it</Button>
        </form>

        {spend.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Recorded so far</span>
            <ul className="flex flex-col divide-y divide-border">
              {spend.slice(0, 12).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                  <span className="tabular text-fg-muted">{s.onDate}</span>
                  <span className="tabular font-medium text-fg">{money(s.amount)}</span>
                  <span className={s.borneBy === "client" ? "text-fg-subtle" : "text-warn"}>
                    {s.borneBy === "client" ? "client paid" : "our cost"}
                  </span>
                  {s.clientId != null && <span className="text-fg-muted">{clientName.get(s.clientId)}</span>}
                  <form action={deleteSpendAction} className="ml-auto">
                    <input type="hidden" name="id" value={s.id} />
                    <Button type="submit" size="xs" variant="ghost">Remove</Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-fg-subtle">{hint}</span>}
    </label>
  );
}
