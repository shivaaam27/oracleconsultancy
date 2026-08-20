"use client";

// The live book — every role Oracle is working on.
//
// The fee is DERIVED on every row from the agreed salary (lib/recruitment-money)
// and is never stored. An order with no salary agreed yet shows "not agreed"
// rather than a fee of zero, because zero reads as a fact.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive, Briefcase } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList, type RecordFilter } from "./record-list";
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useCreateParam } from "@/lib/use-create-param";
import { useListSort, by, type Sorter } from "@/lib/use-list-sort";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { JOB_ORDER_FORM } from "@/lib/recruitment-fields";
import { RecruitmentForm, dateValue, type FormValues } from "./recruitment-form";
import { JOB_STAGES, orderFee, isOpenOrder } from "@/lib/recruitment-shared";
import { tzs } from "@/lib/recruitment-money";
import { createJobOrderAction, archiveJobOrderAction } from "@/app/recruitment/actions";
import type { JobOrderFields } from "@/lib/recruitment";

const COLUMNS = ENTITY_VIEWS.rec_job_order!.listColumns;

export type OrderRow = {
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
  targetStartOn: string | null;
  archived: boolean;
};

/* What each column sorts by. The keys MUST match the column keys in
   ENTITY_VIEWS.rec_job_order — a mismatch is a header that looks clickable and
   does nothing. */
const SORTERS: Record<string, Sorter<OrderRow>> = {
  title: { cmp: (a, b) => by.text(a.title).localeCompare(by.text(b.title)) },
  stage: {
    cmp: (a, b) =>
      (JOB_STAGES as readonly string[]).indexOf(a.stage) -
      (JOB_STAGES as readonly string[]).indexOf(b.stage),
  },
  feeTZS: {
    cmp: (a, b) => by.num(a.monthlyGrossUsd) - by.num(b.monthlyGrossUsd),
    isEmpty: (r) => !r.monthlyGrossUsd,
  },
  targetStartOn: {
    cmp: (a, b) => by.date(a.targetStartOn) - by.date(b.targetStartOn),
    isEmpty: (r) => !r.targetStartOn,
  },
};

const STAGE_DOT: Record<string, string> = {
  "Sourcing": "bg-fg-subtle",
  "Shortlist with client": "bg-accent",
  "Client interviewing": "bg-accent",
  "Offer accepted": "bg-warn",
  "Permit stage": "bg-warn",
  "Placed": "bg-success",
};

