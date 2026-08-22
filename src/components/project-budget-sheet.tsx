"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT BUDGET — the Bill of Quantities screen (Phase 2).
//
// The owner chose to TYPE the lines rather than paste or import them, and there
// are around 270. That decision shapes this whole component: the add-a-line row
// is not a dialog you open and close 270 times, it is a permanent strip that
// stays open, keeps your place, and re-focuses itself after every save.
//
// What that means in practice:
//   · the row never closes — Enter saves and puts the cursor back at the start
//   · the CATEGORY you last used is kept, because a run of lines shares one
//     (six cement lines in a row, then four sand)
//   · the item code fills itself in from category + sub-job as you type, the
//     way PATAMELA's `=CONCATENATE(C,B)` does — and stays editable, because the
//     workbook's own codes are not perfectly consistent
//   · the running total sits in front of you, so you can check against the
//     spreadsheet as you go instead of at the end of 270 lines
//
// ⚠️ Nothing is pre-filled from the spreadsheet. Every figure on this screen was
// typed by the owner.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Check, Pencil, X, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { FieldCell } from "@/components/ui";
import { RecordList } from "./record-list";
import { Combobox } from "./combobox";
import { SetupNeeded } from "./setup-needed";
import { createRefAction } from "@/app/projects/[id]/setup/actions";
import { MoneyInput } from "./money-input";
import {
  money, suggestItemCode, groupByCategory, normaliseCode, splitDifference, splitTotals,
  type BudgetLine,
} from "@/lib/project-budget-shared";
import { num } from "@/lib/projects-shared";
import {
  addBudgetLineAction, updateBudgetLineAction, deleteBudgetLineAction,
} from "@/app/projects/[id]/budget/actions";

