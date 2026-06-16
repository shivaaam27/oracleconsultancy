"use client";

import { useState, useTransition } from "react";
import { X, Plus, Check, Loader2 } from "lucide-react";
import { useToast } from "./toast";

type SaveResult = { ok: true } | { ok: false; error: string };

/** Owner editor for the request-type chips (stored in settings). */
export function RequestTypesEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: string[];
  onSave: (list: string[]) => Promise<SaveResult>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [list, setList] = useState<string[]>(initial);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function add() {
    const v = val.trim();
    if (!v) return;
    if (!list.some((c) => c.toLowerCase() === v.toLowerCase())) setList([...list, v]);
    setVal("");
  }

  function save() {
    setBusy(true);
    startTransition(async () => {
      const res = await onSave(list);
      setBusy(false);
      if (!res.ok) return toast(res.error, { tone: "danger" });
      toast("Request types saved.", { tone: "success" });
      onClose();
    });
  }

  return (
    <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Manage request types</p>
        <button type="button" onClick={onClose} aria-label="Close" className="text-fg-muted hover:text-fg">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-fg-muted">
        The quick-pick chips on everyone&apos;s &ldquo;Raise a request&rdquo; form. Staff can still type a custom one.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2.5 py-1 text-xs">
            {c}
            <button type="button" onClick={() => setList(list.filter((x) => x !== c))} aria-label={`Remove ${c}`} className="text-fg-subtle hover:text-danger">
              <X size={12} />
            </button>
          </span>
        ))}
        {list.length === 0 && <span className="text-xs text-fg-muted">No types yet — add some below.</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a type…"
          className="flex-1 rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-bg-muted px-3 py-2 text-xs font-medium ring-1 ring-border hover:text-fg">
          <Plus size={13} /> Add
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save types
      </button>
    </div>
  );
}
