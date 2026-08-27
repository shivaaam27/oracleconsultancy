"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronRight, Loader2, SkipForward } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { FluidSelect } from "@/components/fluid-select";
import { FIELD } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  parseRecipeSheet, stripIngredientQty, suggestMaterial, suggestOutput,
  type CzImportedRecipe,
} from "@/lib/cocozuri-recipe-import";
import type { CzStockItem, CzStockLocation } from "@/lib/cocozuri-stock-shared";
import { createRecipeAction } from "@/app/cocozuri/actions";
import { CZ_RECIPE_KINDS, type CzRecipeKind } from "@/lib/cocozuri-recipe-shared";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Loading the chef's costing workbook, one recipe at a time.
 *
 * There are 174 recipes in that file and 144 distinct names, of which six match
 * a CocoZuri product exactly. So this cannot be an import button — every one
 * needs a person. What it CAN do is put them in front of that person in order,
 * with the obvious answer already filled in and the rest left blank.
 *
 * ⚠️ THE WORKBOOK'S PRICES ARE NOT IMPORTED. Ever. A recipe in COS costs itself
 * from what was actually paid; the sheet prices the same butter at 28 a gram in
 * 82 recipes and at 82.34 in one, and the same cooking cream at 6.30, 12.50 and
 * 13.00. Bringing those in would bring the disagreement with them.
 *
 * ⚠️ NOTHING IS CREATED. A material that is not already on the shelf has to be
 * put there deliberately, elsewhere. This screen will not do it for you.
 *
 * ⚠️ EVERY RECIPE LANDS AS A DRAFT, as `createRecipe` insists — a recipe nobody
 * has checked must not be what the kitchen reaches for at seven in the morning.
 * ------------------------------------------------------------------ */

/** What a person has decided a chef's wording means. Kept on the device: this
 *  is a job of several sittings, and answering "Feuilletine" once should do. */
const REMEMBER_KEY = "cocozuri.recipeImport.materials";

function loadRemembered(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch { return {}; }
}
function saveRemembered(m: Record<string, number>) {
  try { window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(m)); } catch { /* a private window; not worth a word */ }
}

type LineChoice = { itemId: number | null; kind: CzRecipeKind; qty: string; uom: string };

/** ⚠️ Stamped with `at` — the block these answers belong to. Without that the
 *  form and the recipe on screen can drift apart, silently. */
type FormState = {
  at: number;
  name: string;
  outItemId: number | null;
  yieldQty: string;
  loss: string;
  lines: LineChoice[];
};

