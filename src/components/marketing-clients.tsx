"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { SearchInput, Button, FIELD, FIELD_NUM } from "@/components/ui";
import type { FreePeriod } from "@/lib/marketing-shared";
import { createClientAction, archiveClientAction } from "@/app/marketing/actions";

export type ClientRow = {
  id: number;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  free_months: number;
  free_starts_on: string | null;
  ad_cap_monthly: string | null;
  archived: boolean;
  free: FreePeriod;
};

const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/**
 * The businesses Pamoja Plus advertises for.
 *
 * ⚠️ THE FREE PERIOD IS WORKED OUT, NOT TYPED. The clock starts the day the
 * first post for that client actually goes out — there was no start date to
 * ask for, because posting had not begun. The form's date is only for when
 * somebody STATES a different one, and the list says which of the two it is.
 */
export function MarketingClients({ clients }: { clients: ClientRow[] }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const live = clients.filter((c) => !c.archived);
  const archived = clients.filter((c) => c.archived);

  const counts = useMemo(() => {
    const c = { running: 0, "ending soon": 0, ended: 0, "not started": 0 } as Record<string, number>;
    for (const x of live) c[x.free.state] = (c[x.free.state] ?? 0) + 1;
    return c;
  }, [live]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = view === "archived" ? archived : live;
    return base
      .filter((c) => (view && view !== "archived" ? c.free.state === view : true))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.contact_name ?? "").toLowerCase().includes(term));
  }, [live, archived, q, view]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All clients", count: live.length, href: "#", active: !view, onSelect: () => setView(null) },
    ...(["ended", "ending soon", "running", "not started"] as const)
      .filter((s) => counts[s] > 0)
      .map((s) => ({
        key: s,
        label: s === "ended" ? "Free months over" : s === "ending soon" ? "Nearly over" : s === "running" ? "Inside free months" : "Not started",
        count: counts[s], href: "#", active: view === s, group: "Free advertising",
        tone: (s === "ended" ? "danger" : s === "ending soon" ? "warn" : undefined) as RecordFilter["tone"],
        onSelect: () => setView(s),
      })),
    ...(archived.length > 0
      ? [{ key: "archived", label: "Archived", count: archived.length, href: "#", active: view === "archived", group: "Archive", onSelect: () => setView("archived") }]
      : []),
  ];

  const columns: RecordColumn<ClientRow>[] = [
    {
      key: "name", label: "Client", width: "minmax(0,1.2fr)",
      render: (c) => (
        <span className="min-w-0">
          <span className="block truncate text-base font-medium text-fg">{c.name}</span>
          {c.contact_name && <span className="block truncate text-xs text-fg-subtle">{c.contact_name}</span>}
        </span>
      ),
      csv: (c) => c.name,
    },
    {
      key: "free", label: "Free advertising", width: "minmax(0,1fr)",
      render: (c) => {
        const f = c.free;
        if (f.state === "not started") {
          return <span className="text-fg-muted">{c.free_months} months — nothing posted yet</span>;
        }
        if (f.state === "ended") {
          return <span className="text-danger">Ended {fmtDay(f.endsOn)} — we are paying</span>;
        }
        return (
          <span className={f.state === "ending soon" ? "text-warn" : "text-fg-muted"}>
            Until {fmtDay(f.endsOn)} · {f.daysLeft} day{f.daysLeft === 1 ? "" : "s"} left
          </span>
        );
      },
      csv: (c) => c.free.endsOn ?? "not started",
    },
    {
      key: "source", label: "Clock started", width: "150px", hideBelow: "md",
      /* ⚠️ A date somebody typed and a date inferred from the first post are not
         equally trustworthy, so the list says which it is rather than showing
         one number for both. */
      render: (c) =>
        c.free.source === "stated" ? <span className="text-fg-muted">entered by hand</span>
        : c.free.source === "first post" ? <span className="text-fg-muted">on the first post</span>
        : <span className="text-fg-subtle">—</span>,
      csv: (c) => c.free.source,
    },
    {
      key: "cap", label: "Monthly limit", width: "150px", align: "right", hideBelow: "lg",
      render: (c) => (
        c.ad_cap_monthly
          ? <span className="tabular">{Number(c.ad_cap_monthly).toLocaleString()}</span>
          : <span className="text-fg-subtle">none agreed</span>
      ),
      csv: (c) => (c.ad_cap_monthly ? Number(c.ad_cap_monthly) : null),
    },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        filters={rail}
        listKey="mkt_client"
        exportName="marketing-clients"
        total={live.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New client
            </button>
          </div>
        }
        rowActions={(c) => (
          <form action={archiveClientAction}>
            <input type="hidden" name="id" value={c.id} />
            {c.archived && <input type="hidden" name="restore" value="on" />}
            <Button type="submit" size="xs" variant="ghost">{c.archived ? "Restore" : "Archive"}</Button>
          </form>
        )}
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">No clients yet.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              Add one when Pamoja Plus takes its first.
            </p>
          </div>
        }
      />

      {adding && (
        <BottomSheet open onClose={() => setAdding(false)} title="New client">
          <form action={createClientAction} onSubmit={() => setAdding(false)} className="flex flex-col gap-3 px-1 pb-2">
            <Field label="Business name">
              <input name="name" className={FIELD} placeholder="Kilimanjaro Coffee House" required autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact">
                <input name="contactName" className={FIELD} placeholder="Who we deal with" />
              </Field>
              <Field label="Phone">
                <input name="contactPhone" className={FIELD} placeholder="+255…" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Free months">
                <input name="freeMonths" type="number" min={0} max={36} defaultValue={3} className={FIELD_NUM} />
              </Field>
              <Field label="Most we will spend a month" hint="Leave empty and none is claimed.">
                <input name="adCapMonthly" type="number" min={0} placeholder="No limit" className={FIELD_NUM} />
              </Field>
            </div>
            <Field
              label="Started on"
              hint="Leave empty and the clock starts by itself, on the day the first post for them goes out."
            >
              <input name="freeStartsOn" type="date" className={FIELD} />
            </Field>
            <Button type="submit" variant="primary" className="mt-1 w-full">Add client</Button>
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
