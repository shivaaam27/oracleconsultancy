"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OPS MASTER LISTS — one surface, eight lists (Stage 1).
//
// The owner's rule, learned on the projects Setup tab: "so much boxes, and
// borders". So this is a chip row to pick a list, that list underneath, and
// everything else folded behind "More" — not nine cards on one screen.
//
// The add / rename / merge / delete manager is the SHARED `ReferenceAdmin`,
// the same one Sites and Roles use. Nothing about these lists justifies a
// fourth copy of that widget.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { ReferenceAdmin } from "./reference-admin";
import { FluidSelect } from "./fluid-select";
import { OPS_REF_KINDS, type OpsRef } from "@/lib/ops-refs-shared";
import {
  createOpsRefAction, renameOpsRefAction, mergeOpsRefsAction, deleteOpsRefAction,
  restoreOpsRefAction, seedOpsStarterListsAction, copyOpsRefsFromAction, setOpsExRateAction,
} from "@/app/ops/actions";

type Res = { ok: boolean; note?: string; error?: string };

export function OpsLists({
  companyId, companies, refs, exRate,
}: {
  companyId: number;
  companies: Array<{ id: number; name: string }>;
  refs: OpsRef[];
  exRate: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>(OPS_REF_KINDS[0].kind);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [rate, setRate] = useState(exRate ? String(exRate) : "");
  const [copyFrom, setCopyFrom] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  const byKind = useMemo(() => {
    const m = new Map<string, OpsRef[]>();
    for (const r of refs) {
      const list = m.get(r.kind) ?? [];
      list.push(r);
      m.set(r.kind, list);
    }
    return m;
  }, [refs]);

  const meta = OPS_REF_KINDS.find((k) => k.kind === kind)!;
  const all = byKind.get(kind) ?? [];
  const items = showRetired ? all : all.filter((r) => r.active);
  const retiredCount = all.length - all.filter((r) => r.active).length;

  const run = (fn: () => Promise<Res>) =>
    start(async () => {
      setError(null); setNote(null);
      const res = await fn();
      if (!res.ok) { setError(res.error ?? "That didn't work."); return; }
      if (res.note) setNote(res.note);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {/* ── which company these lists belong to ── */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
        <span className="text-fg-muted">Company</span>
        <FluidSelect
          value={String(companyId)}
          options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          onSelect={(v) => router.push(`/ops?company=${v}`)}
          buttonClassName="h-7"
        />
        <span className="text-[11px] text-fg-subtle">
          Each company keeps its own lists. Orders raised under it pick from these.
        </span>
      </div>

      {(note || error) && (
        <p role="alert" className={cn("rounded-md px-2.5 py-1.5 text-[12px]",
          error ? "bg-danger-soft text-danger" : "bg-bg-subtle text-fg-muted")}>
          {error ?? note}
        </p>
      )}

      {/* ── the one card ── */}
      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <div className="flex flex-wrap gap-1 border-b border-border bg-bg-subtle px-2 py-1.5">
          {OPS_REF_KINDS.map((k) => {
            const n = (byKind.get(k.kind) ?? []).filter((r) => r.active).length;
            return (
              <button key={k.kind} type="button" onClick={() => setKind(k.kind)}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
                  kind === k.kind ? "bg-bg-elev font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                {k.plural}
                <span className={cn("tabular text-[10px]", n ? "text-fg-subtle" : "text-fg-subtle/50")}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] text-fg-muted">{meta.blurb}</p>
            {retiredCount > 0 && (
              <button type="button" onClick={() => setShowRetired((v) => !v)}
                className="text-[11px] text-fg-subtle hover:text-fg">
                {showRetired ? "Hide" : "Show"} {retiredCount} retired
              </button>
            )}
          </div>

          <ReferenceAdmin
            /* Retired entries carry a word saying so, rather than looking like
               live ones — they are still on old orders and must read correctly. */
            items={items.map((r) => ({
              id: r.id, name: r.name, meta: r.active ? undefined : "retired",
            }))}
            noun={meta.noun}
            plural={meta.plural}
            addPlaceholder={meta.placeholder}
            onCreate={(name) => createOpsRefAction(companyId, kind, name)}
            onRename={(id, name) => renameOpsRefAction(id, name)}
            onMerge={(fromId, intoId) => mergeOpsRefsAction(fromId, intoId)}
            onDelete={(id) => deleteOpsRefAction(id)}
            mergeNote={`Everything filed under the first ${meta.noun.toLowerCase()} moves to the second, and the first is removed.`}
            deleteNote={`If orders already name this ${meta.noun.toLowerCase()} it is retired instead, so the old rows still read correctly.`}
          />

          {showRetired && retiredCount > 0 && (
            <div className="space-y-1 border-t border-border pt-2">
              {all.filter((r) => !r.active).map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[12px] text-fg-muted">
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <button type="button" disabled={pending}
                    onClick={() => run(() => restoreOpsRefAction(r.id))}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:text-fg">
                    <RotateCcw size={11} /> Put back
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── everything else, folded away ── */}
      <div>
        <button type="button" onClick={() => setShowMore((v) => !v)}
          className="inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg">
          <ChevronDown size={13} className={cn("transition-transform", showMore && "rotate-180")} />
          More
        </button>

        {showMore && (
          <div className="mt-2 space-y-3 border-t border-border pt-3 text-[12px]">
            {/* the default exchange rate */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-fg-muted">Exchange rate offered on a new line</span>
              <input
                value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal"
                placeholder="2,500"
                className="h-7 w-28 rounded-md border border-border bg-bg px-2 text-right text-[12px] tabular outline-none focus:border-accent"
              />
              <button type="button" disabled={pending} onClick={() => run(() => setOpsExRateAction(rate))}
                className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-bg-subtle">
                Save
              </button>
              <span className="text-[11px] text-fg-subtle">
                A starting figure only. Every line keeps its own rate, frozen when it is entered
                and editable afterwards — an old order never changes value because the rate moved.
              </span>
            </div>

            {/* the starter vocabulary */}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending}
                onClick={() => run(() => seedOpsStarterListsAction(companyId))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-bg-subtle">
                {pending ? <Loader2 size={12} className="animate-spin" /> : null}
                Add the standard statuses, modes and ageing bands
              </button>
              <span className="text-[11px] text-fg-subtle">
                Only those three — they are how the work flows. Clients, suppliers, agents and
                origins are yours to type; nothing fills them in for you.
              </span>
            </div>

            {/* copy from another company */}
            {companies.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg-muted">Copy every list from</span>
                <FluidSelect
                  value={copyFrom}
                  options={[{ value: "", label: "Choose…" },
                    ...companies.filter((c) => c.id !== companyId).map((c) => ({ value: String(c.id), label: c.name }))]}
                  onSelect={setCopyFrom}
                  buttonClassName="h-7"
                />
                <button type="button" disabled={pending || !copyFrom}
                  onClick={() => run(() => copyOpsRefsFromAction(companyId, Number(copyFrom)))}
                  className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-bg-subtle disabled:opacity-50">
                  Copy
                </button>
                <span className="text-[11px] text-fg-subtle">
                  Set one company up properly, then reuse it. Nothing already here is touched.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
