"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Loader2, Package, Plus } from "lucide-react";
import { RecordList } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { money } from "@/lib/cocozuri-shared";
import { typedNumberOr } from "@/lib/typed-number";
import {
  bookValue, depreciationTo, monthlyCharge, monthsRemaining, type FixedAsset,
} from "@/lib/ledger-assets-shared";
import {
  createAssetAction, disposeAssetAction, postDepreciationAction, unpostDepreciationAction,
} from "@/app/ledger/assets-actions";

/* ------------------------------------------------------------------ *
 * The fixed asset register — Stage 8, notes page 1 ("Assets · Depreciation").
 *
 * ⚠️ NOTHING DERIVED IS STORED. What an asset has written off so far, what it
 * stands at, and how much life is left are all worked out from the cost, the
 * residual and the months — which is why the register can never drift out of
 * step with the books the way a spreadsheet does.
 * ------------------------------------------------------------------ */

type Row = FixedAsset & {
  writtenOff: number;
  standsAt: number;
  perMonth: number;
  left: number;
  statusLabel: string;
};

export function LedgerAssets({
  companyId, assets, asOf, run, booksState, ready, reason, year, month,
}: {
  companyId: number;
  assets: FixedAsset[];
  asOf: string;
  run: { total: number; lines: { assetId: number; name: string; charge: number }[] };
  booksState: "unposted" | "posted" | "reversed";
  ready: boolean;
  reason: string | null;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return assets
      .map((a) => ({
        ...a,
        writtenOff: depreciationTo(a, asOf),
        standsAt: bookValue(a, asOf),
        perMonth: monthlyCharge(a),
        left: monthsRemaining(a, asOf),
        statusLabel: a.status === "disposed" ? "Gone" : "In use",
      }))
      .filter((a) => !term || a.name.toLowerCase().includes(term) || (a.category ?? "").toLowerCase().includes(term));
  }, [assets, q, asOf]);

  const cost = rows.filter((r) => r.status === "in_use").reduce((s, r) => s + r.cost, 0);
  const standsAt = rows.filter((r) => r.status === "in_use").reduce((s, r) => s + r.standsAt, 0);
  const period = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-elev px-3.5 py-3">
        <span className="text-sm text-fg-muted">
          {period}: <strong className="text-fg">{money(run.total)}</strong> of depreciation across{" "}
          {run.lines.length} asset{run.lines.length === 1 ? "" : "s"}.
        </span>
        <span className="grow" />
        {booksState === "posted" ? (
          <button type="button" disabled={busy}
            onClick={() => {
              const why = window.prompt(`Taking ${period}'s depreciation back out of the books. Why?`);
              if (why == null) return;
              void act("Taken back out — a reversal, not an erasure.",
                () => unpostDepreciationAction(companyId, year, month, why));
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
            <BookOpen size={13} /> Take out of the books
          </button>
        ) : (
          <button type="button" disabled={busy || !ready || run.total <= 0}
            title={!ready ? reason ?? undefined : run.total <= 0 ? "Nothing was being depreciated that month." : undefined}
            onClick={() => void act(`${period}'s depreciation is in the books.`,
              () => postDepreciationAction(companyId, year, month))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />} Charge it to the books
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="What it all cost" value={money(cost)} />
        <Tile label="Written off so far" value={money(cost - standsAt)} />
        <Tile label="What it stands at today" value={money(standsAt)} />
      </div>

      <RecordList
        rows={rows}
        columns={[
          { key: "name", label: "Asset", width: "minmax(0,1fr)", render: (r) => (
            <span className="min-w-0 truncate text-sm text-fg">
              {r.name}
              {r.category && <span className="ml-1.5 text-xs text-fg-subtle">{r.category}</span>}
              {r.status === "disposed" && <span className="ml-1.5 text-xs text-fg-subtle">gone {r.disposedOn}</span>}
            </span>
          ) },
          { key: "acquiredOn", label: "Bought", width: "100px", hideBelow: "md", render: (r) => (
            <span className="text-sm text-fg-muted">{r.acquiredOn}</span>
          ) },
          { key: "cost", label: "Cost", width: "110px", align: "right", render: (r) => (
            <span className="text-sm tabular text-fg-muted">{money(r.cost)}</span>
          ) },
          { key: "perMonth", label: "A month", width: "100px", align: "right", hideBelow: "lg", render: (r) => (
            <span className="text-sm tabular text-fg-subtle">{money(r.perMonth)}</span>
          ) },
          { key: "standsAt", label: "Stands at", width: "110px", align: "right", render: (r) => (
            <span className="text-sm tabular text-fg">{money(r.standsAt)}</span>
          ) },
          { key: "left", label: "Life left", width: "90px", align: "right", render: (r) => (
            <span className={`text-sm tabular ${r.left === 0 ? "text-fg-subtle" : "text-fg-muted"}`}>
              {r.status === "disposed" ? "—" : r.left === 0 ? "written off" : `${r.left}m`}
            </span>
          ) },
          { key: "act", label: "", width: "90px", align: "right", render: (r) => (
            r.status === "in_use" ? (
              <button type="button" disabled={busy}
                onClick={() => {
                  const on = window.prompt("When did it go? (yyyy-mm-dd)");
                  if (!on) return;
                  const p = window.prompt("What was it sold for? Leave blank if nothing.");
                  void act("Recorded as gone.", () => disposeAssetAction(r.id, on, p ? typedNumberOr(p) : null));
                }}
                className="h-7 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                Dispose
              </button>
            ) : <span className="text-xs text-fg-subtle">—</span>
          ) },
        ]}
        rowKey={(r) => r.id}
        listKey="fixed_asset"
        total={assets.length}
        shown={rows.length}
        exportName="fixed-assets"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or category…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <button type="button" onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Add an asset
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Package size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing in the register yet.</p>
            <p className="max-w-[32rem] text-sm text-fg-subtle">
              A tempering machine, a van, a fridge — anything that lasts more than a year and is
              written down over its life rather than charged the day it was bought.
            </p>
          </div>
        }
      />

      {adding && <AddSheet companyId={companyId} onClose={() => setAdding(false)}
        onAdded={() => { setAdding(false); router.refresh(); }} />}
    </>
  );
}

function AddSheet({ companyId, onClose, onAdded }: { companyId: number; onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [acquiredOn, setAcquiredOn] = useState("");
  const [cost, setCost] = useState("");
  const [residual, setResidual] = useState("");
  const [months, setMonths] = useState("60");

  const costN = typedNumberOr(cost);
  const residualN = typedNumberOr(residual);
  const monthsN = typedNumberOr(months);
  const perMonth = monthlyCharge({ cost: costN, residualValue: residualN, usefulLifeMonths: monthsN });

  const blockers: string[] = [];
  if (!name.trim()) blockers.push("It needs a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredOn)) blockers.push("Say when it was bought.");
  if (!(costN > 0)) blockers.push("Say what it cost.");
  if (!(monthsN > 0)) blockers.push("Say how many months it is expected to last.");
  if (residualN >= costN && costN > 0) blockers.push("What it will be worth at the end has to be less than what it cost.");

  async function save() {
    setBusy(true);
    const res = await createAssetAction(companyId, {
      name, category: category || null, acquiredOn, cost: costN,
      residualValue: residualN, usefulLifeMonths: Math.round(monthsN),
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not add it.", { tone: "danger" }); return; }
    toast(`${name} is in the register. It will be written down ${money(perMonth)} a month.`, { tone: "success" });
    onAdded();
  }

  return (
    <BottomSheet open onClose={onClose} title="Add an asset" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What is it"><input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="Tempering machine" /></Field>
          <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD} placeholder="Machinery, vehicles…" /></Field>
          <Field label="Bought on"><input type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} className={FIELD} /></Field>
          <Field label="What it cost"><input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="0" /></Field>
          <Field label="Worth at the end"><input value={residual} onChange={(e) => setResidual(e.target.value)} inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="0" /></Field>
          <Field label="Months it should last"><input value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className={`${FIELD} text-right tabular`} /></Field>
        </div>

        {perMonth > 0 && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            It will be written down <strong className="text-fg">{money(perMonth)}</strong> a month for{" "}
            {Math.round(monthsN)} months.
            {/* ⚠️ Said plainly: this is a DECISION, not a law. */}
            {" "}The month it was bought is charged in full — say the word if it should be worked out
            day by day instead.
          </p>
        )}

        {blockers.length > 0 && (name.trim() || cost) && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add it
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className="block truncate text-lg font-semibold leading-none tabular text-fg">{value}</span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}