export function ProjectBudgetSheet({
  projectId, lines: serverLines, quotationValue, categoryOptions, subJobOptions, currency,
}: {
  projectId: number;
  lines: BudgetLine[];
  /** The contract price, so the margin can be shown as the budget is typed. */
  quotationValue: number | null;
  /** From the project's Setup tab — the masters these dropdowns offer.
   *  Named *Options to avoid colliding with the grouped `categories` below. */
  categoryOptions: string[];
  subJobOptions: string[];
  currency: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<number | null>(null);

  /**
   * ⚠️ THIS SCREEN OWNS ITS LIST. Read the reason before changing it.
   *
   * The obvious design — server component fetches, action writes,
   * `router.refresh()` re-fetches — DOES NOT SURVIVE FAST TYPING, which is the
   * one thing this screen exists for. Measured on this connection: ten lines
   * entered, every one saved, the list showed two and never caught up until a
   * full page navigation. Rapid `router.refresh()` calls race and an early
   * response wins.
   *
   * The first attempt at a fix was worse. It kept a list of "just added" lines
   * and dropped each one when the server's list contained it — which meant a
   * line ADDED and then DELETED in the same session came back, because the
   * server no longer had it. The screen then showed a deleted line and a wrong
   * total: a display bug promoted into a correctness bug.
   *
   * So: seed once from the server, then keep the list here, and change it ONLY
   * when a write has actually succeeded. Each action returns ok/error, so local
   * state can never drift from the database without the error being shown. A
   * navigation remounts the component and re-seeds from the server.
   */
  const [rows, setRows] = useState<BudgetLine[]>(serverLines);

  // Re-seed when the route changes to a different project (the component can be
  // reused across navigations). NOT on every prop change — that is exactly the
  // stale-refresh payload that caused the original bug.
  const seededFor = useRef(projectId);
  useEffect(() => {
    if (seededFor.current !== projectId) {
      seededFor.current = projectId;
      setRows(serverLines);
    }
  }, [projectId, serverLines]);

  const lines = rows;

  const total = useMemo(
    () => lines.reduce((s, l) => s + (num(l.amount) ?? 0), 0),
    [lines],
  );
  const categories = useMemo(() => groupByCategory(lines), [lines]);
  const knownCategories = useMemo(
    () => [...new Set(lines.map((l) => l.category))].sort(),
    [lines],
  );

  // ⚠️ NOT `total > 0 ? … : null` by accident — an EMPTY budget must not report a
  // margin. With no lines, `total` is 0, so (quotation − 0) / quotation = 100%,
  // and the screen cheerfully announced "100.0%" on a project with no budget at
  // all. That is the very mistake the rest of this module exists to avoid: zero
  // is a value, "not entered yet" is not.
  const margin =
    lines.length > 0 && quotationValue && quotationValue > 0
      ? (quotationValue - total) / quotationValue
      : null;

  return (
    <div className="space-y-4">
      <RunningTotal
        total={total}
        lineCount={lines.length}
        categoryCount={categories.length}
        quotationValue={quotationValue}
        margin={margin}
      />

      <SplitSummary lines={lines} />

      <SetupNeeded projectId={projectId} missing={[
        ...(categoryOptions.length ? [] : ["Categories"]),
        ...(subJobOptions.length ? [] : ["Sub-jobs"]),
      ]} />

      <AddLineRow
        projectId={projectId}
        categories={categoryOptions}
        subJobs={subJobOptions}
        currency={currency}
        knownCategories={knownCategories}
        onSaved={(line) => {
          setError(null);
          setRows((prev) => [...prev, line]);
          // Refreshes the OVERVIEW's profit figures. The list above does not
          // depend on it — see the note at the top of this component.
          router.refresh();
        }}
        onError={setError}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}

      {categories.length > 0 && <CategoryBreakdown categories={categories} />}

      <RecordList
        rows={lines}
        rowKey={(l) => l.id}
        listKey="project-budget"
        search={{
          placeholder: "Search item code, category, description…",
          param: "bq",
          match: (l, q) =>
            [l.itemCode, l.category, l.subJob, l.description, l.notes]
              .some((v) => (v ?? "").toLowerCase().includes(q)),
        }}
        total={lines.length}
        empty={
          <div className="py-6 text-center">
            <p className="text-base font-medium">No budget lines yet</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Add the first one above. Nothing is imported — every line is typed.
            </p>
          </div>
        }
        columns={[
          {
            key: "itemCode", label: "Item code", width: "minmax(0,1fr)",
            render: (l) => (
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm">{l.itemCode}</span>
                {l.description && (
                  <span className="block truncate text-xs text-fg-muted">{l.description}</span>
                )}
              </span>
            ),
          },
          {
            key: "category", label: "Category", width: "150px", hideBelow: "md",
            render: (l) => <span className="truncate text-sm">{l.category}</span>,
          },
          {
            key: "qty", label: "Qty", width: "90px", align: "right", hideBelow: "lg",
            render: (l) => (
              <span className="tabular text-sm text-fg-muted">
                {/* Blank, never 0 — a quantity nobody typed is not a quantity of none. */}
                {l.qty === null ? "—" : `${num(l.qty)}${l.unit ? ` ${l.unit}` : ""}`}
              </span>
            ),
          },
          {
            key: "split", label: "Materials / labour", width: "150px", align: "right", hideBelow: "lg",
            total: (shown) => {
              const t = splitTotals(shown);
              if (t.lines === 0) return null;
              return <span className="tabular text-fg-muted">{money(t.materials)} / {money(t.labour)}</span>;
            },
            render: (l) => {
              const diff = splitDifference(l);
              if (diff === null) return <span className="text-sm text-fg-subtle">—</span>;
              return (
                <span className="inline-flex items-center justify-end gap-1 text-sm">
                  <span className="tabular text-fg-muted">
                    {money(num(l.materialsAmount) ?? 0)} / {money(num(l.labourAmount) ?? 0)}
                  </span>
                  {diff !== 0 && (
                    <span
                      title={`The split is ${money(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the amount. Neither figure has been changed — check which is right.`}
                      className="text-warn"
                    >
                      <AlertTriangle size={12} />
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            key: "amount", label: "Amount", width: "120px", align: "right",
            render: (l) => <span className="tabular text-sm">{money(num(l.amount)) ?? "—"}</span>,
            // Sums what is on screen. On Patamela the whole list must reach
            // 146,801,556 — the figure to check against the spreadsheet.
            total: (shown) => (
              <span className="tabular">{money(shown.reduce((s, l) => s + (num(l.amount) ?? 0), 0))}</span>
            ),
          },
        ]}
        rowActions={(l) => (
          <span className="flex items-center gap-1">
            <button
              type="button" title="Edit this line"
              onClick={() => setEditing(l.id)}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button" title="Delete this line"
              onClick={() => {
                if (!confirm(`Delete “${l.itemCode}” from the budget?`)) return;
                start(async () => {
                  const res = await deleteBudgetLineAction(l.id, projectId);
                  if (!res.ok) { setError(res.error ?? "Couldn't delete."); return; }
                  setRows((prev) => prev.filter((r) => r.id !== l.id));
                  router.refresh();
                });
              }}
              className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
        /* ⚠️ `data-quick-update` keeps this visible: Compact density hides
           `[data-subrow]` except on hover (globals.css), which would put the
           edit fields behind a hover and out of reach on touch. */
        subRow={(l) =>
          editing === l.id ? (
            <div data-quick-update>
            <EditLine
              line={l} projectId={projectId} currency={currency}
              onDone={(patched) => {
                setRows((prev) => prev.map((r) => (r.id === patched.id ? patched : r)));
                setEditing(null);
                router.refresh();
              }}
              onCancel={() => setEditing(null)}
              onError={setError}
            />
            </div>
          ) : null
        }
      />

      {pending && (
        <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <Loader2 size={12} className="animate-spin" /> Saving…
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── what the budget is made of ─── */

/**
 * Materials against labour, and how much of the budget has not been split.
 *
 * One line rather than tiles: it is only meaningful once some lines carry a
 * split, so it says nothing at all until they do.
 */
function SplitSummary({ lines }: { lines: BudgetLine[] }) {
  const t = splitTotals(lines);
  const mismatched = lines.filter((l) => (splitDifference(l) ?? 0) !== 0).length;
  if (t.lines === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
      <span>Materials <span className="tabular text-fg">{money(t.materials)}</span></span>
      <span>Labour <span className="tabular text-fg">{money(t.labour)}</span></span>
      <span>Split on {t.lines} line{t.lines === 1 ? "" : "s"}</span>
      {t.unsplit > 0 && <span>Not split <span className="tabular text-fg">{money(t.unsplit)}</span></span>}
      {mismatched > 0 && (
        <span className="inline-flex items-center gap-1 text-warn">
          <AlertTriangle size={12} />
          {mismatched} line{mismatched === 1 ? " does" : "s do"} not add up to the amount
        </span>
      )}
    </p>
  );
}

/* ───────────────────────────────────────────────────────── running total ─── */

/**
 * The figure to check against the spreadsheet as you type.
 *
 * On Patamela this must reach **146,801,556**. Showing it live is the whole
 * safety net for hand-entry: if it drifts, you find out at line 40 rather than
 * after all 270.
 */
function RunningTotal({
  total, lineCount, categoryCount, quotationValue, margin,
}: {
  total: number; lineCount: number; categoryCount: number;
  quotationValue: number | null; margin: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <Tile label="Budget so far" value={lineCount === 0 ? "—" : money(total)!} strong />
      <Tile label="Lines" value={String(lineCount)} sub={`${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}`} />
      <Tile
        label="Quotation (excl. VAT)"
        value={quotationValue === null ? "—" : money(quotationValue)!}
        sub={quotationValue === null ? "not entered on the project" : undefined}
      />
      <Tile
        label="Margin if this is the lot"
        value={margin === null ? "—" : `${(margin * 100).toFixed(1)}%`}
        sub={
          margin !== null ? "quotation − budget"
            : lineCount === 0 ? "no budget lines yet"
            : "needs the quotation"
        }
        tone={margin !== null && margin < 0 ? "danger" : undefined}
      />
    </div>
  );
}

function Tile({ label, value, sub, strong, tone }: {
  label: string; value: string; sub?: string; strong?: boolean; tone?: "danger";
}) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-xs uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className={cn(
        "tabular mt-0.5",
        strong ? "text-[17px] font-medium" : "text-[15px]",
        tone === "danger" && "text-danger",
      )}>
        {value}
      </p>
      {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── categories ─── */

function CategoryBreakdown({ categories }: { categories: ReturnType<typeof groupByCategory> }) {
  const top = categories.slice(0, 8);
  return (
    <details className="rounded-lg border border-border bg-bg-elev">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        By category ({categories.length}) — the workbook&rsquo;s PATAMELA T/U block
      </summary>
      <div className="space-y-1.5 border-t border-border px-3 py-2.5">
        {top.map((c) => (
          <div key={c.category} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-sm">{c.category}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-bg-muted">
              <span className="block h-full bg-accent" style={{ width: `${c.share * 100}%` }} />
            </span>
            <span className="tabular w-24 shrink-0 text-right text-sm">{money(c.amount)}</span>
            <span className="tabular w-12 shrink-0 text-right text-xs text-fg-subtle">
              {(c.share * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        {categories.length > top.length && (
          <p className="pt-1 text-xs text-fg-subtle">
            …and {categories.length - top.length} smaller categories.
          </p>
        )}
      </div>
    </details>
  );
}

/* ────────────────────────────────────────────────────────── add-a-line ───── */

function AddLineRow({
  projectId, categories, subJobs, currency, knownCategories, onSaved, onError,
}: {
  projectId: number;
  /** The project's master lists (Setup tab). */
  categories: string[];
  subJobs: string[];
  currency: string;
  /** Categories already used on THIS budget — offered alongside the master
   *  list so an older line's category is never lost from the dropdown. */
  knownCategories: string[];
  /** Handed the line that was just saved, so it can be shown before the
   *  server round-trip completes. */
  onSaved: (line: BudgetLine) => void;
  onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  // Category persists between saves — a budget runs in blocks of one material.
  const [category, setCategory] = useState("");
  const [subJob, setSubJob] = useState("");
  const [code, setCode] = useState("");
  // True once the code has been typed into by hand; after that it stops
  // following category/sub-job, because the owner's version wins.
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  // The optional half: quantity, unit and the materials/labour split. Folded
  // away by default — 270 lines are typed through the four fields above, and
  // the owner asked not to be shown a wall of boxes. The choice is remembered,
  // so somebody entering quantities does not re-open it every visit.
  const [extras, setExtras] = useState(false);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [materials, setMaterials] = useState("");
  const [labour, setLabour] = useState("");
  const [justSaved, setJustSaved] = useState<string | null>(null);

  useEffect(() => {
    try { setExtras(localStorage.getItem("project-budget-extras") === "1"); } catch {}
  }, []);
  const toggleExtras = () => {
    setExtras((v) => {
      try { localStorage.setItem("project-budget-extras", v ? "0" : "1"); } catch {}
      return !v;
    });
  };
  // ⚠️ Sub-job is a Combobox now, which owns its own input, so there is no ref
  // to focus. Remounting it on `comboKey` clears it; the cursor stays where the
  // person put it rather than being yanked about.
  const nextFieldRef = useRef<HTMLInputElement | null>(null);
  // Combobox holds its own text internally, so it is remounted (not reset) when
  // the row clears. The category deliberately survives — see the header.
  const [comboKey, setComboKey] = useState(0);

  const effectiveCode = codeTouched ? code : suggestItemCode(category, subJob);

  const save = () => {
    onError(null);
    if (!effectiveCode.trim()) { onError("Give the line an item code."); return; }
    if (!category.trim()) { onError("Give the line a category."); return; }
    start(async () => {
      const res = await addBudgetLineAction({
        projectId, itemCode: effectiveCode, category,
        subJob, description, amount,
        qty, unit, materialsAmount: materials, labourAmount: labour,
      });
      if (!res.ok) { onError(res.error ?? "Couldn't save the line."); return; }
      // Keep the category, clear the rest, go back to the top of the row.
      const saved = normaliseCode(effectiveCode);
      setJustSaved(saved);
      onSaved({
        id: res.id ?? -Date.now(),        // real id if returned; placeholder otherwise
        projectId, itemCode: saved, category: normaliseCode(category),
        subJob: subJob || null, description: description || null,
        amount: amount.replace(/[\s,]/g, "") || "0",
        materialsAmount: materials.replace(/[\s,]/g, "") || null,
        labourAmount: labour.replace(/[\s,]/g, "") || null,
        qty: qty.replace(/[\s,]/g, "") || null,
        unit: unit || null,
        sortOrder: 9e6, notes: null,
      });
      setSubJob(""); setCode(""); setCodeTouched(false); setComboKey((k) => k + 1);
      setDescription(""); setAmount("");
      // Quantity and the split clear too; the UNIT stays, because a run of
      // lines is measured the same way (bags, then trips, then metres).
      setQty(""); setMaterials(""); setLabour("");
      setTimeout(() => setJustSaved(null), 2000);
      nextFieldRef.current?.focus();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Add a line</h3>
        {justSaved && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check size={12} /> saved {justSaved}
          </span>
        )}
      </div>

      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-12"
        onKeyDown={(e) => {
          // Enter saves from anywhere in the row — 270 lines is a lot of mousing.
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
        }}
      >
        <FieldCell className="sm:col-span-2" label="Category" hint="PATAMELA col C">
          {/* Combobox, NOT a native <datalist> — CLAUDE.md bans both <select>
              and <datalist> because their popups mis-render. This is the piece
              built for exactly this case: type a new value OR pick one already
              used on this budget. */}
          <Combobox
            key={comboKey}
            options={[...new Set([...categories, ...knownCategories])].sort()}
            onCreate={(name) => createRefAction(projectId, "category", name)}
            createNoun="category"
            defaultValue={category}
            placeholder="CEMENT"
            onInput={setCategory}
            onCommit={setCategory}
            // ⚠️ Combobox styles its input ENTIRELY from this prop (it only adds
            // `pr-7` for the chevron). Without it the input keeps the browser's
            // default width — 242px inside a 139px grid cell, overflowing 102px
            // and sitting on top of the Sub-job field.
            className={inputCls}
          />
        </FieldCell>

        <FieldCell className="sm:col-span-3" label="Sub-job" hint="PATAMELA col D">
          {/* Also a master list. Typing a new value is still allowed — the
              Setup tab is where they are curated, not a gate on entry. */}
          <Combobox
            key={`sub-${comboKey}`}
            options={subJobs}
            onCreate={(name) => createRefAction(projectId, "sub_job", name)}
            createNoun="sub-job"
            defaultValue={subJob}
            placeholder="STRIP-FOUNDATION"
            onInput={setSubJob}
            onCommit={setSubJob}
            className={inputCls}
          />
        </FieldCell>

        <FieldCell className="sm:col-span-3" label="Item code">
          <input
            value={effectiveCode}
            onChange={(e) => { setCodeTouched(true); setCode(e.target.value); }}
            placeholder="CEMENT-STRIP-FOUNDATION"
            className={cn(inputCls, "font-mono", !codeTouched && effectiveCode && "text-fg-muted")}
          />
        </FieldCell>

        <FieldCell className="sm:col-span-2" label="Description" hint="PATAMELA col B">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="optional" className={inputCls} />
        </FieldCell>

        <FieldCell className="sm:col-span-2" label="Amount" hint="PATAMELA col M">
          <MoneyInput value={amount} onChange={setAmount} currency={currency} placeholder="175,000" />
        </FieldCell>
      </div>

      {extras && (
        <div
          className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 sm:grid-cols-12"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}
        >
          <FieldCell className="sm:col-span-2" label="Quantity" hint="PATAMELA col G">
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal"
              placeholder="25" className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-2" label="Unit" hint="bags, trips, m2">
            <input value={unit} onChange={(e) => setUnit(e.target.value)}
              placeholder="EA" className={inputCls} />
          </FieldCell>
          <FieldCell className="sm:col-span-4" label="Materials" hint="PATAMELA col J">
            <MoneyInput value={materials} onChange={setMaterials} currency={currency} placeholder="optional" />
          </FieldCell>
          <FieldCell className="sm:col-span-4" label="Labour" hint="PATAMELA col L">
            <MoneyInput value={labour} onChange={setLabour} currency={currency} placeholder="optional" />
          </FieldCell>
          <p className="sm:col-span-12 text-xs text-fg-subtle">
            All four are optional and none of them changes the amount. Nothing here is
            multiplied out — the amount above stays the figure.
          </p>
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add line
        </button>
        <button type="button" onClick={toggleExtras}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-fg-muted hover:text-fg">
          <ChevronDown size={12} className={cn("transition-transform", extras && "rotate-180")} />
          {extras ? "Hide quantity & split" : "Quantity & split"}
        </button>
        <span className="text-xs text-fg-subtle">
          Press <kbd className="rounded border border-border px-1">Enter</kbd> to save and start the next line.
          The category stays for the next one.
        </span>
      </div>
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent";

/**
 * One field of the add-a-line row.
 *
 * ⚠️ The label is ONE fixed line (`h-4` + `truncate`). Left to wrap, "CATEGORY
 * PATAMELA col C" took two lines while "AMOUNT PATAMELA col M" took one, so the
 * inputs in the same row sat at different heights and the strip looked broken.
 * The hint is a `title` as well, so it is still readable when truncated.
 */

/* ─────────────────────────────────────────────────────────── edit a line ─── */

function EditLine({
  line, projectId, currency, onDone, onCancel, onError,
}: {
  line: BudgetLine; projectId: number; currency: string;
  /** Handed the patched line, so the list can update without a re-fetch. */
  onDone: (patched: BudgetLine) => void;
  onCancel: () => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [itemCode, setItemCode] = useState(line.itemCode);
  const [category, setCategory] = useState(line.category);
  const [description, setDescription] = useState(line.description ?? "");
  const [amount, setAmount] = useState(line.amount);
  const [qty, setQty] = useState(line.qty ?? "");
  const [unit, setUnit] = useState(line.unit ?? "");
  const [materials, setMaterials] = useState(line.materialsAmount ?? "");
  const [labour, setLabour] = useState(line.labourAmount ?? "");

  return (
    <div
      className="grid grid-cols-1 gap-2 rounded-md border border-accent/30 bg-bg-subtle p-2 sm:grid-cols-12"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
    >
      <input value={itemCode} onChange={(e) => setItemCode(e.target.value)}
        className={cn(inputCls, "font-mono sm:col-span-4")} />
      <input value={category} onChange={(e) => setCategory(e.target.value)}
        className={cn(inputCls, "sm:col-span-2")} />
      <input value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="description" className={cn(inputCls, "sm:col-span-3")} />
      <MoneyInput value={amount} onChange={setAmount} currency={currency} className="sm:col-span-2" />

      <div className="grid grid-cols-2 gap-2 sm:col-span-11 sm:grid-cols-12">
        <label className="sm:col-span-2 text-xs uppercase tracking-[0.04em] text-fg-subtle">
          Qty
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal"
            placeholder="—" className={cn(inputCls, "mt-0.5 normal-case tracking-normal")} />
        </label>
        <label className="sm:col-span-2 text-xs uppercase tracking-[0.04em] text-fg-subtle">
          Unit
          <input value={unit} onChange={(e) => setUnit(e.target.value)}
            placeholder="—" className={cn(inputCls, "mt-0.5 normal-case tracking-normal")} />
        </label>
        <label className="sm:col-span-4 text-xs uppercase tracking-[0.04em] text-fg-subtle">
          Materials
          <MoneyInput value={materials} onChange={setMaterials} currency={currency} className="mt-0.5" />
        </label>
        <label className="sm:col-span-4 text-xs uppercase tracking-[0.04em] text-fg-subtle">
          Labour
          <MoneyInput value={labour} onChange={setLabour} currency={currency} className="mt-0.5" />
        </label>
      </div>

      <div className="flex items-center gap-1 sm:col-span-1">
        <button
          type="button" disabled={pending} title="Save"
          onClick={() => start(async () => {
            const res = await updateBudgetLineAction(line.id, projectId, {
              itemCode, category, description, amount,
              qty, unit, materialsAmount: materials, labourAmount: labour,
            });
            if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
            onDone({
              ...line,
              itemCode: normaliseCode(itemCode),
              category: normaliseCode(category),
              description: description || null,
              amount: amount.replace(/[\s,]/g, "") || "0",
              qty: qty.replace(/[\s,]/g, "") || null,
              unit: unit || null,
              materialsAmount: materials.replace(/[\s,]/g, "") || null,
              labourAmount: labour.replace(/[\s,]/g, "") || null,
            });
          })}
          className="rounded bg-accent p-1.5 text-accent-fg disabled:opacity-60"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button type="button" onClick={onCancel} title="Cancel (Esc)"
          className="rounded p-1.5 text-fg-subtle hover:bg-bg-muted">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
