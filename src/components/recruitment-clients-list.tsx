"use client";

// The recruitment clients list — the employers Oracle sources for.
//
// Columns come from ENTITY_VIEWS.rec_client, filters go through `useUrlFilters`
// so a saved view has something to save, and the "New client" panel is the same
// form the record uses (lib/recruitment-fields.ts).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive, Building2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList, type RecordFilter } from "./record-list";
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useCreateParam } from "@/lib/use-create-param";
import { useListSort, by, type Sorter } from "@/lib/use-list-sort";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { CLIENT_FORM } from "@/lib/recruitment-fields";
import { RecruitmentForm, dateValue, type FormValues } from "./recruitment-form";
import { clientPapersMissing } from "@/lib/recruitment-shared";
import { createClientAction, archiveClientAction } from "@/app/recruitment/actions";
import type { ClientFields } from "@/lib/recruitment";

const COLUMNS = ENTITY_VIEWS.rec_client!.listColumns;

export type ClientRow = {
  id: number;
  name: string;
  sector: string | null;
  city: string | null;
  contactName: string | null;
  termsSignedOn: string | null;
  dsaSignedOn: string | null;
  openOrders: number;
  archived: boolean;
};

/* Keys MUST match the column keys in ENTITY_VIEWS.rec_client. */
const SORTERS: Record<string, Sorter<ClientRow>> = {
  name: { cmp: (a, b) => by.text(a.name).localeCompare(by.text(b.name)) },
  contactName: { cmp: (a, b) => by.text(a.contactName).localeCompare(by.text(b.contactName)), isEmpty: (r) => !r.contactName },
  // Most outstanding first — the ones that block work.
  papers: { cmp: (a, b) => clientPapersMissing(b).length - clientPapersMissing(a).length },
  openOrders: { cmp: (a, b) => a.openOrders - b.openOrders },
};