export function CocozuriRecipeImport({
  items, locations, existingNames,
}: {
  items: CzStockItem[];
  locations: CzStockLocation[];
  existingNames: string[];
}) {
  const { toast } = useToast();

  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<CzImportedRecipe[] | null>(null);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<{ saved: number; skipped: number }>({ saved: 0, skipped: 0 });
  /* ⚠️ NAMES SAVED IN THIS SITTING, KEPT HERE RATHER THAN RE-READ FROM THE
     SERVER. `router.refresh()` after each save re-ran the page and remounted
     this component, which threw away which recipe we were on and the count of
     what had been done — the save landed in the database and the screen sat
     there looking as though it had not. It is also 174 round trips for a list
     of names we already know. */
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [remembered, setRemembered] = useState<Record<string, number>>({});
  /* Read after mount, because localStorage does not exist while this renders on
     the server. That is safe rather than lucky: no form is built until somebody
     presses "Read it", and a click cannot happen before the effects have run. */
  useEffect(() => setRemembered(loadRemembered()), []);

  /* ⚠️ THE OUTPUT SHELF AND THE MATERIAL SHELF ARE CHOSEN, NOT ASSUMED. The
     kitchen makes the chocolate and raw materials feed it — but that is a fact
     about this business, not about the software, and a wrong shelf is the bug
     that filed the first live recipe against the shop. */
  const kitchen = locations.find((l) => /kitchen/i.test(l.name)) ?? locations[0] ?? null;
  const rawStore = locations.find((l) => /raw/i.test(l.name)) ?? locations[locations.length - 1] ?? null;
  const [outLocId, setOutLocId] = useState<number | null>(kitchen?.id ?? null);
  const [matLocId, setMatLocId] = useState<number | null>(rawStore?.id ?? null);

  const labelOf = useMemo(
    () => (i: CzStockItem) => `${i.name} · ${locations.find((l) => l.id === i.locationId)?.name ?? "?"}`,
    [locations],
  );
  const outOptions = useMemo(
    () => items.filter((i) => !i.archived && i.locationId === outLocId).map(labelOf).sort(),
    [items, outLocId, labelOf],
  );
  const matOptions = useMemo(
    () => items.filter((i) => !i.archived && i.locationId === matLocId).map(labelOf).sort(),
    [items, matLocId, labelOf],
  );
  const byLabel = useMemo(() => new Map(items.map((i) => [labelOf(i), i] as const)), [items, labelOf]);

  const current = parsed && at < parsed.length ? parsed[at]! : null;

  /* ---- the answers for the recipe on screen ----
     ⚠️ THE FORM IS STAMPED WITH THE BLOCK IT BELONGS TO AND REBUILT DURING
     RENDER, not in an effect. An effect runs AFTER the first render, so for one
     frame the block on screen had no answers to go with it and the material
     rows read `lineChoices[i]!` off the end of an empty array — which crashed
     the page outright the first time a real sheet was pasted in. Deriving it
     here means the two can never be out of step. */
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const freshForm = (b: CzImportedRecipe): FormState => ({
    at,
    name: b.title ?? "",
    outItemId: (b.title && outLocId != null ? suggestOutput(b.title, items, outLocId) : null)?.item.id ?? null,
    yieldQty: b.yieldQty == null ? "" : String(b.yieldQty),
    loss: "0",
    lines: b.lines.map((l) => {
      const s = matLocId != null ? suggestMaterial(l.name, items, matLocId, remembered) : null;
      return { itemId: s?.item.id ?? null, kind: "ingredient" as CzRecipeKind, qty: String(l.qty), uom: l.uom ?? "" };
    }),
  });
  if (current && form?.at !== at) setForm(freshForm(current));

  const name = form?.name ?? "";
  const outItemId = form?.outItemId ?? null;
  const yieldQty = form?.yieldQty ?? "";
  const loss = form?.loss ?? "0";
  const lineChoices = form?.at === at ? form.lines : [];
  const setName = (v: string) => setForm((f) => (f ? { ...f, name: v } : f));
  const setOutItemId = (v: number | null) => setForm((f) => (f ? { ...f, outItemId: v } : f));
  const setYieldQty = (v: string) => setForm((f) => (f ? { ...f, yieldQty: v } : f));
  const setLoss = (v: string) => setForm((f) => (f ? { ...f, loss: v } : f));
  const setLine = (i: number, patch: Partial<LineChoice>) =>
    setForm((f) => (f ? { ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : f));

  function read() {
    const rs = parseRecipeSheet(text);
    if (rs.length === 0) { toast("No recipe found in that — is the ITEM NO header row included?", { tone: "danger" }); return; }
    setParsed(rs);
    setAt(0);
    setDone({ saved: 0, skipped: 0 });
  }

  const placed = lineChoices.filter((c) => c.itemId != null).length;
  const outItem = outItemId == null ? null : items.find((i) => i.id === outItemId) ?? null;
  const clash = [...existingNames, ...savedNames].some((n) => n.trim().toUpperCase() === name.trim().toUpperCase());

  const blockers: string[] = [];
  if (!name.trim()) blockers.push("It needs a name.");
  if (clash) blockers.push("There is already a recipe with that name.");
  if (!outItem) blockers.push("Say what comes out of it.");
  if (!(Number(yieldQty) > 0)) blockers.push("Say how many one batch makes.");
  if (lineChoices.length === 0) blockers.push("It has no materials.");
  if (placed !== lineChoices.length) blockers.push(`${lineChoices.length - placed} material${lineChoices.length - placed === 1 ? " is" : "s are"} not placed yet.`);

  async function save() {
    if (!current || !outItem) return;
    setBusy(true);
    const res = await createRecipeAction({
      name: name.trim(),
      outputItemId: outItem.id,
      yieldQty: Number(yieldQty),
      yieldUom: outItem.uom || "PCS",
      expectedLossPercent: Number(loss) || 0,
      notes: `Read from the costing workbook — block at row ${current.headerRow}.`,
      lines: lineChoices.map((c) => ({
        itemId: c.itemId!,
        kind: c.kind,
        qty: Number(c.qty),
        uom: c.uom.trim() || null,
      })),
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not save it.", { tone: "danger" }); return; }

    /* Remember every wording this person settled, so the next recipe using it
       is already answered. This is a record of a DECISION, not a guess. */
    const next = { ...remembered };
    current.lines.forEach((l, i) => {
      const id = lineChoices[i]?.itemId;
      if (id != null) next[stripIngredientQty(l.name)] = id;
    });
    setRemembered(next);
    saveRemembered(next);

    setSavedNames((n) => [...n, name.trim()]);
    setDone((d) => ({ ...d, saved: d.saved + 1 }));
    setAt((i) => i + 1);
    toast(`${name.trim()} saved as a draft.`, { tone: "success" });
  }

  /* ------------------------------ the paste step ------------------------------ */
  if (!parsed) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3 text-sm leading-relaxed text-fg-muted">
          <p className="text-fg">Copy a sheet out of the costing workbook and paste it here — headers and all.</p>
          <p className="mt-1">
            Select from the row that says <strong className="text-fg">ITEM NO</strong> down past the last{" "}
            <strong className="text-fg">TOTAL COST</strong>, including the columns to its left where the names are.
            A whole sheet at once is fine; it will be split into its recipes.
          </p>
          {/* ⚠️ Said out loud, because it is the thing most likely to surprise
              somebody who spent years maintaining those price columns. */}
          <p className="mt-2 flex items-start gap-2 text-fg-subtle">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              The prices in the sheet are <strong className="text-fg">not brought across</strong>. A recipe here costs
              itself from what was actually paid for the materials, so it moves on its own when a price moves.
            </span>
          </p>
        </div>

        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} spellCheck={false}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-fg outline-none focus:border-accent"
          placeholder={"ITEM NO\tUSED\tGM\tPRICE PER PACKING\t\t\tPRICE\nCooking cream\t600\tGM\t1000\tML\t13,000\t7,800"} />

        <button type="button" onClick={read} disabled={!text.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
          Read it <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  /* ------------------------------ finished ------------------------------ */
  if (!current) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center">
          <Check size={20} className="mx-auto text-success" />
          <p className="mt-2 text-base font-medium text-fg">
            {done.saved} recipe{done.saved === 1 ? "" : "s"} written down.
          </p>
          <p className="mt-1 text-sm text-fg-subtle">
            {done.skipped > 0 ? `${done.skipped} passed over. ` : ""}
            Each one is a <strong className="text-fg">draft</strong> until somebody makes it active.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <a href="/cocozuri/recipes"
              className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90">
              Go to the recipes
            </a>
            <button type="button" onClick={() => { setParsed(null); setText(""); }}
              className="h-8 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg">
              Paste another sheet
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ one recipe ------------------------------ */
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
        <span className="font-medium text-fg">{at + 1} of {parsed.length}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-success">{done.saved} saved</span>
        {done.skipped > 0 && <><span className="text-fg-subtle">·</span><span className="text-fg-muted">{done.skipped} passed over</span></>}
        <span className="ml-auto text-xs text-fg-subtle">from row {current.headerRow} of the sheet</span>
      </div>

      {current.problems.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          {current.problems.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}

      <div className="grid gap-3 rounded-lg border border-border bg-bg-elev p-3.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Call it</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD}
            placeholder="The recipe's name" />
          {clash && <span className="text-xs text-danger">A recipe already has that name.</span>}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">What comes out</span>
          <Combobox
            key={`out-${at}`}
            options={outOptions}
            defaultValue={outItem ? labelOf(outItem) : ""}
            placeholder="Pick it off the shelf"
            onCommit={(v) => setOutItemId(byLabel.get(v)?.id ?? null)}
          />
          {!outItem && current.title && (
            <span className="text-xs text-fg-subtle">
              Nothing on that shelf is called “{current.title}”. Pick it, or add the item first — nothing is created here.
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">One batch makes</span>
            <input value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} inputMode="decimal"
              className={`${FIELD} text-right tabular`} placeholder="e.g. 32" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Expected loss %</span>
            <input value={loss} onChange={(e) => setLoss(e.target.value)} inputMode="decimal"
              className={`${FIELD} text-right tabular`} placeholder="0" />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        <div className="flex items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            Materials — {placed} of {lineChoices.length} placed
          </span>
          <span className="ml-auto text-xs text-fg-subtle">as the sheet wrote them → what they are here</span>
        </div>

        {current.lines.map((l, i) => {
          /* ⚠️ Never `lineChoices[i]!`. The assertion is what turned a
             one-frame gap into a blank error page. */
          const c = lineChoices[i];
          if (!c) return null;
          const chosen = c.itemId == null ? null : items.find((x) => x.id === c.itemId) ?? null;
          const how = matLocId != null ? suggestMaterial(l.name, items, matLocId, remembered)?.how : undefined;
          return (
            <div key={`${l.row}-${i}`} className="grid items-center gap-2 border-b border-border px-3 py-1.5 last:border-0 lg:grid-cols-[minmax(0,1fr)_90px_70px_minmax(0,1.2fr)_120px]">
              <span className="min-w-0 truncate text-sm text-fg" title={l.name}>{l.name}</span>
              <input value={c.qty} inputMode="decimal"
                onChange={(e) => setLine(i, { qty: e.target.value })}
                className={`${FIELD} text-right tabular`} />
              <input value={c.uom}
                onChange={(e) => setLine(i, { uom: e.target.value })}
                className={FIELD} placeholder="unit" />
              <div className="min-w-0">
                <Combobox
                  key={`mat-${at}-${i}`}
                  options={matOptions}
                  defaultValue={chosen ? labelOf(chosen) : ""}
                  placeholder="Which material is this?"
                  onCommit={(v) => setLine(i, { itemId: byLabel.get(v)?.id ?? null })}
                />
                {/* ⚠️ A SUGGESTION SAYS SO. "Butter 150 gm" matching "Butter" is
                    the quantity being stripped out of the name, which is a guess
                    a person has to look at — not a match. */}
                {chosen && how === "stripped" && (
                  <span className="text-xs text-warn">Guessed from the name — check it.</span>
                )}
                {chosen && how === "remembered" && (
                  <span className="text-xs text-fg-subtle">You matched this wording before.</span>
                )}
                {!chosen && (
                  <span className="text-xs text-danger">Not on that shelf — pick it, or add the item first.</span>
                )}
              </div>
              {/* ⚠️ `FluidSelect`'s outer span is inline-block, so the button's
                  own w-full resolves against a shrink-wrapped parent and the
                  control comes out the width of its longest option. `w-full`
                  goes on the OUTER span — see DESIGN_SYSTEM.md. */}
              <FluidSelect
                className="w-full"
                value={c.kind}
                options={CZ_RECIPE_KINDS.map((k) => ({ value: k.key, label: k.label }))}
                onSelect={(v) => setLine(i, { kind: v as CzRecipeKind })}
              />
            </div>
          );
        })}

        {lineChoices.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-fg-subtle">
            No materials could be read out of this block.
          </p>
        )}
      </div>

      {blockers.length > 0 && (
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          {blockers.join(" ")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
            "bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50")}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Save it and go on
        </button>
        <button type="button"
          onClick={() => { setDone((d) => ({ ...d, skipped: d.skipped + 1 })); setAt((i) => i + 1); }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg">
          <SkipForward size={13} /> Pass over it
        </button>
        <span className="ml-auto text-xs text-fg-subtle">It lands as a draft — nothing uses it until you make it active.</span>
      </div>

      {current.notes.length > 0 && (
        <details className="rounded-lg border border-border bg-bg-subtle px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <ChevronRight size={11} className="mr-1 inline" />
            What the sheet says around this recipe
          </summary>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{current.notes.join(" · ")}</p>
        </details>
      )}

      <details className="rounded-lg border border-border bg-bg-subtle px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
          <ChevronRight size={11} className="mr-1 inline" />
          Which shelves these come off
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-subtle">What is made goes on</span>
            <FluidSelect
              className="w-full"
              value={String(outLocId ?? "")}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
              onSelect={(v) => setOutLocId(Number(v) || null)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-subtle">Materials come off</span>
            <FluidSelect
              className="w-full"
              value={String(matLocId ?? "")}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
              onSelect={(v) => setMatLocId(Number(v) || null)}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
