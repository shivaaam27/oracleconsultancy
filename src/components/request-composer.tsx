"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Send, Loader2, X, Paperclip, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { useToast } from "./toast";
import { REQUEST_CATEGORIES, type RequestRecipient } from "@/lib/requests-shared";

type RaiseAction = (prev: { error: string } | null, formData: FormData) => Promise<{ error: string } | null>;

/** Raise a request, addressed to one OR several recipients. Used on the staff
 *  portal (allowed people + the owner) and the owner's control centre (anyone). */
export function RequestComposer({
  recipients,
  action,
  allowOwner = false,
  label = "Raise a request",
  categories = REQUEST_CATEGORIES,
}: {
  recipients: RequestRecipient[];
  action: RaiseAction;
  allowOwner?: boolean;
  label?: string;
  categories?: string[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ownerSel, setOwnerSel] = useState(false);
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? recipients.filter((r) => `${r.name} ${r.relation}`.toLowerCase().includes(q)) : recipients;
  }, [filter, recipients]);

  const count = selected.size + (ownerSel ? 1 : 0);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(form: HTMLFormElement) {
    if (count === 0) {
      toast("Choose at least one person to send this to.", { tone: "danger" });
      return;
    }
    const fd = new FormData(form);
    fd.set("category", category);
    fd.set("recipientIds", [...selected].join(","));
    fd.set("toOwner", ownerSel ? "1" : "");
    setBusy(true);
    startTransition(async () => {
      const res = await action(null, fd);
      setBusy(false);
      if (res?.error) toast(res.error, { tone: "danger" });
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-accent text-accent-fg px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <Plus size={16} /> {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="rounded-2xl bg-bg-elev ring-1 ring-border p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-fg-muted hover:text-fg">
          <X size={16} />
        </button>
      </div>

      <div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          To {count > 0 && <span className="text-accent">· {count} selected</span>}
        </span>
        {recipients.length > 8 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search people…"
            className="mt-1 w-full rounded-md bg-bg-elev text-xs ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        )}
        <div className="mt-1 max-h-44 overflow-y-auto rounded-md ring-1 ring-border divide-y divide-border/50">
          {allowOwner && (
            <button
              type="button"
              onClick={() => setOwnerSel((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-bg-muted/50"
            >
              <span>Oracle Consultancy <span className="text-fg-subtle text-xs">· the owner</span></span>
              {ownerSel && <Check size={15} className="text-accent shrink-0" />}
            </button>
          )}
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggle(r.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-bg-muted/50"
            >
              <span className="min-w-0 truncate">
                {r.name} <span className="text-fg-subtle text-xs">· {r.relation}</span>
              </span>
              {selected.has(r.id) && <Check size={15} className="text-accent shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && !allowOwner && <p className="px-3 py-3 text-xs text-fg-muted">No one to show.</p>}
        </div>
      </div>

      <div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Type</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? "" : c)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs ring-1 transition-colors",
                category === c ? "bg-accent-soft text-accent ring-accent/30" : "text-fg-muted ring-border hover:bg-bg-muted"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="…or type your own"
          className="mt-1.5 w-full rounded-md bg-bg-elev text-xs ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">What's needed?</span>
        <input
          name="title"
          required
          maxLength={140}
          placeholder="e.g. New laptop for design work"
          className="mt-1 w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Details (optional)</span>
        <textarea
          name="body"
          rows={3}
          placeholder="Add anything that helps."
          className="mt-1 w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
        <Paperclip size={14} />
        <span>Add a photo or file (optional)</span>
        <input type="file" name="attachment" accept="image/*,.pdf,.doc,.docx" className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-bg-muted file:px-2 file:py-1 file:text-xs file:text-fg-muted" />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send request
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
