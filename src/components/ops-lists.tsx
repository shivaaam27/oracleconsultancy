"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OPS MASTER LISTS — one surface, eight lists (Stage 1).
//
// ⚠️ This deliberately does NOT use `ReferenceAdmin`, and the first version did.
// That widget is the older rounded-glass style: a card per section, a ring
// round the add box, another round every row. Dropped inside a card that
// already has a border it reads as boxes inside boxes — "so much boxes, and
// borders", which is the owner's exact complaint about an earlier screen.
//
// So the layout here is the projects Setup tab, to the pixel: one card, a chip
// row to choose a list, hairline-separated rows, actions that appear on hover,
// and everything rare folded behind one quiet line. Desk rules: hairlines
// separate, shadows only float (DESIGN_SYSTEM.md).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, Loader2, Plus, Pencil, GitMerge, Trash2, Check, X, Sparkles, Copy, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
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
  const items = byKind.get(kind) ?? [];

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
      {/* ⚠️ No company picker here — it moved into the tabs, where it covers
          both screens. Two pickers on one page is two places to disagree. */}
      <p className="text-xs text-fg-subtle">
        Each company keeps its own lists. Orders raised under it pick from these.
      </p>

      {(note || error) && (
        <p role="alert" className={cn("rounded-md px-2.5 py-1.5 text-sm",
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
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
                  kind === k.kind ? "bg-bg-elev font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                {k.plural}
                <span className={cn("tabular text-xs", n ? "text-fg-subtle" : "text-fg-subtle/50")}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2.5">
          <p className="mb-2 text-xs text-fg-subtle">{meta.blurb}</p>

          <AddRow
            placeholder={meta.placeholder}
            noun={meta.noun.toLowerCase()}
            onAdd={(name) => createOpsRefAction(companyId, kind, name)}
            onDone={() => router.refresh()}
          />

          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-subtle">
              No {meta.plural.toLowerCase()} yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {items.map((r) => (
                <RefRow key={r.id} item={r} siblings={items} onRun={run} pending={pending} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── everything else, folded away behind one quiet line ── */}
      <button type="button" onClick={() => setShowMore((v) => !v)}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ChevronDown size={13} className={cn("transition-transform", showMore && "rotate-180")} />
        {showMore ? "Hide" : "More"} — exchange rate, standard lists, copy from another company
      </button>

      {showMore && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-muted">Exchange rate offered on a new line</span>
            <input
              value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal"
              placeholder="2,500"
              className="tabular h-8 w-28 rounded-md border border-border bg-bg px-2 text-right text-base outline-none focus:border-accent"
            />
            <button type="button" disabled={pending} onClick={() => run(() => setOpsExRateAction(rate))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-40">
              <Check size={13} /> Save
            </button>
            <span className="text-xs text-fg-subtle">
              A starting figure. Every line keeps its own, frozen when entered and editable after.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending}
              onClick={() => run(() => seedOpsStarterListsAction(companyId))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-60">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Add the standard statuses, modes and ageing bands
            </button>
            <span className="text-xs text-fg-subtle">
              Those three only — clients, suppliers, agents and origins are yours to type.
            </span>
          </div>

          {companies.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <FluidSelect
                value={copyFrom} placeholder="Copy lists from…" buttonClassName="h-8"
                options={companies.filter((c) => c.id !== companyId).map((c) => ({ value: String(c.id), label: c.name }))}
                onSelect={setCopyFrom}
              />
              <button type="button" disabled={pending || !copyFrom}
                onClick={() => run(() => copyOpsRefsFromAction(companyId, Number(copyFrom)))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-40">
                <Copy size={13} /> Copy
              </button>
              <span className="text-xs text-fg-subtle">Adds what is missing. Nothing is overwritten.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── add row ── */

function AddRow({
  placeholder, noun, onAdd, onDone,
}: {
  placeholder: string; noun: string;
  onAdd: (name: string) => Promise<Res>; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    start(async () => {
      setErr(null);
      const res = await onAdd(name);
      if (!res.ok) { setErr(res.error ?? "Couldn't add."); return; }
      setName(""); onDone();
    });
  };

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={placeholder}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <button type="button" onClick={submit} disabled={pending || !name.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg disabled:opacity-40">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      <p className="mt-1 text-xs text-fg-subtle">
        You can also add a {noun} straight from the dropdown while entering an order — you do
        not have to come here.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── a row ── */

function RefRow({
  item, siblings, onRun, pending,
}: {
  item: OpsRef; siblings: OpsRef[];
  onRun: (fn: () => Promise<Res>) => void; pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [into, setInto] = useState("");

  if (editing) {
    return (
      <li className="flex items-center gap-1.5 py-1">
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRun(() => renameOpsRefAction(item.id, draft)); setEditing(false); }
            if (e.key === "Escape") { setEditing(false); setDraft(item.name); }
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-bg px-2 text-base outline-none" />
        <button type="button" onClick={() => { onRun(() => renameOpsRefAction(item.id, draft)); setEditing(false); }}
          className="rounded bg-accent p-1 text-accent-fg"><Check size={12} /></button>
        <button type="button" onClick={() => { setEditing(false); setDraft(item.name); }}
          className="p-1 text-fg-subtle hover:text-fg"><X size={12} /></button>
      </li>
    );
  }

  if (merging) {
    const others = siblings.filter((s) => s.id !== item.id);
    return (
      <li className="flex flex-wrap items-center gap-1.5 py-1 text-sm">
        <span className="text-fg-muted">Move everything on <strong>{item.name}</strong> to</span>
        <FluidSelect value={into} placeholder="choose…" buttonClassName="h-7"
          options={others.map((o) => ({ value: String(o.id), label: o.name }))}
          onSelect={setInto} />
        <button type="button" disabled={!into}
          onClick={() => { onRun(() => mergeOpsRefsAction(item.id, Number(into))); setMerging(false); }}
          className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-fg disabled:opacity-40">
          Merge
        </button>
        <button type="button" onClick={() => setMerging(false)} className="p-1 text-fg-subtle hover:text-fg">
          <X size={12} />
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 py-1">
      <span className={cn("min-w-0 flex-1 truncate text-base", !item.active && "text-fg-subtle line-through")}>
        {item.name}
      </span>
      {!item.active && <span className="shrink-0 text-xs text-fg-subtle">retired</span>}
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {item.active ? (
          <>
            <button type="button" title="Rename" onClick={() => setEditing(true)}
              className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"><Pencil size={12} /></button>
            {siblings.length > 1 && (
              <button type="button" title="Merge into another" onClick={() => setMerging(true)}
                className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"><GitMerge size={12} /></button>
            )}
            <button type="button" title="Delete (retired instead if an order names it)" disabled={pending}
              onClick={() => { if (confirm(`Delete “${item.name}”?`)) onRun(() => deleteOpsRefAction(item.id)); }}
              className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"><Trash2 size={12} /></button>
          </>
        ) : (
          // A retired entry keeps one action only: bring it back. Renaming
          // something no longer offered would be a change nobody asked for.
          <button type="button" title="Put back on the list" disabled={pending}
            onClick={() => onRun(() => restoreOpsRefAction(item.id))}
            className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"><RotateCcw size={12} /></button>
        )}
      </span>
    </li>
  );
}
