"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CHIP PICKER — a short list as buttons, with "+" to add one without leaving.
//
// For lists of three or four (who pays, whose float) a row of chips beats a
// dropdown: every option is visible and it is one click, not two. What it must
// not do is dead-end you when the option you need is missing — that was the
// complaint, and having to go to the Setup tab mid-entry is exactly the wrong
// shape for an ERP.
//
// So the row ends in a "+" that turns into a small box. Type, press Enter, and
// the entry is added to the project's list AND selected, in one go.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function ChipPicker({
  options, value, onSelect, onCreate, createNoun, placeholder, allowClear = true,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  /** Adds to the underlying list. Omit to make the row read-only. */
  onCreate?: (name: string) => Promise<{ ok: boolean; error?: string; name?: string }>;
  createNoun?: string;
  placeholder?: string;
  /** Clicking the selected chip clears it. */
  allowClear?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () => {
    const name = draft.trim();
    if (!name || !onCreate) return;
    start(async () => {
      setError(null);
      const res = await onCreate(name);
      if (!res.ok) { setError(res.error ?? "Couldn't add that."); return; }
      onSelect(res.name ?? name);
      setDraft("");
      setAdding(false);
    });
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onSelect(allowClear && value === o ? "" : o)}
            className={cn(
              "h-8 rounded-md border px-2 text-xs transition-colors",
              value === o
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-bg text-fg-muted hover:text-fg",
            )}
          >
            {o}
          </button>
        ))}

        {onCreate && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title={`Add a new ${createNoun ?? "entry"}`}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-fg-subtle hover:border-accent hover:text-accent"
          >
            <Plus size={12} /> New
          </button>
        )}

        {adding && (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); add(); }
                if (e.key === "Escape") { setAdding(false); setDraft(""); setError(null); }
              }}
              placeholder={placeholder ?? "name"}
              className="h-8 w-32 rounded-md border border-accent bg-bg px-2 text-xs outline-none"
            />
            <button type="button" onClick={add} disabled={pending || !draft.trim()}
              className="inline-flex h-8 items-center rounded-md bg-accent px-2 text-xs font-medium text-accent-fg disabled:opacity-50">
              {pending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setDraft(""); setError(null); }}
              className="text-fg-subtle hover:text-fg">
              <X size={13} />
            </button>
          </span>
        )}
      </div>

      {options.length === 0 && !adding && (
        <p className="mt-1 text-xs text-fg-subtle">
          Nothing on this list yet — press <strong>New</strong>.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
