"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import { FIELD } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";
import type { CzStockItem, CzStockLocation } from "@/lib/cocozuri-stock-shared";
import {
  createStockLocationAction, deleteStockLocationAction, updateStockLocationAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * The shelves stock is counted on.
 *
 * ⚠️ THIS HAD NO ADDRESS UNTIL NOW. It was a bottom sheet reached from a button
 * inside Stock items, which is not somewhere anybody looks for a thing — and a
 * shelf is set up BEFORE the items that sit on it, so it belongs in the rail
 * ahead of them rather than hidden behind them.
 *
 * ⚠️ THE THIRD COLUMN'S NAME IS DATA, NOT CODE. There are four stock sheets and
 * each heads its third movement column with a different word — the shop RETURN,
 * the kitchen DA/SA/TA, raw materials DAMAGE. Nobody has said what DA/SA/TA
 * means, including the owner, so it is stored as written and never translated
 * into a guess.
 * ------------------------------------------------------------------ */

export function CocozuriShelves({
  locations, items,
}: {
  locations: CzStockLocation[];
  items: CzStockItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [thirdLabel, setThirdLabel] = useState("");

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grow" />
        <CocozuriHelp title="Shelves">
          <p>
            A shelf is a place stock is <strong>counted</strong> — the kitchen, the shop, the
            raw-material store. Every stock item sits on exactly one, and its movements are filed
            against that shelf.
          </p>
          <p>
            <strong>Each day sheet heads its third movement column with a different word</strong> —
            the shop calls it RETURN, the kitchen DA/SA/TA, raw materials DAMAGE. Nobody has been
            able to say what DA/SA/TA stands for, so it is kept exactly as it is written rather than
            translated into a guess.
          </p>
          <p>
            <strong>A shelf is normally taken out of use, not deleted.</strong> Its movements are the
            history of a real place; taking it out of use hides it from the forms and leaves every
            figure ever counted on it exactly where it is. An empty one added by mistake can go.
          </p>
          <p>
            <strong>An item&rsquo;s shelf cannot change once it exists</strong>, because its
            movements are filed against it. The same chocolate on two shelves is two items, joined
            by the product they are both sold as.
          </p>
        </CocozuriHelp>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
            <Plus size={13} /> Another shelf
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-lg border border-border bg-bg-elev px-3 py-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="What it is called">
              <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD}
                placeholder="Kitchen, Shop, Raw materials…" autoFocus />
            </Field>
            <Field label="Its third column">
              <input value={thirdLabel} onChange={(e) => setThirdLabel(e.target.value)} className={FIELD}
                placeholder="Return, DA/SA/TA, Damage…" />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || !name.trim()}
              onClick={() => void run("Shelf added.", async () => {
                const res = await createStockLocationAction({ name, thirdLabel: thirdLabel || undefined });
                if (res.ok) { setAdding(false); setName(""); setThirdLabel(""); }
                return res;
              })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
              <Plus size={13} /> Add the shelf
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-[minmax(0,1fr)_130px_70px_120px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Shelf</span>
            <span>Third column</span>
            <span className="text-right">Items</span>
            <span className="text-right">&nbsp;</span>
          </div>
          {locations.map((l) => (
            <ShelfRow key={l.id} shelf={l}
              count={items.filter((i) => i.locationId === l.id && !i.archived).length}
              busy={busy} onRun={run} />
          ))}
          {locations.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">
              No shelves yet. Add the places stock is counted — the kitchen, the shop, the store.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ShelfRow({
  shelf, count, busy, onRun,
}: {
  shelf: CzStockLocation;
  count: number;
  busy: boolean;
  onRun: (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(shelf.name);
  const [thirdLabel, setThirdLabel] = useState(shelf.thirdLabel);

  if (editing) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_130px_70px_120px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
        <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} aria-label="Shelf name" />
        <input value={thirdLabel} onChange={(e) => setThirdLabel(e.target.value)} className={FIELD} aria-label="Third column" />
        <span className="text-right text-sm tabular text-fg-subtle">{qtyText(count)}</span>
        <span className="flex justify-end gap-1">
          <button type="button" disabled={busy || !name.trim()}
            onClick={() => void onRun("Shelf saved.", async () => {
              const res = await updateStockLocationAction(shelf.id, { name, thirdLabel });
              if (res.ok) setEditing(false);
              return res;
            })}
            className="h-7 rounded-md px-1.5 text-xs text-accent hover:underline disabled:opacity-60">Save</button>
          <button type="button" onClick={() => { setEditing(false); setName(shelf.name); setThirdLabel(shelf.thirdLabel); }}
            className="h-7 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg">Cancel</button>
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_130px_70px_120px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
      <span className="min-w-0 truncate text-sm text-fg">
        {shelf.name}
        {!shelf.active && <span className="ml-1.5 text-xs text-fg-subtle">not in use</span>}
      </span>
      <span className="truncate text-sm text-fg-muted">{shelf.thirdLabel}</span>
      <span className="text-right text-sm tabular text-fg-subtle">{qtyText(count)}</span>
      <span className="flex justify-end gap-1">
        <button type="button" disabled={busy} onClick={() => setEditing(true)}
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
          <Pencil size={12} /> Edit
        </button>
        {/* ⚠️ A shelf is never deleted — its movements are the history of a real
            place. Taking it out of use hides it from the forms and leaves every
            figure that was ever counted on it exactly where it is. */}
        <button type="button" disabled={busy}
          title={shelf.active ? "Take it out of use" : "Put it back in use"}
          onClick={() => void onRun(shelf.active ? "Out of use." : "Back in use.",
            () => updateStockLocationAction(shelf.id, { active: !shelf.active }))}
          className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
          <Archive size={12} />
        </button>
        {/* ⚠️ A shelf with items or movements on it is refused, by name and
            number. An empty one added by mistake can simply go. */}
        <button type="button" disabled={busy} title="Delete it for good"
          onClick={() => {
            if (!confirm(`Delete ${shelf.name}? It will be refused if anything is still on it.`)) return;
            void onRun(`${shelf.name} deleted.`, () => deleteStockLocationAction(shelf.id));
          }}
          className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
          <Trash2 size={12} />
        </button>
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /* ⚠️ `justify-end`, AND IT IS NOT COSMETIC — see the note in the item sheet. */
  return (
    <label className="flex h-full flex-col justify-end gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}
