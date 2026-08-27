"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, Loader2, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { FIELD, SearchInput } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { useToast } from "@/components/toast";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { czDate, money } from "@/lib/cocozuri-shared";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";
import type { CzSupplier, CzSupplierMaterial } from "@/lib/cocozuri-suppliers";
import { deleteSupplierAction, saveSupplierAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Who we buy from.
 *
 * ⚠️ IT IS THE SHARED VENDOR REGISTER, NOT A SECOND LIST. The register already
 * existed — it just lived in another module, so from inside CocoZuri it was
 * invisible and purchases carried typed names instead. Two lists would drift
 * within a month.
 * ------------------------------------------------------------------ */

type Row = CzSupplier & {
  spentLabel: string;
  owedLabel: string;
  lastLabel: string;
  materialsLabel: string;
};

export function CocozuriSuppliers({
  suppliers, unnamed,
}: {
  suppliers: CzSupplier[];
  /** Approved purchases carrying a typed name and no supplier record. */
  unnamed: { name: string; purchases: number }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"used" | "all">("used");
  const [editing, setEditing] = useState<CzSupplier | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return suppliers
      // ⚠️ The register is shared with all thirteen companies, so most of it has
      // nothing to do with chocolate. "Everyone" is one click away.
      .filter((s) => (view === "used" ? s.purchases > 0 : true))
      .filter((s) => !term
        || s.name.toLowerCase().includes(term)
        || (s.contactName ?? "").toLowerCase().includes(term))
      .map((s) => ({
        ...s,
        spentLabel: s.spent > 0 ? money(s.spent) : "—",
        owedLabel: s.owed > 0 ? money(s.owed) : "—",
        lastLabel: s.lastBoughtOn ? czDate(s.lastBoughtOn) : "—",
        materialsLabel: s.materials > 0 ? String(s.materials) : "—",
      }));
  }, [suppliers, q, view]);

  const rail: RecordFilter[] = [
    {
      key: "used", label: "We buy from", count: suppliers.filter((s) => s.purchases > 0).length,
      href: "#", active: view === "used", onSelect: () => setView("used"),
    },
    {
      key: "all", label: "Everyone on the register", count: suppliers.length,
      href: "#", active: view === "all", onSelect: () => setView("all"), group: "Register",
    },
  ];

  return (
    <>
      {/* ⚠️ THE FACT THAT MATTERS MOST ON THIS SCREEN. A supplier is optional on a
          purchase, on purpose — raw materials are bought at random and a form
          demanding one would not get filled in. But a typed name buys nothing
          you can look back at, so it is worth saying how much is like that. */}
      {unnamed.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5">
          <p className="text-sm text-fg-muted">
            <strong className="text-fg">{unnamed.length}</strong> supplier
            {unnamed.length === 1 ? " was" : "s were"} typed straight onto a purchase without a
            record. That is allowed — materials are often bought at random — but a typed name has
            no history behind it.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unnamed.slice(0, 12).map((u) => (
              <span key={u.name} className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs text-fg-muted">
                {u.name} <span className="text-fg-subtle">×{u.purchases}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <RecordList
        rows={rows}
        columns={[
          { key: "name", label: "Supplier", width: "minmax(0,1fr)", render: (r) => (
            <span className="min-w-0 truncate text-sm text-fg" title={r.name}>
              {r.name}
              {r.contactName && <span className="ml-1.5 text-xs text-fg-subtle">{r.contactName}</span>}
              {!r.active && <span className="ml-1.5 text-xs text-fg-subtle">not in use</span>}
            </span>
          ) },
          { key: "materialsLabel", label: "Materials", width: "85px", align: "right", hideBelow: "md", render: (r) => (
            <span className="text-sm tabular text-fg-subtle">{r.materialsLabel}</span>
          ) },
          { key: "lastLabel", label: "Last bought", width: "95px", hideBelow: "md", render: (r) => (
            <span className="text-sm text-fg-muted">{r.lastLabel}</span>
          ) },
          { key: "spentLabel", label: "Spent", width: "110px", align: "right", render: (r) => (
            <span className="text-sm tabular text-fg">{r.spentLabel}</span>
          ) },
          { key: "owedLabel", label: "Still owed", width: "105px", align: "right", render: (r) => (
            <span className={`text-sm tabular ${r.owed > 0 ? "text-warn" : "text-fg-subtle"}`}>
              {r.owedLabel}
            </span>
          ) },
          { key: "go", label: "", width: "148px", align: "right", render: (r) => (
            <span className="flex items-center justify-end gap-1">
              {r.purchases > 0 && (
                <Link href={`/cocozuri/suppliers/${r.id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-accent hover:underline">
                  Open <ArrowRight size={12} />
                </Link>
              )}
              <button type="button" disabled={busy} onClick={() => setEditing(r)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                <Pencil size={12} /> Edit
              </button>
              {/* ⚠️ Refused while a purchase names them, and it says how many. */}
              <button type="button" disabled={busy} title="Take them off the register"
                onClick={async () => {
                  if (!confirm(`Delete ${r.name}? It will be refused if any purchase names them.`)) return;
                  setBusy(true);
                  const res = await deleteSupplierAction(r.id);
                  setBusy(false);
                  if (!res.ok) { toast(res.error ?? "Could not delete them.", { tone: "danger" }); return; }
                  toast(`${r.name} deleted.`, { tone: "success" });
                  router.refresh();
                }}
                className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
                <Trash2 size={12} />
              </button>
            </span>
          ) },
        ]}
        rowKey={(r) => r.id}
        listKey="cz_suppliers"
        filters={rail}
        total={suppliers.length}
        shown={rows.length}
        exportName="cocozuri-suppliers"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Supplier or contact…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <CocozuriHelp title="Suppliers">
              <p>
                This is the same supplier register the rest of COS uses — it is not a second list.
                Adding one here puts them on that shared register, so they are available to every
                company — not a CocoZuri-only list that would drift out of step within a month.
              </p>
              <p>
                <strong>Spent</strong> and <strong>Still owed</strong> count only
                <strong> approved</strong> purchases. A draft moves no stock and posts nothing, so
                counting it would inflate every supplier by whatever is half-typed.
              </p>
              <p>
                <strong>Still owed</strong> is only for purchases bought on credit. One paid from
                the bank or the cash box was settled the day it was bought, and one bought with
                somebody&apos;s own money is owed to <em>that person</em>, not to the supplier.
              </p>
              <p>
                A purchase does not need a supplier record. Materials are often bought at random,
                and a form insisting on one simply would not get filled in.
              </p>
            </CocozuriHelp>
            <button type="button" onClick={() => setEditing("new")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> New supplier
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Building2 size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">
              {view === "used" ? "No purchase names a supplier yet." : "Nobody is on the register."}
            </p>
            <p className="max-w-[34rem] text-sm text-fg-subtle">
              A purchase can carry a typed name instead, and often does. Naming a real supplier is
              what gives you a history — what you buy from them, what you last paid, and what is
              still owed.
            </p>
          </div>
        }
      />

      {editing && (
        <SupplierSheet
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Adding or editing one
 *
 * ⚠️ IT WRITES TO THE SHARED VENDOR REGISTER — the same list Assets & Vendors
 * manages. One list, two doors. The second door exists because the register was
 * found EMPTY across the whole system while every CocoZuri purchase carried a
 * typed name, which is exactly what sending somebody to another module costs.
 * ------------------------------------------------------------------ */

function SupplierSheet({
  supplier, onClose,
}: {
  supplier: CzSupplier | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(supplier?.name ?? "");
  /* ⚠️ An untouched form is not a wrong one. Telling somebody a name is missing
     before they have typed a character is nagging, and the Add button already
     says the same thing by being disabled. */
  const [touched, setTouched] = useState(false);
  const [contactName, setContactName] = useState(supplier?.contactName ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");

  async function save() {
    setBusy(true);
    const res = await saveSupplierAction(supplier?.id ?? null, { name, contactName, email, phone });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not save.", { tone: "danger" }); return; }
    toast(supplier ? `${name.trim()} saved.` : `${name.trim()} added to the register.`, { tone: "success" });
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open onClose={onClose}
      title={supplier ? `Edit ${supplier.name}` : "New supplier"} maxWidth="max-w-xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          This goes on the <strong className="text-fg">shared supplier register</strong> the rest of
          COS uses, not a CocoZuri-only list. A purchase does not have to name a supplier, but a
          typed name has no history behind it.
        </p>

        <div className="grid items-end gap-3 sm:grid-cols-2">
          <SField label="Name">
            <input value={name} onChange={(e) => { setName(e.target.value); setTouched(true); }}
              onBlur={() => setTouched(true)} className={FIELD}
              placeholder="Who they are" autoFocus />
          </SField>
          <SField label="Who to speak to">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={FIELD}
              placeholder="Optional" />
          </SField>
        </div>

        <div className="grid items-end gap-3 sm:grid-cols-2">
          <SField label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD}
              placeholder="Optional" />
          </SField>
          <SField label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD}
              placeholder="Optional" />
          </SField>
        </div>

        {touched && !name.trim() && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> A supplier needs a name.
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || !name.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Building2 size={13} />}
            {supplier ? "Save" : "Add them"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function SField({ label, children }: { label: string; children: React.ReactNode }) {
  /* ⚠️ `justify-end` — a grid cell stretches to the tallest row, so a label that
     wraps would push its own control down while a one-line label left its
     control at the top. */
  return (
    <label className="flex h-full flex-col justify-end gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * What one supplier sells us
 * ------------------------------------------------------------------ */

export function CocozuriSupplierMaterials({ materials }: { materials: CzSupplierMaterial[] }) {
  if (materials.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center text-sm text-fg-subtle">
        No approved purchase from them lists a material yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
      <div className="min-w-[40rem]">
        <div className="grid grid-cols-[minmax(0,1fr)_85px_95px_110px_110px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
          <span>Material</span>
          <span className="text-right">Times</span>
          <span>Last bought</span>
          <span className="text-right">First paid</span>
          <span className="text-right">Last paid</span>
          <span className="text-right">Moved</span>
        </div>
        {materials.map((m) => {
          /* ⚠️ THE MOVEMENT IS THE POINT OF THIS TABLE. The chef's workbook priced
             228 ingredients at 50 different rates — butter at 28 a gram in 82
             lines and 82.34 in one. Nothing stops that being typed; this is what
             finds it afterwards. */
          const moved = m.firstUnitCost != null && m.lastUnitCost != null && m.firstUnitCost !== 0
            ? ((m.lastUnitCost - m.firstUnitCost) / m.firstUnitCost) * 100
            : null;
          return (
            <div key={m.itemId} className="grid grid-cols-[minmax(0,1fr)_85px_95px_110px_110px_110px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
              <span className="min-w-0 truncate text-sm text-fg" title={m.itemName}>
                {m.itemName}
                <span className="ml-1.5 text-xs text-fg-subtle">{qtyText(m.qty)} in all</span>
              </span>
              <span className="text-right text-sm tabular text-fg-subtle">{m.timesBought}</span>
              <span className="text-sm text-fg-muted">{m.lastOn ? czDate(m.lastOn) : "—"}</span>
              <span className="text-right text-sm tabular text-fg-subtle">
                {m.firstUnitCost == null ? "—" : money(m.firstUnitCost)}
              </span>
              <span className="text-right text-sm tabular text-fg">
                {m.lastUnitCost == null ? "—" : money(m.lastUnitCost)}
              </span>
              <span className={`flex items-center justify-end gap-1 text-right text-sm tabular ${
                moved == null ? "text-fg-subtle" : moved > 0.5 ? "text-warn" : moved < -0.5 ? "text-success" : "text-fg-subtle"}`}>
                {moved == null ? "—" : (
                  <>
                    {moved > 0.5 && <TrendingUp size={12} />}
                    {moved < -0.5 && <TrendingDown size={12} />}
                    {moved > 0 ? "+" : ""}{moved.toFixed(0)}%
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
