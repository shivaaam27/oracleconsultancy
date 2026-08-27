"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Loader2, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { FIELD, SearchInput } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import type { CzCustomer } from "@/lib/cocozuri-shared";
import {
  archiveCustomerAction, createCustomerAction, deleteCustomerAction,
  setBranchesAction, updateCustomerAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * The customer list — who is invoiced, and on what terms.
 *
 * ⚠️ THE VAT RATE IS A FIELD ON THE CUSTOMER, and that is the whole point of
 * putting it here. The spreadsheets use 7% for most and 0% for the CZ/AP series,
 * and nobody has confirmed 7 is right at all when the Tanzanian standard rate is
 * 18. Leaving it blank falls back to the company default. Whatever the answer
 * turns out to be, it is typed on this screen — not shipped in a build.
 * ------------------------------------------------------------------ */

type Row = CzCustomer & { branchLabel: string; vatLabel: string; termsLabel: string };

export function CocozuriCustomers({
  customers,
  archivedCount,
  showArchived,
  defaultVat,
  openNew,
}: {
  customers: CzCustomer[];
  archivedCount: number;
  showArchived: boolean;
  defaultVat: number;
  openNew?: boolean;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CzCustomer | "new" | null>(openNew ? "new" : null);

  /**
   * ⚠️ `?new=1` OPENS THE FORM, AND THEN LEAVES THE ADDRESS.
   *
   * `ENTITY_VIEWS.cz_customer.create.href` points here with the flag and the
   * page used to ignore it, so the global New menu landed on the list with
   * nothing open. It also has to be consumed: `revalidatePath("/cocozuri/customers")`
   * does not invalidate the cached entry for `/cocozuri/customers?new=1` —
   * different keys — so a save on the deep link would not move the list.
   */
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/customers");
  }, [openNew]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers
      .filter((c) =>
        !term ||
        c.name.toLowerCase().includes(term) ||
        (c.shortName ?? "").toLowerCase().includes(term) ||
        (c.tin ?? "").toLowerCase().includes(term)
      )
      .map((c) => ({
        ...c,
        branchLabel: c.branches.length ? c.branches.map((b) => b.name).join(", ") : "—",
        // Shows where the rate came from, because "7%" and "7% because nobody set
        // one" are different facts.
        vatLabel: c.vatRate == null ? `${defaultVat}% (default)` : `${c.vatRate}%`,
        termsLabel: `${c.paymentTermsDays} days`,
      }));
  }, [customers, q, defaultVat]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All customers", count: customers.length, href: "/cocozuri/customers", active: !showArchived },
    { key: "archived", label: "Archived", count: archivedCount, href: "/cocozuri/customers?archived=1", active: showArchived, group: "Archive" },
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_customer!.listColumns, {
    overrides: {
      name: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
          <span className="truncate text-base font-medium text-fg">{r.name}</span>
          {r.shortName && r.shortName !== r.name && (
            <span className="truncate text-xs text-fg-subtle">also written “{r.shortName}”</span>
          )}
        </span>
      ),
    },
  });

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => setEditing(r)}
        listKey="cz_customer"
        filters={rail}
        total={customers.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customers…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New customer
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">No customers yet.</p>
          </div>
        }
      />

      {editing && (
        <CustomerSheet
          customer={editing === "new" ? null : editing}
          defaultVat={defaultVat}
          onClose={() => setEditing(null)}
          onSaved={(m) => { toast(m, { tone: "success" }); setEditing(null); }}
        />
      )}
    </>
  );
}