export function RecruitmentOrdersList({
  items, companyId, clients, savedViews = [],
}: {
  items: OrderRow[];
  companyId: number;
  clients: { id: number; name: string }[];
  savedViews?: SavedView[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  useCreateParam("1", () => setAdding(true));

  const { values: f, set, dirty, query } = useUrlFilters(
    { stage: "open", client: "all", archived: "no", q: "" },
    { debounceKeys: ["q"] },
  );
  const { sortHrefs, sortedBy, apply } = useListSort(SORTERS);

  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return items.filter((o) => {
      /* Archived rows are out of the way but never out of reach — the rail has
         an entry for them. A record you can hide and never find again is a
         record you have lost. */
      if ((f.archived === "yes") !== o.archived) return false;
      if (f.stage === "open" && !isOpenOrder(o.stage)) return false;
      if (f.stage !== "open" && f.stage !== "all" && o.stage !== f.stage) return false;
      if (f.client === "internal" && o.clientId != null) return false;
      if (f.client !== "all" && f.client !== "internal" && String(o.clientId) !== f.client) return false;
      if (needle) {
        const hay = [o.ref, o.title, o.clientName, o.sector].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, f]);

  const rail: RecordFilter[] = useMemo(() => {
    const href = (patch: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...f, ...patch })) if (v && v !== "all" && v !== "") sp.set(k, v);
      const qs = sp.toString();
      return qs ? `/recruitment/orders?${qs}` : "/recruitment/orders";
    };
    return [
      { key: "open", label: "Open roles", group: "Stage", count: items.filter((o) => isOpenOrder(o.stage)).length, href: href({ stage: "open" }), active: f.stage === "open" },
      { key: "all", label: "Everything", group: "Stage", count: items.length, href: href({ stage: "all" }), active: f.stage === "all" },
      ...JOB_STAGES.map((s) => ({
        key: s, label: s, group: "Stage",
        count: items.filter((o) => o.stage === s).length,
        href: href({ stage: s }), active: f.stage === s,
      })),
      {
        key: "internal", label: "Oracle's own hiring", group: "Who for",
        count: items.filter((o) => !o.archived && o.clientId == null).length,
        href: href({ client: "internal" }), active: f.client === "internal",
      },
      {
        key: "archived", label: "Archived", group: "Who for",
        count: items.filter((o) => o.archived).length,
        href: href({ archived: "yes", stage: "all" }), active: f.archived === "yes",
      },
    ];
  }, [items, f]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search roles, references, clients…"
          className="h-8 min-w-[200px] flex-1 rounded-md border border-border bg-bg-elev px-2.5 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
        >
          <Plus size={14} /> New job order
        </button>
      </div>

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/recruitment/orders"
        listKey="rec_job_order"
      />

      {adding && (
        <RecruitmentForm
          groups={JOB_ORDER_FORM}
          initial={{ stage: "Sourcing", openedOn: new Date().toISOString().slice(0, 10) }}
          submitLabel="Save job order"
          onCancel={() => setAdding(false)}
          dynamicOptions={{ clientId: clients.map((c) => ({ value: String(c.id), label: c.name })) }}
          onSubmit={async (v) => {
            const res = await createJobOrderAction(toOrderFields(v, companyId));
            if (res.ok) { setAdding(false); router.refresh(); }
            return res;
          }}
          footNote="The reference (JO-2608-01) is allocated for you when it saves."
        />
      )}

      <RecordList
        rows={apply(shown)}
        rowKey={(o) => o.id}
        rowHref={(o) => `/recruitment/orders/${encodeURIComponent(o.ref)}`}
        listKey="rec_job_order"
        filters={rail}
        total={items.length}
        shown={shown.length}
        bulkActions={[{
          label: "Archive", tone: "danger", icon: <Archive size={12} />,
          run: async (picked) => { for (const o of picked) await archiveJobOrderAction(o.id); router.refresh(); },
        }]}
        empty={
          <div className="py-6 text-center">
            <Briefcase size={20} className="mx-auto mb-2 text-fg-subtle" />
            <p className="text-[13px] font-medium">No job orders yet</p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              Raise one when a brief is agreed. Leave the client blank for Oracle&rsquo;s own hiring.
            </p>
          </div>
        }
        columns={buildColumns<OrderRow & Record<string, unknown>>(COLUMNS, {
          sortHrefs,
          sortedBy,
          overrides: {
            title: (o) => (
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{o.title}</span>
                <span className="block truncate text-[11px] text-fg-muted">
                  <span className="font-mono">{o.ref}</span>
                  {" · "}
                  {o.clientName ?? "Oracle's own hiring"}
                </span>
              </span>
            ),
            stage: (o) => (
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STAGE_DOT[o.stage] ?? "bg-fg-subtle")} />
                <span className="truncate text-[12px]">{o.stage}</span>
              </span>
            ),
            /* Derived, every time. An internal vacancy carries no fee at all —
               Oracle does not invoice itself. */
            feeTZS: (o) => {
              if (o.clientId == null) {
                return <span className="text-[11px] text-fg-subtle" title="Oracle's own hiring — no fee">—</span>;
              }
              const fee = orderFee(o.monthlyGrossUsd);
              if (!fee) {
                return <span className="text-[11px] text-fg-subtle" title="No salary agreed yet">not agreed</span>;
              }
              return (
                <span className="tabular text-[12px]" title={`VAT ${tzs(fee.vatTZS)} · invoice ${tzs(fee.totalTZS)}`}>
                  {tzs(fee.netTZS)}
                </span>
              );
            },
          },
        })}
      />
    </div>
  );
}

export function toOrderPatch(v: FormValues): Omit<JobOrderFields, "companyId"> {
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  const client = s("clientId");
  return {
    clientId: client ? Number(client) : null,
    title: s("title") ?? "",
    sector: s("sector"),
    seniority: s("seniority"),
    monthlyGrossUsd: s("monthlyGrossUsd"),
    stage: s("stage"),
    openedOn: s("openedOn"),
    signedOn: s("signedOn"),
    targetStartOn: s("targetStartOn"),
    permitExpiry: s("permitExpiry"),
    notes: s("notes"),
  };
}

/** The same values plus the company — what a CREATE needs. */
export function toOrderFields(v: FormValues, companyId: number): JobOrderFields {
  return { companyId, ...toOrderPatch(v) };
}

export function orderFormValues(o: {
  title: string; clientId: number | null; sector: string | null; seniority: string | null;
  monthlyGrossUsd: string | null; stage: string; openedOn: string | null;
  signedOn: string | null; targetStartOn: string | null; permitExpiry: string | null;
  notes: string | null;
}): FormValues {
  return {
    title: o.title,
    clientId: o.clientId == null ? "" : String(o.clientId),
    sector: o.sector ?? "",
    seniority: o.seniority ?? "",
    monthlyGrossUsd: o.monthlyGrossUsd ?? "",
    stage: o.stage,
    openedOn: dateValue(o.openedOn),
    signedOn: dateValue(o.signedOn),
    targetStartOn: dateValue(o.targetStartOn),
    permitExpiry: dateValue(o.permitExpiry),
    notes: o.notes ?? "",
  };
}
