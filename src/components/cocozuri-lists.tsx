"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Combine, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { CocozuriHelp } from "@/components/cocozuri-help";
import {
  CZ_LIST_KINDS, likelyDuplicates, listBlockers,
  type CzListKind, type CzListValue,
} from "@/lib/cocozuri-lists-shared";
import {
  addListValueAction, deleteListValueAction, mergeListValuesAction, renameListValueAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * The lists you pick from — categories, brands, count units, pack units.
 *
 * ⚠️ A VALUE IS TEXT ON THE PRODUCT, NOT A LINK TO THIS ROW. So renaming here
 * rewrites the word everywhere it is used, and merging is what turns `GM` and
 * `GRM` back into one unit.
 * ------------------------------------------------------------------ */

export function CocozuriLists({
  lists,
}: {
  lists: Record<CzListKind, CzListValue[]>;
}) {
  const [kind, setKind] = useState<CzListKind>("category");
  const [q, setQ] = useState("");
  const values = lists[kind] ?? [];

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? values.filter((v) => v.value.toLowerCase().includes(term)) : values;
  }, [values, q]);

  const pairs = useMemo(
    () => likelyDuplicates(values.map((v) => ({ id: v.id, value: v.value }))),
    [values],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {CZ_LIST_KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)}
              className={`inline-flex h-8 items-center rounded-md px-2.5 text-sm transition-colors ${
                kind === k.key
                  ? "bg-accent text-accent-fg font-medium"
                  : "border border-border text-fg-muted hover:text-fg"}`}>
              {k.label}
              <span className={`ml-1.5 text-xs ${kind === k.key ? "opacity-70" : "text-fg-subtle"}`}>
                {(lists[k.key] ?? []).length}
              </span>
            </button>
          ))}
        </div>
        <span className="grow" />
        <CocozuriHelp title="Lists">
          <p>
            These are the words you pick from when adding a product or a stock item. Keeping them
            on a list rather than typing them free is what stops <strong>PCS</strong> and
            <strong> Pcs</strong> becoming two different units.
          </p>
          <p>
            <strong>Renaming</strong> changes the word everywhere it is used, not just here.
            <strong> Merging</strong> is for when the same thing was typed two ways — pick which
            spelling survives, and every record moves onto it.
          </p>
          <p>
            A value cannot be deleted while anything still uses it. Merge it instead, or change
            those records first.
          </p>
        </CocozuriHelp>
      </div>

      {/* ⚠️ SUGGESTED, NEVER ACTED ON. Whether GM and GRM are one unit is a
          business decision — the same reason the product duplicates were
          imported deliberately rather than collapsed on the way in. */}
      {pairs.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5">
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <span>
              <strong>{pairs.length}</strong> pair{pairs.length === 1 ? "" : "s"} look like the same
              thing typed twice. Nothing is merged for you — pick which spelling to keep.
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pairs.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded border border-warn/30 bg-bg px-1.5 py-0.5 text-xs text-fg-muted">
                {p.a.value} <Combine size={10} className="text-warn" /> {p.b.value}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a value…"
          wrapperClassName="w-[16rem]" className="text-sm" />
        <span className="grow" />
        <AddValue kind={kind} existing={values} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)_170px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Value</span>
            <span className="text-right">Used on</span>
            <span>Merge into</span>
            <span className="text-right">&nbsp;</span>
          </div>
          {shown.map((v) => (
            <ValueRow key={v.id} value={v} siblings={values} />
          ))}
          {shown.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">
              {values.length === 0
                ? "Nothing on this list yet. Add the first one above."
                : "Nothing matches that."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Adding one
 * ------------------------------------------------------------------ */

function AddValue({ kind, existing }: { kind: CzListKind; existing: CzListValue[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const blockers = value.trim() ? listBlockers(value, existing) : [];
  const one = CZ_LIST_KINDS.find((k) => k.key === kind)?.one ?? "value";

  async function save() {
    setBusy(true);
    const res = await addListValueAction(kind, value);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not save.", { tone: "danger" }); return; }
    toast(`${value.trim()} added.`, { tone: "success" });
    setValue("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
        <Plus size={13} /> New {one}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && !blockers.length && value.trim()) void save(); }}
        className={`${FIELD} w-[14rem]`} placeholder={`A new ${one}`} />
      <button type="button" disabled={busy || !value.trim() || blockers.length > 0}
        onClick={() => void save()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Add
      </button>
      <button type="button" onClick={() => { setOpen(false); setValue(""); }}
        className="h-8 rounded-md px-2 text-sm text-fg-muted hover:text-fg">Cancel</button>
      {blockers.length > 0 && <span className="text-xs text-danger">{blockers[0]}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * One row
 * ------------------------------------------------------------------ */

function ValueRow({ value, siblings }: { value: CzListValue; siblings: CzListValue[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value.value);
  const [busy, setBusy] = useState(false);
  const [mergeInto, setMergeInto] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string; changed?: number }>, label: (n: number) => string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label(res.changed ?? 0), { tone: "success" });
    setEditing(false);
    setMergeInto("");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)_170px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
      {editing ? (
        <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} autoFocus
          aria-label="Rename this value" />
      ) : (
        <span className="min-w-0 truncate text-sm text-fg" title={value.value}>{value.value}</span>
      )}

      <span className={`text-right text-sm tabular ${value.usedBy > 0 ? "text-fg-muted" : "text-fg-subtle"}`}>
        {value.usedBy > 0 ? value.usedBy : "—"}
      </span>

      {/* ⚠️ Merging is offered on the row rather than hidden in a menu, because
          the whole reason this screen exists is that the same thing got typed
          twice and somebody has to say so. */}
      <span className="min-w-0">
        <FluidSelect
          value={mergeInto}
          onSelect={(v) => setMergeInto(v)}
          placeholder="—"
          options={[
            { value: "", label: "—" },
            ...siblings.filter((s) => s.id !== value.id).map((s) => ({ value: String(s.id), label: s.value })),
          ]} />
      </span>

      <span className="flex items-center justify-end gap-1">
        {mergeInto ? (
          <button type="button" disabled={busy}
            onClick={() => void run(
              () => mergeListValuesAction(Number(mergeInto), value.id),
              (n) => `Merged. ${n} record${n === 1 ? "" : "s"} moved over.`,
            )}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-warn/15 px-1.5 text-xs font-medium text-warn hover:bg-warn/25 disabled:opacity-60">
            <Combine size={12} /> Merge
          </button>
        ) : editing ? (
          <>
            <button type="button" disabled={busy || !name.trim()}
              onClick={() => void run(
                () => renameListValueAction(value.id, name),
                (n) => n > 0 ? `Renamed. ${n} record${n === 1 ? "" : "s"} updated.` : "Renamed.",
              )}
              className="h-7 rounded-md px-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-60">
              Save
            </button>
            <button type="button" onClick={() => { setEditing(false); setName(value.value); }}
              className="h-7 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg">Cancel</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setEditing(true)}
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
              <Pencil size={12} /> Rename
            </button>
            {/* ⚠️ Refused while anything uses it, and the server says how many. */}
            <button type="button" disabled={busy}
              title={value.usedBy > 0 ? `Used on ${value.usedBy} record${value.usedBy === 1 ? "" : "s"} — merge it instead` : "Remove it"}
              onClick={() => {
                if (!confirm(`Remove ${value.value} from the list?`)) return;
                void run(() => deleteListValueAction(value.id), () => `${value.value} removed.`);
              }}
              className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
              <Trash2 size={12} />
            </button>
          </>
        )}
        {mergeInto && (
          <button type="button" onClick={() => setMergeInto("")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:text-fg">
            <X size={12} />
          </button>
        )}
      </span>
    </div>
  );
}