function CustomerSheet({
  customer, defaultVat, onClose, onSaved,
}: {
  customer: CzCustomer | null;
  defaultVat: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: customer?.name ?? "",
    shortName: customer?.shortName ?? "",
    tin: customer?.tin ?? "",
    vatNo: customer?.vatNo ?? "",
    poBox: customer?.poBox ?? "",
    city: customer?.city ?? "",
    currency: customer?.currency ?? "TZS",
    paymentTermsDays: String(customer?.paymentTermsDays ?? 30),
    vatRate: customer?.vatRate == null ? "" : String(customer.vatRate),
    invoiceSeries: customer?.invoiceSeries ?? "",
    notes: customer?.notes ?? "",
  });
  const [branches, setBranches] = useState((customer?.branches ?? []).map((b) => b.name).join(", "));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) { toast("A customer needs a name.", { tone: "danger" }); return; }
    setBusy(true);
    const input = {
      name: f.name,
      shortName: f.shortName || null,
      tin: f.tin || null,
      vatNo: f.vatNo || null,
      poBox: f.poBox || null,
      city: f.city || null,
      currency: f.currency || "TZS",
      paymentTermsDays: Number(f.paymentTermsDays) || 30,
      // Blank means "use the company default" — a real state, not a missing one.
      vatRate: f.vatRate.trim() === "" ? null : Number(f.vatRate),
      invoiceSeries: f.invoiceSeries || null,
      notes: f.notes || null,
    };
    const res = customer
      ? await updateCustomerAction(customer.id, input)
      : await createCustomerAction(input);
    if (!res.ok) { setBusy(false); toast(res.error ?? "Could not save that.", { tone: "danger" }); return; }

    const id = customer?.id ?? (res as { id?: number }).id;
    if (id) await setBranchesAction(id, branches.split(",").map((b) => b.trim()).filter(Boolean));
    setBusy(false);
    onSaved(customer ? "Saved." : "Added.");
  }

  return (
    <BottomSheet open onClose={onClose} title={customer ? customer.name : "New customer"}>
      <div className="flex flex-col gap-3 px-1 pb-2">
        <Field label="Name"><input value={f.name} onChange={set("name")} className={INPUT} autoFocus /></Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Also written" hint="What the price list calls them.">
            <input value={f.shortName} onChange={set("shortName")} className={INPUT} placeholder="AIRPORT" />
          </Field>
          <Field label="Branches" hint="Separated by commas.">
            <input value={branches} onChange={(e) => setBranches(e.target.value)} className={INPUT} placeholder="MIKOCHENI, MASAKI" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="TIN"><input value={f.tin} onChange={set("tin")} className={INPUT} /></Field>
          <Field label="VAT number"><input value={f.vatNo} onChange={set("vatNo")} className={INPUT} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="P.O. Box"><input value={f.poBox} onChange={set("poBox")} className={INPUT} /></Field>
          <Field label="City"><input value={f.city} onChange={set("city")} className={INPUT} placeholder="Dar es Salaam" /></Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Currency"><input value={f.currency} onChange={set("currency")} className={INPUT} /></Field>
          <Field label="Terms (days)"><input value={f.paymentTermsDays} onChange={set("paymentTermsDays")} inputMode="numeric" className={INPUT} /></Field>
          <Field label="Invoice series" hint="CZ- or CZ/AP/">
            <input value={f.invoiceSeries} onChange={set("invoiceSeries")} className={INPUT} placeholder="CZ-" />
          </Field>
        </div>

        <Field
          label="VAT rate (%)"
          hint={`Leave blank to use the company default of ${defaultVat}%. The spreadsheets use 7% for most customers and 0% for the CZ/AP series — nobody has confirmed which is right, so it lives here where it can be changed.`}
        >
          <input value={f.vatRate} onChange={set("vatRate")} inputMode="decimal" className={INPUT} placeholder={`${defaultVat}`} />
        </Field>

        <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} className={cn(INPUT, "resize-y")} /></Field>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />} {customer ? "Save" : "Add"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
          {customer && (
            <>
              <span className="grow" />
              <button
                type="button"
                onClick={() => start(async () => {
                  await archiveCustomerAction(customer.id, !customer.archived);
                  onSaved(customer.archived ? "Back on the list." : "Archived — nothing was deleted.");
                })}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg"
              >
                {customer.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                {customer.archived ? "Restore" : "Archive"}
              </button>
              {/* ⚠️ A REAL DELETE. Refused while an invoice, a payment or a
                  counter sale points at them — a document somebody was sent
                  cannot lose the customer it names. Their agreed prices and
                  branches belong to them and go with them. */}
              <button
                type="button"
                onClick={() => start(async () => {
                  if (!confirm(`Delete ${customer.name}? It will be refused if any invoice, payment or counter sale names them.`)) return;
                  const res = await deleteCustomerAction(customer.id);
                  if (!res.ok) { toast(res.error ?? "Could not delete them.", { tone: "danger" }); return; }
                  onSaved(`${customer.name} deleted.`);
                })}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-danger hover:text-danger"
              >
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

/* ⚠️ THE KIT'S FIELD, not a local one. Seven files had grown their own
   `const INPUT` and no two agreed — see the note on `FIELD` in ui.tsx. */
const INPUT = FIELD;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-fg-subtle">{hint}</span>}
    </label>
  );
}
