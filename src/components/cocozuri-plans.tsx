"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardList, Copy, Loader2, Plus, Trash2, X } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { czDate } from "@/lib/cocozuri-shared";
import { qty as qtyText, todayInDar, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import {
  CZ_PLAN_STATUS_LABEL, planBlockers, planIsDone, planProgress, type CzPlan,
} from "@/lib/cocozuri-plan-shared";
import { createPlanAction, deletePlanAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * What to make today.
 *
 * ⚠️ A PLAN MOVES NO STOCK AND CREATES NOTHING until somebody starts a batch
 * from a line. Raising one costs nothing, which is the point: as many a day as
 * the day needs — the morning one, and the special order that comes in at
 * eleven.
 * ------------------------------------------------------------------ */

export type PlanSuggestion = {
  itemId: number; itemName: string; uom: string; onHand: number;
  recipeId: number | null; recipeName: string | null; yieldQty: number | null;
  /** ⚠️ How many could be made RIGHT NOW from what is on the shelf. Null when
   *  the recipe names no materials, which is not the same as none. */
  couldMake: number | null;
  /** Which material runs out first, when there is not enough for one batch. */
  limitedBy: string | null;
};

type Row = CzPlan & {
  what: string;
  wantedLabel: string;
  madeLabel: string;
  progressLabel: string;
  statusLabel: string;
};

export function CocozuriPlans({
  plans, locations, suggestions, openNew,
}: {
  plans: CzPlan[];
  locations: CzStockLocation[];
  suggestions: PlanSuggestion[];
  openNew?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [raising, setRaising] = useState(!!openNew);
  const [copyOf, setCopyOf] = useState<CzPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"open" | "draft" | "issued" | "cancelled" | null>("open");

  // ⚠️ The flag is consumed, or Back re-opens the sheet.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/order");
  }, [openNew]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return plans
      .filter((p) => {
        if (status == null) return true;
        // ⚠️ "Open" is DERIVED — a plan is finished when every line has been
        // made, not when somebody remembers to mark it.
        if (status === "open") return p.status !== "cancelled" && !planIsDone(p.lines);
        return p.status === status;
      })
      .filter((p) => !term
        || p.reference.toLowerCase().includes(term)
        || (p.locationName ?? "").toLowerCase().includes(term)
        || p.lines.some((l) => l.itemName.toLowerCase().includes(term)))
      .map((p) => {
        const prog = planProgress(p.lines);
        const first = p.lines[0];
        const more = p.lines.length - 1;
        return {
          ...p,
          what: first ? `${first.itemName}${more > 0 ? ` and ${more} more` : ""}` : "nothing listed",
          wantedLabel: qtyText(prog.wanted),
          madeLabel: prog.made > 0 ? qtyText(prog.made) : "—",
          progressLabel: p.lines.length === 0
            ? "—"
            : planIsDone(p.lines)
              ? "All made"
              : `${prog.done}/${p.lines.length} made${prog.running > 0 ? ` · ${prog.running} running` : ""}`,
          statusLabel: CZ_PLAN_STATUS_LABEL[p.status],
        };
      });
  }, [plans, q, status]);

  const rail: RecordFilter[] = [
    { key: "open", label: "Still to make", count: plans.filter((p) => p.status !== "cancelled" && !planIsDone(p.lines)).length, href: "#", active: status === "open", onSelect: () => setStatus("open") },
    { key: "all", label: "All plans", count: plans.length, href: "#", active: status == null, onSelect: () => setStatus(null) },
    { key: "draft", label: "Draft", count: plans.filter((p) => p.status === "draft").length, href: "#", active: status === "draft", onSelect: () => setStatus("draft"), group: "Status" },
    { key: "issued", label: "Issued", count: plans.filter((p) => p.status === "issued").length, href: "#", active: status === "issued", onSelect: () => setStatus("issued"), group: "Status" },
    { key: "cancelled", label: "Cancelled", count: plans.filter((p) => p.status === "cancelled").length, href: "#", active: status === "cancelled", onSelect: () => setStatus("cancelled"), group: "Archive" },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={[
          { key: "reference", label: "Plan", width: "108px", render: (r) => (
            <Link href={`/cocozuri/order/${encodeURIComponent(r.reference)}`}
              className="truncate text-sm text-accent hover:underline">{r.reference}</Link>
          ) },
          { key: "onDate", label: "For", width: "92px", render: (r) => (
            <span className="text-sm text-fg-muted">{czDate(r.onDate)}</span>
          ) },
          { key: "what", label: "What", width: "minmax(0,1fr)", render: (r) => (
            <span className="min-w-0 truncate text-sm text-fg" title={r.what}>
              {r.what}
              <span className="ml-1.5 text-xs text-fg-subtle">{r.locationName}</span>
            </span>
          ) },
          { key: "progressLabel", label: "Progress", width: "135px", hideBelow: "md", render: (r) => (
            <span className={`text-sm ${planIsDone(r.lines) ? "text-success" : "text-fg-muted"}`}>
              {r.progressLabel}
            </span>
          ) },
          { key: "wantedLabel", label: "Wanted", width: "80px", align: "right", render: (r) => (
            <span className="text-sm tabular text-fg-muted">{r.wantedLabel}</span>
          ) },
          { key: "madeLabel", label: "Made", width: "80px", align: "right", render: (r) => (
            <span className="text-sm tabular text-fg">{r.madeLabel}</span>
          ) },
          { key: "act", label: "", width: "90px", align: "right", render: (r) => (
            <span className="flex items-center justify-end gap-1">
              {/* ⚠️ The morning routine. Yesterday's plan is nearly always this
                  morning's, and retyping fifteen lines is why paper wins. */}
              <button type="button" disabled={busy} title="Raise a new plan from this one"
                onClick={() => setCopyOf(r)}
                className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                <Copy size={12} />
              </button>
              {r.status === "draft" && r.lines.every((l) => l.batchId == null) && (
                <button type="button" disabled={busy} title="Delete this draft"
                  onClick={async () => {
                    if (!confirm(`Delete ${r.reference}?`)) return;
                    setBusy(true);
                    const res = await deletePlanAction(r.id);
                    setBusy(false);
                    if (!res.ok) { toast(res.error ?? "Could not delete it.", { tone: "danger" }); return; }
                    toast(`${r.reference} deleted.`, { tone: "success" });
                    router.refresh();
                  }}
                  className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          ) },
        ]}
        rowKey={(r) => r.id}
        listKey="cz_plans"
        filters={rail}
        total={plans.length}
        shown={rows.length}
        exportName="cocozuri-production-plans"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plan, chocolate, kitchen…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <CocozuriHelp title="What to make">
              <p>
                This is the day&apos;s list of what the kitchen is going to make. Raise one each
                morning, and another whenever a special order comes in — there is no limit, and
                raising one <strong>costs nothing</strong>.
              </p>
              <p>
                A plan <strong>moves no stock</strong>. Nothing is consumed and nothing is made
                until somebody presses <strong>Start</strong> on a line, which opens a real batch.
              </p>
              <p>
                Open a plan to see <strong>everything it will need</strong> — the materials for
                every line added up, against what is on the shelf. That is the number one line at a
                time can never show you: three products all wanting the same cream.
              </p>
              <p>
                A plan is finished when every line has been made. Nobody has to mark it.
              </p>
            </CocozuriHelp>
            <Link href="/cocozuri/order/materials"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
              What to buy
            </Link>
            <button type="button" onClick={() => setRaising(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Today&apos;s plan
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ClipboardList size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">No plan has been raised yet.</p>
            <p className="max-w-[34rem] text-sm text-fg-subtle">
              A plan is the day&apos;s list of what to make. It moves no stock and creates nothing
              until somebody starts a batch from a line, so raising one costs nothing — and it shows
              you what every line together will need off the shelf before anybody begins.
            </p>
          </div>
        }
      />

      {(raising || copyOf) && (
        <PlanSheet
          locations={locations}
          suggestions={suggestions}
          copyOf={copyOf}
          onClose={() => { setRaising(false); setCopyOf(null); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Raising one
 * ------------------------------------------------------------------ */

type Draft = { itemId: number; qty: string; recipeId: number | null };

function PlanSheet({
  locations, suggestions, copyOf, onClose,
}: {
  locations: CzStockLocation[];
  suggestions: PlanSuggestion[];
  copyOf: CzPlan | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  // ⚠️ The KITCHEN is where chocolate is made — the owner's own word.
  const [locationId, setLocationId] = useState<number>(
    copyOf?.locationId ?? locations.find((l) => /kitchen/i.test(l.name))?.id ?? locations[0]?.id ?? 0,
  );
  const [onDate, setOnDate] = useState(todayInDar());
  const [notes, setNotes] = useState("");
  const [q, setQ] = useState("");
  /* ⚠️ THE SUGGESTIONS FOLLOW THE KITCHEN. They were shipped with the page for
     the first kitchen and never refetched, so changing the kitchen went on
     offering the wrong shelf's chocolates — and the server would have taken
     them. Same shape as the counter's option list, and for the same reason. */
  const [options, setOptions] = useState<PlanSuggestion[]>(suggestions);
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<number, string>>(() => {
    /* ⚠️ COPYING BRINGS THE QUANTITIES, NOT THE BATCHES. Yesterday's plan is
       nearly always this morning's, and retyping fifteen lines is exactly why
       paper wins. What it must not bring is yesterday's progress. */
    if (!copyOf) return {};
    const out: Record<number, string> = {};
    for (const l of copyOf.lines) out[l.itemId] = String(l.qty);
    return out;
  });

  useEffect(() => {
    if (!locationId) { setOptions([]); return; }
    let alive = true;
    setLoading(true);
    fetch(`/api/cocozuri/plan-options?location=${locationId}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (alive) setOptions(d.items ?? []); })
      .catch(() => { if (alive) setOptions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [locationId]);

  const lines: Draft[] = options
    .filter((s) => typedNumberOr(amounts[s.itemId]) > 0)
    .map((s) => ({ itemId: s.itemId, qty: amounts[s.itemId]!, recipeId: s.recipeId }));

  const blockers = planBlockers({
    locationId: locationId || null,
    onDate,
    lines: lines.map((l) => ({ itemId: l.itemId, qty: typedNumberOr(l.qty) })),
  });

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const wanted = options.filter((s) => typedNumberOr(amounts[s.itemId]) > 0);
    if (term) return options.filter((s) => s.itemName.toLowerCase().includes(term)).slice(0, 400);
    // What is already on the plan floats to the top, then the emptiest shelves.
    return [...wanted, ...options.filter((s) => !wanted.includes(s))].slice(0, 400);
  }, [options, amounts, q]);

  async function save() {
    setBusy(true);
    const res = await createPlanAction({
      locationId, onDate, notes: notes || null,
      lines: lines.map((l) => ({ itemId: l.itemId, qty: typedNumberOr(l.qty), recipeId: l.recipeId })),
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not raise it.", { tone: "danger" }); return; }
    toast(`${res.reference} raised. Nothing has moved — start a line when the kitchen begins.`, { tone: "success" });
    onClose();
    router.push(`/cocozuri/order/${encodeURIComponent(res.reference!)}`);
  }

  return (
    <BottomSheet open onClose={onClose}
      title={copyOf ? `New plan, from ${copyOf.reference}` : "What to make"} maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <PField label="Which kitchen">
            <FluidSelect value={String(locationId)} onSelect={(v) => setLocationId(Number(v))}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
          </PField>
          <PField label="For what day">
            {/* ⚠️ NO `max` HERE, unlike every other date in this module. A plan
                records nothing, so writing tomorrow's tonight is the normal case. */}
            <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={FIELD} />
          </PField>
          <PField label="Note">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={FIELD}
              placeholder="Optional" />
          </PField>
        </div>

        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a chocolate…"
          className="text-sm" />

        <div className="rounded-md border border-border">
          {/* ⚠️ "CAN I MAKE THIS TODAY" ANSWERED WHERE THE DECISION IS MADE,
              rather than on a screen of its own. Both halves are already known —
              the shelf and every active recipe — and nothing put them together. */}
          <div className="grid grid-cols-[minmax(0,1fr)_105px_80px_95px_90px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span>Recipe</span>
            <span className="text-right">On shelf</span>
            <span className="text-right">Could make</span>
            <span className="text-right">Make</span>
          </div>
          <div className="max-h-[20rem] overflow-y-auto">
            {loading && <p className="px-3 py-6 text-center text-sm text-fg-subtle">Reading that kitchen…</p>}
            {!loading && shown.map((s) => (
              <div key={s.itemId} className="grid grid-cols-[minmax(0,1fr)_105px_80px_95px_90px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={s.itemName}>
                  {s.itemName}
                  <span className="ml-1.5 text-xs text-fg-subtle">{s.uom}</span>
                </span>
                <span className="min-w-0 truncate text-xs text-fg-subtle" title={s.recipeName ?? undefined}>
                  {s.recipeName ?? "no recipe"}
                  {s.yieldQty != null && <span className="ml-1 text-fg-muted">·{qtyText(s.yieldQty)}</span>}
                </span>
                <span className={`text-right text-sm tabular ${s.onHand <= 0 ? "text-warn" : "text-fg-subtle"}`}>
                  {qtyText(s.onHand)}
                </span>
                {/* ⚠️ NOT ENOUGH FOR ONE BATCH NAMES THE MATERIAL THAT RUNS OUT
                    FIRST — "0" alone tells you it cannot be made and not what to
                    go and buy. */}
                <span className={`min-w-0 truncate text-right text-sm tabular ${
                  s.couldMake == null ? "text-fg-subtle"
                    : s.couldMake <= 0 ? "text-danger" : "text-success"}`}
                  title={s.limitedBy ? `Not enough ${s.limitedBy}` : undefined}>
                  {s.couldMake == null ? "—" : qtyText(s.couldMake)}
                  {s.limitedBy && <span className="ml-1 text-xs text-fg-subtle">{s.limitedBy}</span>}
                </span>
                <input
                  value={amounts[s.itemId] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [s.itemId]: e.target.value }))}
                  inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="–"
                  aria-label={`How many ${s.itemName} to make`} />
              </div>
            ))}
            {!loading && shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-fg-subtle">
                Nothing on that kitchen has an active recipe yet.
              </p>
            )}
          </div>
        </div>

        {lines.length > 0 && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            <strong className="text-fg">{lines.length}</strong> line{lines.length === 1 ? "" : "s"}.
            Nothing moves when this is saved — open the plan to see what it will need off the shelf,
            and start each line when the kitchen begins it.
          </p>
        )}

        {blockers.length > 0 && lines.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />} Raise the plan
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
          {copyOf && (
            <span className="text-xs text-fg-subtle">
              <X size={11} className="inline" /> Quantities copied from {copyOf.reference}; nothing else.
            </span>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function PField({ label, children }: { label: string; children: React.ReactNode }) {
  /* ⚠️ `justify-end` — a grid cell stretches to the tallest row, so a wrapping
     label would push its own control down while a one-line label left its
     control at the top. */
  return (
    <label className="flex h-full flex-col justify-end gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}