export function RecruitmentClientsList({
  items, companyId, savedViews = [],
}: {
  items: ClientRow[];
  companyId: number;
  savedViews?: SavedView[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  useCreateParam("1", () => setAdding(true));

  const { values: f, set, dirty, query } = useUrlFilters(
    { papers: "all", archived: "no", q: "" },
    { debounceKeys: ["q"] },
  );
  const { sortHrefs, sortedBy, apply } = useListSort(SORTERS);

  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return items.filter((c) => {
      if ((f.archived === "yes") !== c.archived) return false;
      const missing = clientPapersMissing(c);
      if (f.papers === "missing" && missing.length === 0) return false;
      if (f.papers === "signed" && missing.length > 0) return false;
      if (needle) {
        const hay = [c.name, c.sector, c.city, c.contactName].filter(Boolean).join(" ").toLowerCase();
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
      return qs ? `/recruitment/clients?${qs}` : "/recruitment/clients";
    };
    const missing = items.filter((c) => clientPapersMissing(c).length > 0).length;
    return [
      { key: "all", label: "All clients", group: "Papers", count: items.length, href: href({ papers: "all" }), active: f.papers === "all" },
      { key: "missing", label: "Papers outstanding", group: "Papers", count: missing, href: href({ papers: "missing" }), active: f.papers === "missing", tone: "warn" as const },
      { key: "signed", label: "Fully signed", group: "Papers", count: items.length - missing, href: href({ papers: "signed" }), active: f.papers === "signed" },
      { key: "archived", label: "Archived", group: "Papers",
        count: items.filter((c) => c.archived).length,
        href: href({ archived: "yes", papers: "all" }), active: f.archived === "yes" },
    ];
  }, [items, f]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search clients, sectors, contacts…"
          className="h-8 min-w-[200px] flex-1 rounded-md border border-border bg-bg-elev px-2.5 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
        >
          <Plus size={14} /> New client
        </button>
      </div>

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/recruitment/clients"
        listKey="rec_client"
      />

      {adding && (
        <RecruitmentForm
          groups={CLIENT_FORM}
          initial={{}}
          submitLabel="Save client"
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            const res = await createClientAction(toClientFields(v, companyId));
            if (res.ok) { setAdding(false); router.refresh(); }
            return res;
          }}
          footNote="Only the name is needed now — the rest can be filled in later."
        />
      )}

      <RecordList
        rows={apply(shown)}
        rowKey={(c) => c.id}
        rowHref={(c) => `/recruitment/clients/${c.id}`}
        listKey="rec_client"
        filters={rail}
        total={items.length}
        shown={shown.length}
        bulkActions={[{
          label: "Archive", tone: "danger", icon: <Archive size={12} />,
          run: async (picked) => { for (const c of picked) await archiveClientAction(c.id); router.refresh(); },
        }]}
        empty={
          <div className="py-6 text-center">
            <Building2 size={20} className="mx-auto mb-2 text-fg-subtle" />
            <p className="text-base font-medium">No clients yet</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Add the employer you are sourcing for. Nothing is filled in for you.
            </p>
          </div>
        }
        columns={buildColumns<ClientRow & Record<string, unknown>>(COLUMNS, {
          sortHrefs,
          sortedBy,
          overrides: {
            name: (c) => (
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{c.name}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {[c.sector, c.city].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            ),
            /* The papers are the gate on starting work, so they are a column
               rather than something you find by opening the record. */
            papers: (c) => {
              const missing = clientPapersMissing(c);
              if (missing.length === 0) {
                return <span className="text-xs text-success">Signed</span>;
              }
              return (
                <span
                  className={cn("inline-flex items-center gap-1 rounded-sm bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn")}
                  title={`Not signed: ${missing.join(", ")}`}
                >
                  <AlertTriangle size={10} />
                  {missing.length === 2 ? "Neither signed" : "1 outstanding"}
                </span>
              );
            },
            openOrders: (c) => (
              <span className="tabular text-sm">{c.openOrders || "—"}</span>
            ),
          },
        })}
      />
    </div>
  );
}

/**
 * The form's values → what the write core expects.
 *
 * ⚠️ `import type` only for `ClientFields` — `lib/recruitment.ts` imports the
 * service-role Supabase client, and a VALUE import of it from a client component
 * would put the service key in the browser bundle. Types are erased; values are
 * not (CLAUDE.md).
 */
export function toClientPatch(v: FormValues): Omit<ClientFields, "companyId"> {
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  return {
    name: s("name") ?? "",
    sector: s("sector"),
    city: s("city"),
    contactName: s("contactName"),
    contactEmail: s("contactEmail"),
    contactPhone: s("contactPhone"),
    localEmployees: s("localEmployees"),
    foreignEmployees: s("foreignEmployees"),
    termsSignedOn: s("termsSignedOn"),
    dsaSignedOn: s("dsaSignedOn"),
    notes: s("notes"),
  };
}

/** The same values plus the company — what a CREATE needs. */
export function toClientFields(v: FormValues, companyId: number): ClientFields {
  return { companyId, ...toClientPatch(v) };
}

/** Shared with the record page, so both read the same way. */
export function clientFormValues(c: {
  name: string; sector: string | null; city: string | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  localEmployees: number | null; foreignEmployees: number | null;
  termsSignedOn: string | null; dsaSignedOn: string | null; notes: string | null;
}): FormValues {
  return {
    name: c.name,
    sector: c.sector ?? "",
    city: c.city ?? "",
    contactName: c.contactName ?? "",
    contactEmail: c.contactEmail ?? "",
    contactPhone: c.contactPhone ?? "",
    localEmployees: c.localEmployees == null ? "" : String(c.localEmployees),
    foreignEmployees: c.foreignEmployees == null ? "" : String(c.foreignEmployees),
    termsSignedOn: dateValue(c.termsSignedOn),
    dsaSignedOn: dateValue(c.dsaSignedOn),
    notes: c.notes ?? "",
  };
}
