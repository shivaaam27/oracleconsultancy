"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { SearchInput, Button, FIELD } from "@/components/ui";
import { SelectField } from "@/components/select-field";
import { createCampaignAction, archiveCampaignAction } from "@/app/marketing/actions";

export type CampaignRow = {
  id: number;
  name: string;
  purpose: string | null;
  company_id: number | null;
  client_id: number | null;
  starts_on: string | null;
  ends_on: string | null;
  archived: boolean;
  posts: number;
};

type Owner = { id: number; name: string };

const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null;

/**
 * A run of work with a purpose.
 *
 * ⚠️ OPTIONAL, AND IT STAYS OPTIONAL. A quick photo from the shop floor belongs
 * to no campaign, and a form that insisted on one would turn a fifteen-second
 * job into a decision.
 */
export function MarketingCampaigns({
  campaigns, companies, clients, today,
}: {
  campaigns: CampaignRow[];
  companies: Owner[];
  clients: Owner[];
  /** Passed in so the server and the browser agree on what "live" means. */
  today: string;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const live = campaigns.filter((c) => !c.archived);
  const archived = campaigns.filter((c) => c.archived);

  const isOver = (c: CampaignRow) => !!c.ends_on && c.ends_on < today;
  const running = live.filter((c) => !isOver(c)).length;
  const over = live.filter(isOver).length;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = view === "archived" ? archived : live;
    return base
      .filter((c) => (view === "running" ? !isOver(c) : view === "over" ? isOver(c) : true))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.purpose ?? "").toLowerCase().includes(term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, archived, q, view, today]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All campaigns", count: live.length, href: "#", active: !view, onSelect: () => setView(null) },
    ...(running > 0 ? [{ key: "running", label: "Running", count: running, href: "#", active: view === "running", group: "State", onSelect: () => setView("running") }] : []),
    ...(over > 0 ? [{ key: "over", label: "Finished", count: over, href: "#", active: view === "over", group: "State", onSelect: () => setView("over") }] : []),
    ...(archived.length > 0 ? [{ key: "archived", label: "Archived", count: archived.length, href: "#", active: view === "archived", group: "Archive", onSelect: () => setView("archived") }] : []),
  ];

  const columns: RecordColumn<CampaignRow>[] = [
    {
      key: "name", label: "Campaign", width: "minmax(0,1.3fr)",
      render: (c) => (
        <span className="min-w-0">
          <span className="block truncate text-base font-medium text-fg">{c.name}</span>
          {c.purpose && <span className="block truncate text-xs text-fg-subtle">{c.purpose}</span>}
        </span>
      ),
      csv: (c) => c.name,
    },
    {
      key: "owner", label: "For", width: "minmax(0,1fr)", hideBelow: "md",
      render: (c) => (
        <span className="truncate text-fg-muted">
          {c.company_id != null ? companyName.get(c.company_id) ?? "—"
            : c.client_id != null ? clientName.get(c.client_id) ?? "—"
            : "—"}
        </span>
      ),
      csv: (c) => (c.company_id != null ? companyName.get(c.company_id) ?? "" : c.client_id != null ? clientName.get(c.client_id) ?? "" : ""),
    },
    {
      key: "dates", label: "When", width: "190px", hideBelow: "lg",
      render: (c) => {
        const from = fmtDay(c.starts_on);
        const to = fmtDay(c.ends_on);
        if (!from && !to) return <span className="text-fg-subtle">no dates</span>;
        return <span className="text-fg-muted">{from ?? "…"} → {to ?? "open"}</span>;
      },
      csv: (c) => [c.starts_on, c.ends_on].filter(Boolean).join(" → "),
    },
    {
      key: "posts", label: "Posts", width: "90px", align: "right",
      /* ⚠️ Counted on read. There is no stored post count to drift. */
      render: (c) => <span className="tabular">{c.posts}</span>,
      csv: (c) => c.posts,
    },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        filters={rail}
        listKey="mkt_campaign"
        exportName="marketing-campaigns"
        total={live.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search campaigns…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New campaign
            </button>
          </div>
        }
        rowActions={(c) => (
          <form action={archiveCampaignAction}>
            <input type="hidden" name="id" value={c.id} />
            {c.archived && <input type="hidden" name="restore" value="on" />}
            <Button type="submit" size="xs" variant="ghost">{c.archived ? "Restore" : "Archive"}</Button>
          </form>
        )}
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">No campaigns.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              Posts do not need one. Add a campaign when a run of work has a name worth reporting on.
            </p>
          </div>
        }
      />

      {adding && (
        <BottomSheet open onClose={() => setAdding(false)} title="New campaign">
          <form action={createCampaignAction} onSubmit={() => setAdding(false)} className="flex flex-col gap-3 px-1 pb-2">
            <Field label="Name">
              <input name="name" className={FIELD} placeholder="Recruitment launch" required autoFocus />
            </Field>
            <Field label="What it is for">
              <input name="purpose" className={FIELD} placeholder="Brand awareness before the first placements" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company">
                <SelectField name="companyId" placeholder="Not set"
                  options={[{ value: "", label: "Not set" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
              </Field>
              <Field label="…or client">
                <SelectField name="clientId" placeholder="Not set"
                  options={[{ value: "", label: "Not set" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts"><input name="startsOn" type="date" className={FIELD} /></Field>
              <Field label="Ends"><input name="endsOn" type="date" className={FIELD} /></Field>
            </div>
            <Button type="submit" variant="primary" className="mt-1 w-full">Add campaign</Button>
          </form>
        </BottomSheet>
      )}
    </>
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
